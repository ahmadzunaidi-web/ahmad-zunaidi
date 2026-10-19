import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { parseWebhook, verifySignature } from './channels/whatsapp.js';
import type { Config } from './config.js';
import type { EventHub } from './core/events.js';
import type { Pipeline } from './core/pipeline.js';
import { KnowledgeError, type Knowledge } from './knowledge/ingest.js';
import type { LlmProvider } from './agent/llm.js';
import { runAgent, type HistoryMsg } from './agent/runtime.js';
import { simEnv } from './agent/sim.js';
import type { ConvState } from './agent/skills.js';
import { emptyDraft, SKILL_KEYS, type Store } from './store.js';
import { INSTRUCTIONS_LIMIT, type AgentDraft, type ConvEvent, type SkillKey } from './types.js';
import type { Workspace } from './workspace.js';
import { buildTools } from './agent/skills.js';
import { maskActions, restoreSecrets, validateHttpActions } from './agent/http-skill.js';
import { reviewAgent, summarize } from './agent/review.js';
import { newHookToken, triggerVarsFromBody, type WorkflowEngine } from './workflow/engine.js';
import { LIMITS, type Graph, type Trigger, type WorkflowSettings } from './workflow/types.js';
import { structuralIssues, validateGraph, validateTrigger } from './workflow/validate.js';
import { normalizeDraft } from './store.js';
import { baseMime, SERVABLE_MIMES, type MediaService } from './media/media.js';

declare module 'fastify' {
  interface FastifyRequest { rawBody?: Buffer }
}

export interface AppDeps {
  cfg: Config;
  store: Store;
  pipeline: Pipeline;
  hub: EventHub;
  workspace: Workspace;
  knowledge: Knowledge;
  engine: WorkflowEngine;
  media: MediaService;
  provider: LlmProvider;
  /** Outbound HTTP for the HTTP skill/step (injectable for tests). */
  fetchImpl?: typeof fetch;
  /** Directory holding index.html (the inbox UI). */
  publicDir?: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const bad = (m: string) => new HttpError(400, m);
const notFound = (m = 'not found') => new HttpError(404, m);

const here = dirname(fileURLToPath(import.meta.url));

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function buildApp(d: AppDeps): { app: FastifyInstance; drain: () => Promise<void> } {
  const { cfg, store, pipeline, hub, workspace, knowledge, engine, media } = d;
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' || process.env.VITEST ? false : {
      level: 'info',
      // the SSE stream authenticates with ?token=, so never write it to the logs
      serializers: { req: (req) => ({ method: req.method, url: String(req.url).replace(/([?&]token=)[^&]*/g, '$1REDACTED') }) },
    },
    bodyLimit: 5_000_000,
  });
  const inflight = new Set<Promise<void>>();

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    req.rawBody = body;
    if (!body.length) return done(null, {});
    try { done(null, JSON.parse(body.toString('utf8'))); } catch { done(bad('Invalid JSON') as Error, undefined); }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err instanceof HttpError ? err.status : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    const issues = (err as { issues?: unknown }).issues;
    reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message, ...(issues ? { issues } : {}) });
  });

  // ---- admin auth for /api/* -------------------------------------------------------------------
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || !cfg.adminToken) return;
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const q = (req.query as Record<string, string> | undefined)?.token ?? '';
    if (!(header && safeEqual(header, cfg.adminToken)) && !(q && safeEqual(q, cfg.adminToken))) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ---- static UI -------------------------------------------------------------------------------
  const publicDir = d.publicDir ?? join(here, '..', 'public');
  app.get('/', async (_req, reply) => {
    reply.type('text/html; charset=utf-8').send(readFileSync(join(publicDir, 'index.html'), 'utf8'));
  });
  app.get('/health', async () => ({ ok: true }));
  app.get('/favicon.ico', async (_req, reply) => reply.code(204).send());

  // ---- WhatsApp webhook ------------------------------------------------------------------------
  app.get('/webhook/whatsapp', async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q['hub.mode'] === 'subscribe' && cfg.waVerifyToken && safeEqual(q['hub.verify_token'] ?? '', cfg.waVerifyToken)) {
      return reply.type('text/plain').send(q['hub.challenge'] ?? '');
    }
    return reply.code(403).send('forbidden');
  });

  app.post('/webhook/whatsapp', async (req, reply) => {
    const raw = req.rawBody ?? Buffer.alloc(0);
    if (cfg.waAppSecret) {
      if (!verifySignature(cfg.waAppSecret, raw, req.headers['x-hub-signature-256'] as string | undefined)) {
        return reply.code(401).send({ error: 'bad signature' });
      }
    } else if (!cfg.allowUnsigned) {
      app.log.error('WA_APP_SECRET is not set; refusing unsigned webhook (set ALLOW_UNSIGNED=1 for local dev only)');
      return reply.code(401).send({ error: 'signature verification not configured' });
    }
    const { messages, statuses } = parseWebhook(req.body);
    // Acknowledge fast (Meta retries slow endpoints); process in arrival order in the background.
    const job = (async () => {
      for (const s of statuses) pipeline.handleStatus(s);
      for (const m of messages) {
        try { await pipeline.handleInbound(m); } catch (e) { app.log.error({ err: (e as Error).message }, 'inbound failed'); }
      }
    })().finally(() => inflight.delete(job));
    inflight.add(job);
    return reply.code(200).send({ ok: true });
  });

  // ---- config ----------------------------------------------------------------------------------
  app.get('/api/config', async () => ({
    workspace,
    llm: d.provider.name,
    whatsappConfigured: !!(cfg.waAccessToken && cfg.waPhoneNumberId),
    echoFallback: cfg.echoFallback,
    devSimulator: cfg.devSimulator,
    instructionsLimit: INSTRUCTIONS_LIMIT,
    embedding: { configured: !!knowledge.embedder, model: knowledge.embeddingModel },
    defaultAgentId: store.getSetting('default_agent_id'),
  }));

  app.put('/api/settings/default-agent', async (req) => {
    const id = (req.body as { agent_id?: number | null }).agent_id ?? null;
    if (id != null && !store.getAgent(Number(id))) throw notFound('agent not found');
    store.setSetting('default_agent_id', id == null ? null : Number(id));
    return { defaultAgentId: id };
  });

  // ---- inbox -----------------------------------------------------------------------------------
  app.get('/api/conversations', async (req) => {
    const status = (req.query as { status?: string }).status;
    return store.listConversations(status === 'open' || status === 'closed' ? status : undefined);
  });

  const convOr404 = (req: FastifyRequest) => {
    const id = Number((req.params as { id: string }).id);
    const conv = store.getConversation(id);
    if (!conv) throw notFound('conversation not found');
    return conv;
  };

  app.get('/api/conversations/:id', async (req) => {
    const conv = convOr404(req);
    return {
      conversation: conv,
      contact: store.getContact(conv.contact_id),
      messages: store.messages(conv.id),
      comments: store.comments(conv.id),
      media: store.mediaForConversation(conv.id),
      events: store.events(conv.id),
      agent: conv.agent_id ? store.getAgent(conv.agent_id) : null,
    };
  });

  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const conv = convOr404(req);
    const text = String((req.body as { text?: string }).text ?? '').trim();
    if (!text) throw bad('text is required');
    if (conv.handler === 'ai') throw new HttpError(409, 'An AI agent is handling this conversation. Take over first.');
    const msgs = await pipeline.send(conv.id, text, 'human');
    await pipeline.humanActivity(conv.id, 'outgoing');
    return reply.code(msgs.some((m) => m.status === 'failed') ? 502 : 200).send({ messages: msgs });
  });

  app.post('/api/conversations/:id/takeover', async (req) => ({ conversation: pipeline.takeover(convOr404(req).id) }));

  app.post('/api/conversations/:id/assign', async (req) => {
    const conv = convOr404(req);
    const b = req.body as { agent_id?: number; team?: string; user?: string; unassign?: boolean };
    try {
      if (b.unassign) return { conversation: pipeline.unassign(conv.id) };
      if (b.agent_id != null) {
        pipeline.assignToAgent(conv.id, Number(b.agent_id), 'a teammate in the inbox');
        return { conversation: store.getConversation(conv.id) };
      }
      if (b.team || b.user) return { conversation: pipeline.assignToHuman(conv.id, { team: b.team, user: b.user }) };
    } catch (e) { throw bad((e as Error).message); }
    throw bad('Provide agent_id, team, user or unassign');
  });

  app.post('/api/conversations/:id/status', async (req) => {
    const conv = convOr404(req);
    const b = req.body as { status?: string; closing_note?: string; summary?: string };
    if (b.status !== 'open' && b.status !== 'closed') throw bad('status must be open or closed');
    try {
      return { conversation: await pipeline.setStatus(conv.id, b.status, b.closing_note ?? null, b.summary ?? null) };
    } catch (e) { throw bad((e as Error).message); }
  });

  app.post('/api/conversations/:id/comments', async (req) => {
    const conv = convOr404(req);
    const text = String((req.body as { text?: string }).text ?? '').trim();
    if (!text || text.length > 2000) throw bad('text is required (max 2000 characters)');
    const c = store.addComment(conv.id, 'Inbox user', text);
    hub.publish({ type: 'conversation', conversationId: conv.id });
    return { comment: c };
  });

  app.get('/api/events', (req: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    const off = hub.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const ka = setInterval(() => res.write(': ka\n\n'), 25_000);
    req.raw.on('close', () => { clearInterval(ka); off(); });
  });

  // Local simulator so the whole flow can be exercised without a WhatsApp number.
  app.post('/api/dev/simulate', async (req) => {
    if (!cfg.devSimulator) throw notFound();
    const b = req.body as { from?: string; name?: string; text?: string };
    const from = String(b.from ?? '').replace(/\D/g, '');
    const text = String(b.text ?? '').trim();
    if (!from || !text) throw bad('from (digits) and text are required');
    await pipeline.handleInbound({
      waMessageId: `sim.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
      from, name: b.name?.trim() || null, timestamp: Date.now(), type: 'text', text,
    });
    const contact = store.upsertContact(from, null);
    return { conversation: store.lastConversation(contact.id) };
  });

  // ---- media (private files; only types we validated on the way in are ever served) -------------
  app.get('/api/media/:id', async (req, reply) => {
    const row = store.getMedia(Number((req.params as { id: string }).id));
    if (!row || row.status !== 'stored' || !SERVABLE_MIMES.has(baseMime(row.mime))) throw notFound();
    const bytes = media.readBytes(row);
    if (!bytes) throw notFound();
    return reply
      .header('content-type', baseMime(row.mime))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "sandbox; default-src 'none'")
      .header('content-disposition', `inline; filename="media-${row.id}.${row.path!.split('.').pop()}"`)
      .header('cache-control', 'private, max-age=3600')
      .send(bytes);
  });

  /** Dev: inject an inbound image/PDF/voice note without a WhatsApp number (bytes go through the real validation). */
  app.post('/api/dev/simulate-media', { bodyLimit: 14 * 1024 * 1024 }, async (req) => {
    if (!cfg.devSimulator) throw notFound();
    const b = req.body as { from?: string; name?: string; kind?: 'image' | 'audio' | 'document'; mime?: string; data?: string; caption?: string };
    const from = String(b.from ?? '').replace(/\D/g, '');
    if (!from || !b.data || !['image', 'audio', 'document'].includes(String(b.kind))) throw bad('from, kind (image|audio|document) and data (base64) are required');
    const bytes = Buffer.from(b.data, 'base64');
    const kind = b.kind as 'image' | 'audio' | 'document';
    const label = kind === 'image' ? '[Image]' : kind === 'audio' ? '[Audio message]' : '[Document]';
    await pipeline.handleInbound({
      waMessageId: `sim.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`, from, name: b.name?.trim() || null, timestamp: Date.now(), type: kind,
      text: `${label}${b.caption ? ' ' + b.caption : ''}`, media: { kind, id: 'sim', mime: String(b.mime ?? ''), caption: b.caption, bytes },
    });
    const contact = store.upsertContact(from, null);
    return { conversation: store.lastConversation(contact.id) };
  });

  // ---- agents ----------------------------------------------------------------------------------
  const agentOr404 = (req: FastifyRequest) => {
    const a = store.getAgent(Number((req.params as { id: string }).id));
    if (!a) throw notFound('agent not found');
    return a;
  };

  function mergeDraft(base: AgentDraft, patch: Partial<AgentDraft> | undefined): AgentDraft {
    if (!patch) return base;
    const out: AgentDraft = { ...base, skills: { ...base.skills } };
    if (patch.instructions !== undefined) {
      if (typeof patch.instructions !== 'string') throw bad('instructions must be text');
      if (patch.instructions.length > INSTRUCTIONS_LIMIT) throw bad(`Instructions are limited to ${INSTRUCTIONS_LIMIT} characters`);
      out.instructions = patch.instructions;
    }
    if (patch.model !== undefined) {
      if (typeof patch.model !== 'string' || !/^[a-z0-9.@-]{3,80}$/i.test(patch.model)) throw bad('invalid model id');
      out.model = patch.model;
    }
    if (patch.wait_seconds !== undefined) {
      const n = Number(patch.wait_seconds);
      if (!Number.isFinite(n) || n < 0 || n > 300) throw bad('wait_seconds must be between 0 and 300');
      out.wait_seconds = n;
    }
    if (patch.knowledge_ids !== undefined) {
      if (!Array.isArray(patch.knowledge_ids)) throw bad('knowledge_ids must be an array');
      const ids = patch.knowledge_ids.map(Number);
      const missing = ids.filter((i) => !store.getSource(i));
      if (missing.length) throw bad(`Unknown knowledge source id(s): ${missing.join(', ')}`);
      out.knowledge_ids = ids;
    }
    if (patch.skills) {
      for (const k of Object.keys(patch.skills) as SkillKey[]) {
        if (!SKILL_KEYS.includes(k)) throw bad(`Unknown skill "${k}"`);
        const s = patch.skills[k];
        out.skills[k] = { enabled: !!s?.enabled, prompt: String(s?.prompt ?? '').slice(0, 1000) };
      }
    }
    if (patch.http_actions !== undefined) {
      try { out.http_actions = validateHttpActions(restoreSecrets(patch.http_actions, base.http_actions)); } catch (e) { throw bad((e as Error).message); }
    }
    return out;
  }

  /** Never send stored API keys back to the browser. */
  const maskAgent = <T extends { draft: AgentDraft }>(a: T): T => ({ ...a, draft: { ...a.draft, http_actions: maskActions(a.draft.http_actions) } });

  app.get('/api/agents', async () => store.listAgents().map(maskAgent));

  app.post('/api/agents', async (req) => {
    const b = req.body as { name?: string; emoji?: string; description?: string; draft?: Partial<AgentDraft> };
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('name is required');
    if (store.listAgents().some((a) => a.name === name)) throw bad(`An agent named "${name}" already exists`);
    return maskAgent(store.createAgent(name, b.emoji?.trim() || '🤖', b.description ?? '', mergeDraft(emptyDraft(cfg.defaultModel), b.draft)));
  });

  app.get('/api/agents/:id', async (req) => maskAgent(agentOr404(req)));

  app.put('/api/agents/:id', async (req) => {
    const a = agentOr404(req);
    const b = req.body as { name?: string; emoji?: string; description?: string; draft?: Partial<AgentDraft> };
    if (b.name !== undefined) {
      const name = b.name.trim();
      if (!name) throw bad('name cannot be empty');
      if (store.listAgents().some((x) => x.name === name && x.id !== a.id)) throw bad(`An agent named "${name}" already exists`);
    }
    return maskAgent(store.updateAgent(a.id, { name: b.name?.trim(), emoji: b.emoji, description: b.description, draft: mergeDraft(a.draft, b.draft) }));
  });

  app.post('/api/agents/:id/publish', async (req) => {
    const a = agentOr404(req);
    if (!a.draft.instructions.trim()) throw bad('Write instructions before publishing');
    const out = store.publishAgent(a.id);
    hub.publish({ type: 'agent', agentId: a.id });
    return maskAgent(out);
  });

  app.post('/api/agents/:id/unpublish', async (req) => {
    const a = agentOr404(req);
    if (store.getSetting('default_agent_id') === a.id) store.setSetting('default_agent_id', null);
    const out = store.unpublishAgent(a.id);
    hub.publish({ type: 'agent', agentId: a.id });
    return maskAgent(out);
  });

  app.get('/api/agents/:id/runs', async (req) => store.runs(agentOr404(req).id));

  /** "Test AI Agent": runs the DRAFT against a simulated contact; nothing is persisted or sent. */
  app.post('/api/agents/:id/test', async (req) => {
    const a = agentOr404(req);
    const b = req.body as { history?: HistoryMsg[]; contact?: Partial<ConvState['contact']>; events?: ('assigned' | 'reopened')[] };
    const history = (b.history ?? []).filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string').slice(-20);
    const c = b.contact ?? {};
    const state: ConvState = {
      contact: { name: c.name ?? 'Test Contact', phone: c.phone ?? '60123456789', email: c.email ?? null, lifecycle: c.lifecycle ?? null, tags: [...(c.tags ?? [])], fields: { ...(c.fields ?? {}) } },
      status: 'open', handler: 'ai', assignee_team: null, assignee_user: null,
    };
    const { env, effects } = simEnv({
      workspace, state, selfName: a.name, selfId: a.id,
      agents: store.activeAgents().map((x) => ({ id: x.id, name: x.name })),
      search: (q, ids) => knowledge.search(ids, q),
      knowledgeMentions: (ids, needle) => store.knowledgeMentions(ids, needle),
      workflows: store.listWorkflows().map((w) => ({ id: w.id, name: w.name, status: w.status, triggerType: w.trigger.type })),
      templates: store.listTemplates().map((t) => ({ name: t.name, language: t.language, params: t.params })),
      fetch: d.fetchImpl,
    });
    const events: ConvEvent[] = (b.events ?? []).map((t, i) => ({ id: i, conversation_id: 0, type: t, payload: { by: 'a test' }, after_message_id: 0, created_at: Date.now() }));
    const t0 = Date.now();
    const result = await runAgent({ provider: d.provider, snapshot: { ...a.draft, id: a.id, name: a.name, version: 0 }, env, history, events });
    return { ...result, actions: effects.actions, state, latency_ms: Date.now() - t0 };
  });

  // ---- knowledge -------------------------------------------------------------------------------
  app.get('/api/knowledge', async () => store.listSources());

  app.post('/api/knowledge', async (req) => {
    const b = req.body as { name?: string; text?: string; url?: string; depth?: number };
    const name = String(b.name ?? '').trim();
    try {
      if (b.url) return await knowledge.addUrl(name || b.url, b.url, Number(b.depth ?? 1));
      if (typeof b.text === 'string') return knowledge.addText(name, b.text);
    } catch (e) {
      if (e instanceof KnowledgeError) throw bad(e.message);
      throw e;
    }
    throw bad('Provide text or url');
  });

  app.delete('/api/knowledge/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!store.getSource(id)) throw notFound();
    knowledge.remove(id);
    return reply.code(204).send();
  });

  app.post('/api/knowledge/search', async (req) => {
    const b = req.body as { query?: string; source_ids?: number[]; mode?: string };
    const ids = b.source_ids?.length ? b.source_ids.map(Number) : store.listSources().map((x) => x.id);
    const mode = b.mode === undefined ? undefined : (['hybrid', 'keyword', 'vector'].includes(b.mode) ? (b.mode as 'hybrid' | 'keyword' | 'vector') : null);
    if (mode === null) throw bad('mode must be hybrid, keyword or vector');
    try {
      return { mode: mode ?? (knowledge.embedder ? 'hybrid' : 'keyword'), hits: await knowledge.search(ids, String(b.query ?? ''), { mode }) };
    } catch (e) {
      if (e instanceof KnowledgeError) throw bad(e.message);
      throw new HttpError(502, `Embedding provider error: ${(e as Error).message}`);
    }
  });

  /** Embed sources that have no vectors for the current model (after enabling embeddings or changing the model). */
  app.post('/api/knowledge/reindex', async (req) => {
    try { return { queued: knowledge.reindex(!!(req.body as { force?: boolean } | undefined)?.force) }; } catch (e) { throw bad((e as Error).message); }
  });


  // ---- review (prompt linter) ------------------------------------------------------------------
  const reviewInput = (draft: AgentDraft) => ({
    draft, workspace,
    agents: store.activeAgents().map((x) => x.name),
    workflows: store.listWorkflows().map((w) => ({ name: w.name, status: w.status, triggerType: w.trigger.type })),
    templates: store.listTemplates().map((t) => t.name),
  });

  app.post('/api/agents/:id/review', async (req) => {
    const a = agentOr404(req);
    const b = (req.body ?? {}) as { draft?: Partial<AgentDraft> };
    const draft = b.draft ? normalizeDraft({ ...a.draft, ...b.draft, skills: { ...a.draft.skills, ...(b.draft.skills ?? {}) } }) : a.draft;
    const issues = reviewAgent(reviewInput(draft));
    return { issues, summary: summarize(issues) };
  });

  /** Which tools would the model get? (debug aid for the editor) */
  app.get('/api/agents/:id/tools', async (req) => {
    const a = agentOr404(req);
    const { env } = simEnv({ workspace, state: { contact: { name: null, phone: '', email: null, lifecycle: null, tags: [], fields: {} }, status: 'open', handler: 'ai', assignee_team: null, assignee_user: null }, selfName: a.name, selfId: a.id,
      agents: store.activeAgents().map((x) => ({ id: x.id, name: x.name })), search: () => [],
      workflows: store.listWorkflows().map((w) => ({ id: w.id, name: w.name, status: w.status, triggerType: w.trigger.type })),
      templates: store.listTemplates().map((t) => ({ name: t.name, language: t.language, params: t.params })) });
    return buildTools({ ...a.draft, id: a.id, name: a.name, version: 0 }, env).map((t) => ({ name: t.name, description: t.description }));
  });

  // ---- contacts --------------------------------------------------------------------------------
  app.put('/api/contacts/:id', async (req) => {
    const c = store.getContact(Number((req.params as { id: string }).id));
    if (!c) throw notFound('contact not found');
    const b = req.body as { name?: string; email?: string; lifecycle?: string | null; tags?: string[]; fields?: Record<string, string | number> };
    const conv = store.lastConversation(c.id);
    const o = { source: 'user' as const };
    if (b.fields) {
      for (const [k, v] of Object.entries(b.fields)) {
        const def = workspace.custom_fields.find((f) => f.name === k);
        if (!def && k !== 'Name' && k !== 'Email') throw bad(`Unknown field "${k}"`);
        const val = def?.type === 'number' ? Number(v) : String(v);
        if (typeof val === 'number' && !Number.isFinite(val)) throw bad(`Field "${k}" needs a number`);
        await pipeline.setField(c.id, conv?.id ?? null, k, val, o);
      }
    }
    if (b.name !== undefined) await pipeline.setField(c.id, conv?.id ?? null, 'Name', b.name, o);
    if (b.email !== undefined) await pipeline.setField(c.id, conv?.id ?? null, 'Email', b.email, o);
    if (b.lifecycle !== undefined && b.lifecycle !== null) {
      if (!workspace.lifecycle_stages.includes(b.lifecycle)) throw bad(`Unknown lifecycle stage "${b.lifecycle}"`);
      await pipeline.setLifecycle(c.id, conv?.id ?? null, b.lifecycle, o);
    }
    if (b.tags) {
      const bad_ = b.tags.filter((t) => !workspace.tags.includes(t));
      if (bad_.length) throw bad(`Unknown tag(s): ${bad_.join(', ')}`);
      const cur = store.getContact(c.id)!.tags;
      await pipeline.updateTags(c.id, conv?.id ?? null, b.tags.filter((t) => !cur.includes(t)), cur.filter((t) => !b.tags!.includes(t)), o);
    }
    return store.getContact(c.id);
  });

  // ---- WhatsApp templates ----------------------------------------------------------------------
  app.get('/api/templates', async () => store.listTemplates());
  app.post('/api/templates', async (req) => {
    const b = req.body as { name?: string; language?: string; body?: string };
    const name = String(b.name ?? '').trim(), language = String(b.language ?? 'en').trim(), body = String(b.body ?? '').trim();
    if (!/^[a-z0-9_]{1,100}$/.test(name)) throw bad('Template names use lowercase letters, numbers and _');
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) throw bad('Language looks like en, ms or en_US');
    if (!body || body.length > 1024) throw bad('Body is required (max 1024 characters)');
    return store.upsertTemplate(name, language, body);
  });
  app.delete('/api/templates/:id', async (req, reply) => { store.deleteTemplate(Number((req.params as { id: string }).id)); return reply.code(204).send(); });
  app.post('/api/conversations/:id/template', async (req, reply) => {
    const conv = convOr404(req);
    const b = req.body as { name?: string; params?: string[] };
    try {
      const m = await pipeline.sendTemplate(conv.id, String(b.name ?? ''), null, (b.params ?? []).map(String), 'human');
      await pipeline.humanActivity(conv.id, 'outgoing');
      return reply.code(m.status === 'failed' ? 502 : 200).send({ message: m });
    } catch (e) { throw bad((e as Error).message); }
  });

  // ---- metrics ---------------------------------------------------------------------------------
  app.get('/api/metrics', async (req) => {
    const days = Math.max(1, Math.min(90, Number((req.query as { days?: string }).days ?? 14) || 14));
    return { days, ...store.metrics(Date.now() - days * 86_400_000) };
  });

  // ---- workflows -------------------------------------------------------------------------------
  const wfOr404 = (req: FastifyRequest) => {
    const w = store.getWorkflow(Number((req.params as { id: string }).id));
    if (!w) throw notFound('workflow not found');
    return w;
  };
  const wfLookup = () => ({
    agentNames: store.activeAgents().map((a) => a.name),
    workflows: store.listWorkflows().map((w) => ({ id: w.id, name: w.name, status: w.status, triggerType: w.trigger.type })),
    templateNames: store.listTemplates().map((t) => t.name),
  });
  const wfView = (w: ReturnType<typeof wfOr404>) => ({ ...w, hook_url: w.trigger.type === 'incoming_webhook' ? `/hooks/workflow/${w.hook_token}` : null, active_runs: store.activeRuns({ workflowId: w.id }).length });
  const checkStructure = (g: Graph, t: Trigger) => {
    const errs = [...structuralIssues(g), ...validateTrigger(t)];
    if (errs.length) throw new HttpError(400, errs[0]);
  };

  app.get('/api/workflows', async () => store.listWorkflows().map(wfView));
  app.get('/api/workflows/:id', async (req) => wfView(wfOr404(req)));

  app.post('/api/workflows', async (req) => {
    const b = req.body as { name?: string; trigger?: Trigger; graph?: Graph; settings?: WorkflowSettings };
    const name = String(b.name ?? '').trim();
    if (!name || name.length > 80) throw bad('name is required (max 80 characters)');
    if (store.getWorkflowByName(name)) throw bad(`A workflow named "${name}" already exists`);
    if (store.countWorkflows() >= LIMITS.maxWorkflows) throw bad(`A workspace can have at most ${LIMITS.maxWorkflows} workflows`);
    const trigger = b.trigger ?? { type: 'manual' as const };
    const graph = b.graph ?? { start: null, steps: {} };
    checkStructure(graph, trigger);
    return wfView(store.createWorkflow(name, trigger, graph, b.settings ?? {}, newHookToken()));
  });

  app.put('/api/workflows/:id', async (req) => {
    const w = wfOr404(req);
    if (w.status === 'published') throw new HttpError(409, 'Stop the workflow before editing it');
    const b = req.body as { name?: string; trigger?: Trigger; graph?: Graph; settings?: WorkflowSettings };
    if (b.name !== undefined) {
      const name = b.name.trim();
      if (!name || name.length > 80) throw bad('name is required (max 80 characters)');
      const dup = store.getWorkflowByName(name);
      if (dup && dup.id !== w.id) throw bad(`A workflow named "${name}" already exists`);
    }
    checkStructure(b.graph ?? w.graph, b.trigger ?? w.trigger);
    return wfView(store.updateWorkflow(w.id, { name: b.name?.trim(), trigger: b.trigger, graph: b.graph, settings: b.settings }));
  });

  /** Full completeness check, without publishing (the builder shows these next to the steps). */
  app.post('/api/workflows/:id/validate', async (req) => {
    const w = wfOr404(req);
    const b = (req.body ?? {}) as { graph?: Graph; trigger?: Trigger };
    const graph = b.graph ?? w.graph, trigger = b.trigger ?? w.trigger;
    if (structuralIssues(graph).length) return { issues: structuralIssues(graph).map((m) => ({ stepId: null, message: m })) };
    return { issues: [...validateTrigger(trigger).map((m) => ({ stepId: null, message: m })), ...validateGraph(graph, workspace, { publish: true, lookup: wfLookup() })] };
  });

  app.post('/api/workflows/:id/publish', async (req) => {
    const w = wfOr404(req);
    if (w.status === 'published') throw new HttpError(409, 'Already published');
    const issues = [...validateTrigger(w.trigger).map((m) => ({ stepId: null, message: m })), ...validateGraph(w.graph, workspace, { publish: true, lookup: wfLookup() })];
    if (issues.length) throw Object.assign(new HttpError(400, `Fix these issues before publishing: ${issues.slice(0, 3).map((i) => i.message).join('; ')}`), { issues });
    return wfView(store.setWorkflowStatus(w.id, 'published'));
  });

  app.post('/api/workflows/:id/stop', async (req) => {
    const w = wfOr404(req);
    if (w.status !== 'published') throw new HttpError(409, 'Only a published workflow can be stopped');
    const ejected = engine.stopWorkflow(w.id);
    return { ...wfView(store.setWorkflowStatus(w.id, 'stopped')), ejected };
  });

  app.post('/api/workflows/:id/clone', async (req) => {
    const w = wfOr404(req);
    if (store.countWorkflows() >= LIMITS.maxWorkflows) throw bad(`A workspace can have at most ${LIMITS.maxWorkflows} workflows`);
    let name = `${w.name} clone`;
    for (let i = 2; store.getWorkflowByName(name); i++) name = `${w.name} clone ${i}`;
    return wfView(store.createWorkflow(name, w.trigger, w.graph, w.settings, newHookToken()));
  });

  app.delete('/api/workflows/:id', async (req, reply) => {
    const w = wfOr404(req);
    if (w.status === 'published') throw new HttpError(409, 'Stop the workflow before deleting it');
    store.deleteWorkflow(w.id);
    return reply.code(204).send();
  });

  app.get('/api/workflows/:id/runs', async (req) => store.runsFor(wfOr404(req).id));

  /** Run a draft (or any) workflow for a phone number, flagged as a test. */
  app.post('/api/workflows/:id/test', async (req) => {
    const w = wfOr404(req);
    const b = req.body as { phone?: string; name?: string; vars?: Record<string, unknown> };
    const phone = String(b.phone ?? '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) throw bad('phone must be 8-15 digits');
    const issues = validateGraph(w.graph, workspace, { publish: true, lookup: wfLookup() });
    if (issues.length) throw bad(`Fix these issues first: ${issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    const contact = store.upsertContact(phone, b.name?.trim() || null);
    try { return await engine.startFor(w, contact.id, null, b.vars ?? {}, true); } catch (e) { throw new HttpError(409, (e as Error).message); }
  });

  app.post('/api/conversations/:id/shortcut', async (req) => {
    const conv = convOr404(req);
    const w = store.getWorkflow(Number((req.body as { workflow_id?: number }).workflow_id));
    if (!w || w.status !== 'published' || w.trigger.type !== 'shortcut') throw bad('Choose a published workflow with the Shortcut trigger');
    try { return await engine.startFor(w, conv.contact_id, conv.id, { label: String(w.trigger.config?.label ?? w.name) }); } catch (e) { throw new HttpError(409, (e as Error).message); }
  });

  /** Public entry point for the "Incoming Webhook" trigger; the unguessable token is the credential. */
  app.post('/hooks/workflow/:token', async (req, reply) => {
    const w = store.getWorkflowByToken((req.params as { token: string }).token);
    if (!w || w.status !== 'published' || w.trigger.type !== 'incoming_webhook') return reply.code(404).send({ error: 'not found' });
    const body = (req.body ?? {}) as Record<string, any>;
    const phone = String(body.phone ?? body.contact?.phone ?? '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) return reply.code(400).send({ error: 'phone (8-15 digits) is required' });
    const contact = store.upsertContact(phone, typeof (body.name ?? body.contact?.name) === 'string' ? String(body.name ?? body.contact?.name).slice(0, 100) : null);
    try {
      const run = await engine.startFor(w, contact.id, null, triggerVarsFromBody(body));
      return reply.code(202).send({ run_id: run.id, status: run.status });
    } catch (e) { return reply.code(409).send({ error: (e as Error).message }); }
  });

  const drain = async () => {
    for (let i = 0; i < 200 && inflight.size; i++) await Promise.all([...inflight]);
    await pipeline.idle();
    await knowledge.idle();
  };
  return { app, drain };
}
