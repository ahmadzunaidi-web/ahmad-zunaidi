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
  provider: LlmProvider;
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
  const { cfg, store, pipeline, hub, workspace, knowledge } = d;
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
    reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message });
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
      return { conversation: pipeline.setStatus(conv.id, b.status, b.closing_note ?? null, b.summary ?? null) };
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
    return out;
  }

  app.get('/api/agents', async () => store.listAgents());

  app.post('/api/agents', async (req) => {
    const b = req.body as { name?: string; emoji?: string; description?: string; draft?: Partial<AgentDraft> };
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('name is required');
    if (store.listAgents().some((a) => a.name === name)) throw bad(`An agent named "${name}" already exists`);
    return store.createAgent(name, b.emoji?.trim() || '🤖', b.description ?? '', mergeDraft(emptyDraft(cfg.defaultModel), b.draft));
  });

  app.get('/api/agents/:id', async (req) => agentOr404(req));

  app.put('/api/agents/:id', async (req) => {
    const a = agentOr404(req);
    const b = req.body as { name?: string; emoji?: string; description?: string; draft?: Partial<AgentDraft> };
    if (b.name !== undefined) {
      const name = b.name.trim();
      if (!name) throw bad('name cannot be empty');
      if (store.listAgents().some((x) => x.name === name && x.id !== a.id)) throw bad(`An agent named "${name}" already exists`);
    }
    return store.updateAgent(a.id, { name: b.name?.trim(), emoji: b.emoji, description: b.description, draft: mergeDraft(a.draft, b.draft) });
  });

  app.post('/api/agents/:id/publish', async (req) => {
    const a = agentOr404(req);
    if (!a.draft.instructions.trim()) throw bad('Write instructions before publishing');
    const out = store.publishAgent(a.id);
    hub.publish({ type: 'agent', agentId: a.id });
    return out;
  });

  app.post('/api/agents/:id/unpublish', async (req) => {
    const a = agentOr404(req);
    if (store.getSetting('default_agent_id') === a.id) store.setSetting('default_agent_id', null);
    const out = store.unpublishAgent(a.id);
    hub.publish({ type: 'agent', agentId: a.id });
    return out;
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
      workspace, state, selfName: a.name,
      agents: store.activeAgents().map((x) => ({ id: x.id, name: x.name })),
      search: (q, ids) => store.searchKnowledge(ids, q),
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
    store.deleteSource(id);
    return reply.code(204).send();
  });

  app.post('/api/knowledge/search', async (req) => {
    const b = req.body as { query?: string; source_ids?: number[] };
    const ids = b.source_ids?.length ? b.source_ids.map(Number) : store.listSources().map((s) => s.id);
    return { hits: store.searchKnowledge(ids, String(b.query ?? '')) };
  });

  const drain = async () => {
    for (let i = 0; i < 200 && inflight.size; i++) await Promise.all([...inflight]);
    await pipeline.idle();
  };
  return { app, drain };
}
