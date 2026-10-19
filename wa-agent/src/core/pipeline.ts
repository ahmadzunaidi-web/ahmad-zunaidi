import type { Config } from '../config.js';
import type { Sender, InboundMessage, StatusUpdate } from '../channels/whatsapp.js';
import { interactiveKind, splitText } from '../channels/whatsapp.js';
import type { LlmProvider } from '../agent/llm.js';
import { runAgent, type HistoryMsg, type RunResult } from '../agent/runtime.js';
import type { AgentEnv, AssignTarget, ConvState, Effects, FollowupStep } from '../agent/skills.js';
import type { Store } from '../store.js';
import type { Conversation, Message, MessageSender } from '../types.js';
import { teamOf, type Workspace } from '../workspace.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import type { EventSource, WorkflowEvent } from '../workflow/types.js';
import type { FollowUps } from './followups.js';
import type { EventHub } from './events.js';

export const MAX_HANDOFF_DEPTH = 3;

export interface Deps {
  store: Store;
  sender: Sender;
  hub: EventHub;
  cfg: Config;
  workspace: Workspace;
  provider: LlmProvider;
  /** Outbound HTTP used by the HTTP-request skill/step (injectable for tests). */
  fetchImpl?: typeof fetch;
  log?: (msg: string, extra?: unknown) => void;
}

type Trigger = 'message' | 'assignment';
interface Pending { timer: NodeJS.Timeout; resolve: () => void }
export type Origin = { source: EventSource; originWorkflowId?: number };

const STATUS_RANK: Record<string, number> = { received: 0, pending: 1, failed: 1, sent: 2, delivered: 3, read: 4 };
const AI_RATE_WINDOW_MS = 3600_000;

export class Pipeline {
  engine?: WorkflowEngine;
  followups?: FollowUps;
  private pending = new Map<number, Pending>();
  private chains = new Map<number, Promise<void>>();
  private running = 0;

  constructor(readonly d: Deps) {}

  private log(msg: string, extra?: unknown) { this.d.log?.(msg, extra); }
  private async emit(ev: WorkflowEvent): Promise<void> {
    try { await this.engine?.fire(ev); } catch (e) { this.log('workflow event failed', (e as Error).message); }
  }

  // ---- inbound --------------------------------------------------------------------------------
  async handleInbound(m: InboundMessage): Promise<void> {
    const { store, hub } = this.d;
    if (store.findMessageByWaId(m.waMessageId)) return; // WhatsApp retries deliveries: be idempotent

    const contact = store.upsertContact(m.from, m.name);
    let conv = store.findOpenConversation(contact.id);
    let opened = false;
    if (!conv) {
      const last = store.lastConversation(contact.id);
      if (last) {
        conv = store.reopenConversation(last.id);
        store.addEvent(conv.id, 'reopened');
      } else conv = store.createConversation(contact.id);
      opened = true;
    }
    store.cancelFollowups(conv.id, 'contact replied');
    store.insertMessage({ conversation_id: conv.id, direction: 'in', sender: 'contact', type: m.type, body: m.text, wa_message_id: m.waMessageId, status: 'received', created_at: m.timestamp });
    conv = store.patchConversation(conv.id, { last_inbound_at: m.timestamp });
    hub.publish({ type: 'message', conversationId: conv.id });
    hub.publish({ type: 'conversation', conversationId: conv.id });

    // 1) a workflow waiting for an answer takes this message (and it must not start a new run)
    if (this.engine && await this.engine.consumeAnswer(contact.id, m.text)) return;
    await this.engine?.noteIncoming(contact.id);

    // 2) triggers
    if (opened) await this.emit({ type: 'conversation_opened', contactId: contact.id, conversationId: conv.id, source: 'contact' });
    if (m.referral) await this.emit({ type: 'click_to_chat_ad', contactId: contact.id, conversationId: conv.id, source: 'contact', data: { referral: m.referral } });

    // 3) route, unless a workflow is now talking to the contact
    conv = store.getConversation(conv.id)!;
    if (this.engine?.holdsConversation(contact.id)) return;
    await this.route(conv, m);
  }

  private async route(conv: Conversation, m?: InboundMessage): Promise<void> {
    const { store, cfg } = this.d;
    if (conv.status !== 'open' || conv.handler === 'human') return; // a person owns it: inbox only
    if (conv.handler === 'ai' && conv.agent_id) {
      if (store.liveAgent(conv.agent_id)) return this.scheduleAgent(conv.id, 'message');
      conv = store.patchConversation(conv.id, { handler: 'none', agent_id: null }); // agent was unpublished
    }
    const def = store.getSetting('default_agent_id');
    if (def && store.liveAgent(def)) {
      this.assignToAgent(conv.id, def, 'the default assignee rule', 0, 'message');
      return;
    }
    if (cfg.echoFallback && m) await this.send(conv.id, `🔁 ${m.text}`, 'echo');
  }

  handleStatus(s: StatusUpdate): void {
    const { store, hub } = this.d;
    const msg = store.findMessageByWaId(s.waMessageId);
    if (!msg) return;
    const next = s.status;
    if ((STATUS_RANK[next] ?? 0) < (STATUS_RANK[msg.status] ?? 0) && next !== 'failed') return;
    store.updateMessage(msg.id, { status: next, error: s.status === 'failed' ? (s.error ?? 'Delivery failed') : null });
    hub.publish({ type: 'message', conversationId: msg.conversation_id });
  }

  // ---- outbound -------------------------------------------------------------------------------
  windowOpen(conv: Conversation): boolean {
    return conv.last_inbound_at != null && Date.now() - conv.last_inbound_at <= this.d.cfg.windowMs;
  }

  /** Insert a pending row, enforce the 24h window (unless it is a template), call the channel, record the outcome. */
  private async deliver(convId: number, sender: MessageSender, type: string, body: string, send: (to: string) => Promise<{ id: string }>, opts: { ignoreWindow?: boolean } = {}): Promise<Message> {
    const { store, hub } = this.d;
    const conv = store.getConversation(convId);
    if (!conv) throw new Error('conversation not found');
    const contact = store.getContact(conv.contact_id)!;
    const row = store.insertMessage({ conversation_id: conv.id, direction: 'out', sender, type, body, status: 'pending' });
    if (!opts.ignoreWindow && !this.windowOpen(store.getConversation(conv.id)!)) {
      store.updateMessage(row.id, { status: 'failed', error: '24h customer-service window is closed: a WhatsApp template message is required' });
    } else {
      try {
        const r = await send(contact.wa_id);
        store.updateMessage(row.id, { status: 'sent', wa_message_id: r.id });
      } catch (e) {
        store.updateMessage(row.id, { status: 'failed', error: (e as Error).message });
        this.log('send failed', (e as Error).message);
      }
    }
    hub.publish({ type: 'message', conversationId: conv.id });
    return store.messages(conv.id).find((x) => x.id === row.id)!;
  }

  /** Send free-form text. WhatsApp only allows this within 24h of the contact's last message. */
  async send(conversationId: number, text: string, sender: MessageSender): Promise<Message[]> {
    const out: Message[] = [];
    for (const part of splitText(text)) out.push(await this.deliver(conversationId, sender, 'text', part, (to) => this.d.sender.sendText(to, part)));
    return out;
  }

  /** Ask with tappable choices (buttons/list) when they fit WhatsApp limits, numbered text otherwise. */
  async sendChoices(conversationId: number, body: string, choices: string[], sender: MessageSender): Promise<Message> {
    const kind = interactiveKind(choices);
    const s = this.d.sender;
    const shown = `${body}\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
    if (kind && s.sendInteractive) {
      return this.deliver(conversationId, sender, 'interactive', `${body}\n[${choices.join(' | ')}]`, (to) => s.sendInteractive!(to, { body, choices }));
    }
    return this.deliver(conversationId, sender, 'text', shown, (to) => s.sendText(to, shown));
  }

  /** Send a pre-approved WhatsApp template (the only free-of-window message type). */
  async sendTemplate(conversationId: number, name: string, language: string | null, params: string[], sender: MessageSender): Promise<Message> {
    const tpl = this.d.store.getTemplate(name, language ?? undefined);
    if (!tpl) throw new Error(`Template "${name}" is not registered`);
    if (params.length < tpl.params) throw new Error(`Template "${name}" needs ${tpl.params} parameter(s)`);
    const rendered = tpl.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? '');
    const s = this.d.sender;
    if (!s.sendTemplate) throw new Error('This channel cannot send templates');
    return this.deliver(conversationId, sender, 'template', rendered, (to) => s.sendTemplate!(to, tpl.name, tpl.language, params.slice(0, tpl.params)), { ignoreWindow: true });
  }

  async sendMedia(conversationId: number, url: string, kind: 'image' | 'document', caption: string | null, sender: MessageSender): Promise<Message> {
    const s = this.d.sender;
    if (!s.sendMedia) throw new Error('This channel cannot send attachments');
    const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
    return this.deliver(conversationId, sender, kind, `${url}${caption ? `\n${caption}` : ''}`, (to) => s.sendMedia!(to, kind, url, caption ?? undefined, filename));
  }

  // ---- contact data (every change can start workflows) ----------------------------------------
  async setField(contactId: number, conversationId: number | null, field: string, value: string | number, o: Origin): Promise<void> {
    const { store } = this.d;
    const c = store.getContact(contactId)!;
    if (field === 'Name') store.patchContact(contactId, { name: String(value) });
    else if (field === 'Email') store.patchContact(contactId, { email: String(value) });
    else store.patchContact(contactId, { fields: { ...c.fields, [field]: value } });
    this.touch(conversationId);
    await this.emit({ type: 'contact_field_updated', contactId, conversationId, ...o, data: { field } });
  }

  async setLifecycle(contactId: number, conversationId: number | null, stage: string, o: Origin): Promise<void> {
    const prev = this.d.store.getContact(contactId)!.lifecycle;
    this.d.store.patchContact(contactId, { lifecycle: stage });
    this.touch(conversationId);
    if (prev !== stage) await this.emit({ type: 'lifecycle_updated', contactId, conversationId, ...o, data: { stage } });
  }

  async updateTags(contactId: number, conversationId: number | null, add: string[], remove: string[], o: Origin): Promise<string[]> {
    const { store } = this.d;
    const before = new Set(store.getContact(contactId)!.tags);
    const tags = new Set(before);
    add.forEach((t) => tags.add(t));
    remove.forEach((t) => tags.delete(t));
    store.patchContact(contactId, { tags: [...tags] });
    this.touch(conversationId);
    for (const t of add) if (!before.has(t)) await this.emit({ type: 'contact_tag_updated', contactId, conversationId, ...o, data: { tag: t, action: 'added' } });
    for (const t of remove) if (before.has(t)) await this.emit({ type: 'contact_tag_updated', contactId, conversationId, ...o, data: { tag: t, action: 'removed' } });
    return [...tags];
  }

  private touch(conversationId: number | null) {
    if (conversationId != null) this.d.hub.publish({ type: 'conversation', conversationId });
  }

  // ---- handler changes ------------------------------------------------------------------------
  /** `trigger` is 'message' when a contact message caused the assignment (so wait time still applies). */
  assignToAgent(conversationId: number, agentId: number, by: string, depth = 0, trigger: Trigger = 'assignment'): void {
    const { store, hub } = this.d;
    const snap = store.liveAgent(agentId);
    if (!snap) throw new Error('Agent is not published/active');
    this.cancel(conversationId);
    store.cancelFollowups(conversationId, 'reassigned');
    store.patchConversation(conversationId, { handler: 'ai', agent_id: agentId, assignee_team: null, assignee_user: null, status: 'open', closed_at: null });
    store.addEvent(conversationId, 'assigned', { by });
    hub.publish({ type: 'conversation', conversationId });
    this.scheduleAgent(conversationId, trigger, trigger === 'message' ? undefined : 0, depth);
  }

  takeover(conversationId: number, user = 'Inbox user'): Conversation {
    this.cancel(conversationId);
    this.d.store.cancelFollowups(conversationId, 'human took over');
    const conv = this.d.store.patchConversation(conversationId, { handler: 'human', agent_id: null, assignee_user: user, assignee_team: null });
    this.d.hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  /** Members of `team` (or every user) who are allowed to receive a new conversation. */
  pickMember(team: string | null, strategy: 'round_robin' | 'least_open', maxOpen?: number): string | null {
    const { store, workspace } = this.d;
    let members = team ? teamOf(workspace, team)?.members ?? [] : workspace.users;
    if (maxOpen != null) members = members.filter((u) => store.countOpenForUser(u) < maxOpen);
    if (!members.length) return null;
    if (strategy === 'least_open') return [...members].sort((a, b) => store.countOpenForUser(a) - store.countOpenForUser(b))[0];
    return members[store.nextCounter(`rr:${team ?? '*'}`) % members.length];
  }

  assignToHuman(conversationId: number, target: { team?: string; user?: string }, opts: { strategy?: 'round_robin' | 'least_open'; maxOpen?: number } = {}): Conversation {
    const { store, workspace, hub } = this.d;
    this.cancel(conversationId);
    store.cancelFollowups(conversationId, 'assigned to a person');
    let team = target.team ?? null;
    let user = target.user ?? null;
    if (team && !teamOf(workspace, team)) throw new Error(`Unknown team "${team}"`);
    if (user && !workspace.users.includes(user)) throw new Error(`Unknown user "${user}"`);
    if (!user) {
      user = this.pickMember(team, opts.strategy ?? 'round_robin', opts.maxOpen);
      if (!user) throw new Error('No member is available');
    }
    if (!team) team = workspace.teams.find((t) => t.members.includes(user!))?.name ?? null;
    const conv = store.patchConversation(conversationId, { handler: 'human', agent_id: null, assignee_team: team, assignee_user: user });
    hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  unassign(conversationId: number): Conversation {
    this.cancel(conversationId);
    this.d.store.cancelFollowups(conversationId, 'unassigned');
    const conv = this.d.store.patchConversation(conversationId, { handler: 'none', agent_id: null, assignee_team: null, assignee_user: null });
    this.d.hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  async setStatus(conversationId: number, status: 'open' | 'closed', note: string | null, summary: string | null, o: Origin = { source: 'user' }): Promise<Conversation> {
    const { store, hub, workspace } = this.d;
    if (note && !workspace.closing_notes.includes(note)) throw new Error(`Unknown closing note "${note}"`);
    this.cancel(conversationId);
    store.cancelFollowups(conversationId, status === 'closed' ? 'conversation closed' : 'reopened');
    const before = store.getConversation(conversationId)!;
    const conv = status === 'closed'
      ? store.patchConversation(conversationId, { status: 'closed', closed_at: Date.now(), closing_note: note, summary, handler: 'none', agent_id: null })
      : store.reopenConversation(conversationId);
    hub.publish({ type: 'conversation', conversationId });
    if (before.status !== status) await this.emit({ type: status === 'closed' ? 'conversation_closed' : 'conversation_opened', contactId: conv.contact_id, conversationId, ...o });
    return conv;
  }

  /** A person typed a reply / assigned manually: workflows configured to exit on that do so. */
  async humanActivity(conversationId: number, kind: 'outgoing' | 'assign'): Promise<void> {
    const conv = this.d.store.getConversation(conversationId);
    if (conv) await this.engine?.onHumanActivity(conv.contact_id, kind);
  }

  // ---- AI agent execution ---------------------------------------------------------------------
  private cancel(conversationId: number): void {
    const p = this.pending.get(conversationId);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(conversationId);
      p.resolve();
    }
  }

  /** Debounce: every new contact message restarts the wait-time timer; only then does the agent process. */
  scheduleAgent(conversationId: number, trigger: Trigger, delayMs?: number, depth = 0): void {
    const conv = this.d.store.getConversation(conversationId);
    const snap = conv?.agent_id ? this.d.store.liveAgent(conv.agent_id) : null;
    if (!conv || !snap) return;
    const wait = delayMs ?? (trigger === 'message' ? Math.max(0, snap.wait_seconds) * 1000 : 0);
    this.cancel(conversationId);
    // the wait time only applies to contact messages (not assignment-triggered runs)
    const ms = trigger === 'message' ? wait : 0;
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(conversationId);
        const prev = this.chains.get(conversationId) ?? Promise.resolve();
        this.running++;
        const next = prev
          .then(() => this.runAgentFor(conversationId, trigger, depth))
          .catch((e) => this.log('agent run crashed', (e as Error).message))
          .finally(() => { this.running--; resolve(); });
        this.chains.set(conversationId, next);
      }, ms);
      this.pending.set(conversationId, { timer, resolve });
    });
  }

  buildState(conv: Conversation): ConvState {
    const c = this.d.store.getContact(conv.contact_id)!;
    return {
      contact: { name: c.name, phone: c.wa_id, email: c.email, lifecycle: c.lifecycle, tags: [...c.tags], fields: { ...c.fields } },
      status: conv.status, handler: conv.handler, assignee_team: conv.assignee_team, assignee_user: conv.assignee_user,
    };
  }

  /** Everything a skill needs, wired to the real database/channel. */
  makeEnv(conv: Conversation, selfName: string, selfId: number, depth: number): { env: AgentEnv; effects: DbEffects } {
    const { store, workspace } = this.d;
    const state = this.buildState(conv);
    const effects = new DbEffects(this, conv, state, selfName, depth);
    const env: AgentEnv = {
      workspace, state, effects, selfName, selfId,
      agents: store.activeAgents().map((a) => ({ id: a.id, name: a.name })),
      searchKnowledge: (q, ids) => store.searchKnowledge(ids, q),
      knowledgeMentions: (ids, needle) => store.knowledgeMentions(ids, needle),
      workflows: store.listWorkflows().map((w) => ({ id: w.id, name: w.name, status: w.status, triggerType: w.trigger.type })),
      templates: store.listTemplates().map((t) => ({ name: t.name, language: t.language, params: t.params })),
      fetch: this.d.fetchImpl,
      runUrls: new Set<string>(),
      attachmentsSent: 0,
    };
    return { env, effects };
  }

  private async runAgentFor(conversationId: number, trigger: Trigger, depth: number): Promise<void> {
    const { store, hub, cfg } = this.d;
    const conv = store.getConversation(conversationId);
    if (!conv || conv.status !== 'open' || conv.handler !== 'ai' || !conv.agent_id) return;
    const snap = store.liveAgent(conv.agent_id);
    if (!snap) {
      store.patchConversation(conversationId, { handler: 'none', agent_id: null });
      return;
    }
    // circuit breaker: a runaway loop (or abuse) must not burn unlimited model spend
    if (store.recentAgentRunCount(conversationId, Date.now() - AI_RATE_WINDOW_MS) >= cfg.aiMaxRunsPerHour) {
      store.patchConversation(conversationId, { handler: 'human', agent_id: null });
      store.addComment(conversationId, snap.name, `⚠️ AI paused: more than ${cfg.aiMaxRunsPerHour} AI runs in an hour on this conversation. A human should take over.`);
      hub.publish({ type: 'conversation', conversationId });
      return;
    }
    const inboundBefore = store.lastInboundMessageId(conversationId);
    const { env, effects } = this.makeEnv(conv, snap.name, snap.id, depth);
    const history: HistoryMsg[] = store.recentMessages(conversationId)
      .map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', text: m.body }));
    const t0 = Date.now();
    let result: RunResult;
    try {
      result = await runAgent({ provider: this.d.provider, snapshot: snap, env, history, events: store.eventsInWindow(conversationId) });
    } catch (e) {
      result = { reply: null, toolCalls: [], sources: [], usage: { input: 0, output: 0, cacheRead: 0 }, iterations: 0, stopReason: null, error: (e as Error).message };
    }

    // A newer contact message arrived while the model was working: drop this reply and run again on fresh context.
    const now = store.getConversation(conversationId)!;
    if (store.lastInboundMessageId(conversationId) !== inboundBefore && now.handler === 'ai' && now.agent_id === conv.agent_id && !result.error) {
      store.addRun({ conversation_id: conversationId, agent_id: snap.id, trigger, reply: null, tool_calls: result.toolCalls, usage: result.usage, error: 'superseded by newer message', latency_ms: Date.now() - t0 });
      this.scheduleAgent(conversationId, 'message', 0, depth);
      return;
    }

    if (result.reply) await this.send(conversationId, result.reply, 'ai');
    if (result.error) {
      store.addComment(conversationId, snap.name, `⚠️ AI agent error: ${result.error}. A human should check this conversation.`);
      hub.publish({ type: 'conversation', conversationId });
    }
    store.addRun({ conversation_id: conversationId, agent_id: snap.id, trigger, reply: result.reply, tool_calls: result.toolCalls, usage: result.usage, error: result.error ?? null, latency_ms: Date.now() - t0 });
    hub.publish({ type: 'agent', agentId: snap.id });

    // AI -> AI handoff: let the new agent speak after the old one's goodbye was sent.
    if (effects.handoffTo != null) {
      if (depth + 1 >= MAX_HANDOFF_DEPTH) {
        store.patchConversation(conversationId, { handler: 'human', agent_id: null });
        store.addComment(conversationId, snap.name, `⚠️ AI handoff chain stopped after ${MAX_HANDOFF_DEPTH} agents (possible loop). A human should take over.`);
      } else this.scheduleAgent(conversationId, 'assignment', 0, depth + 1);
    }
  }

  /** After a restart: answer chats whose last message is a customer message that no AI run has handled yet. */
  recover(windowMs = 15 * 60_000): number {
    const { store } = this.d;
    let n = 0;
    for (const c of store.openConversationsNeedingReply(Date.now() - windowMs)) {
      if (store.recentAgentRunCount(c.id, c.last_inbound_at ?? 0) > 0) continue;
      this.scheduleAgent(c.id, 'message');
      n++;
    }
    return n;
  }

  /** Resolves once no debounce timers or agent runs are outstanding (used by tests and graceful shutdown). */
  async idle(): Promise<void> {
    for (let i = 0; i < 4000; i++) {
      if (!this.pending.size && !this.running) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('pipeline did not become idle');
  }
}

/** Persisting skill effects. */
export class DbEffects implements Effects {
  handoffTo: number | null = null;
  constructor(private p: Pipeline, private conv: Conversation, private state: ConvState, private selfName: string, private depth: number) {}

  private get d() { return this.p.d; }
  private get origin(): Origin { return { source: 'ai_agent' }; }
  private touch() { this.d.hub.publish({ type: 'conversation', conversationId: this.conv.id }); }

  async assign(target: AssignTarget, strategy: 'round_robin' | 'least_open'): Promise<string> {
    const { store } = this.d;
    if (target.kind === 'agent') {
      if (!target.agentId || !store.liveAgent(target.agentId)) throw new Error(`Agent "${target.name}" is not active`);
      store.cancelFollowups(this.conv.id, 'handed to another agent');
      store.patchConversation(this.conv.id, { handler: 'ai', agent_id: target.agentId, assignee_team: null, assignee_user: null });
      store.addEvent(this.conv.id, 'assigned', { by: this.selfName });
      this.handoffTo = target.agentId;
      this.state.handler = 'ai';
      this.touch();
      return `Conversation handed to AI agent ${target.name}.`;
    }
    const conv = this.p.assignToHuman(this.conv.id, target.kind === 'team' ? { team: target.name } : { user: target.name }, { strategy });
    this.state.handler = 'human'; this.state.assignee_team = conv.assignee_team; this.state.assignee_user = conv.assignee_user;
    return conv.assignee_team ? `Assigned to ${conv.assignee_user} in ${conv.assignee_team}${target.kind === 'team' ? ` (${strategy})` : ''}.` : `Assigned to ${conv.assignee_user}.`;
  }

  async close(note: string | null, summary: string | null): Promise<string> {
    await this.p.setStatus(this.conv.id, 'closed', note, summary, this.origin);
    this.state.status = 'closed'; this.state.handler = 'none';
    return `Conversation closed${note ? ` with note "${note}"` : ''}. It can only be reopened by the contact's next message.`;
  }

  async setField(field: string, value: string | number): Promise<string> {
    const c = this.state.contact;
    if (field === 'Name') c.name = String(value); else if (field === 'Email') c.email = String(value); else c.fields[field] = value;
    await this.p.setField(this.conv.contact_id, this.conv.id, field, value, this.origin);
    return `Field "${field}" set to ${value}.`;
  }

  async setLifecycle(stage: string): Promise<string> {
    this.state.contact.lifecycle = stage;
    await this.p.setLifecycle(this.conv.contact_id, this.conv.id, stage, this.origin);
    return `Lifecycle stage set to "${stage}".`;
  }

  async updateTags(add: string[], remove: string[]): Promise<string> {
    this.state.contact.tags = await this.p.updateTags(this.conv.contact_id, this.conv.id, add, remove, this.origin);
    return `Tags are now: ${this.state.contact.tags.join(', ') || '(none)'}.`;
  }

  comment(text: string, mention: string | null): string {
    this.d.store.addComment(this.conv.id, this.selfName, mention ? `@${mention} ${text}` : text);
    this.touch();
    return 'Internal comment added.';
  }

  async sendAttachment(url: string, kind: 'image' | 'document', caption: string | null): Promise<string> {
    const m = await this.p.sendMedia(this.conv.id, url, kind, caption, 'ai');
    if (m.status === 'failed') throw new Error(m.error ?? 'attachment failed to send');
    return `Attachment sent (${kind}).`;
  }

  async triggerWorkflow(workflowId: number, vars: Record<string, string>): Promise<string> {
    if (!this.p.engine) throw new Error('Workflows are not enabled');
    const w = await this.p.engine.startManual(workflowId, this.conv.contact_id, this.conv.id, vars, { source: 'ai_agent' });
    return `Workflow "${w.name}" started. It runs independently; you will not see its result.`;
  }

  scheduleFollowups(steps: FollowupStep[], agentId: number): string {
    if (!this.p.followups) throw new Error('Follow-ups are not enabled');
    this.p.followups.schedule(this.conv.id, agentId, steps);
    return `Follow-ups scheduled (${steps.length}). They stop automatically if the contact replies or the conversation is reassigned or closed.`;
  }

  cancelFollowups(): string {
    const n = this.d.store.cancelFollowups(this.conv.id, 'cancelled by agent');
    return n ? 'Pending follow-ups cancelled.' : 'There were no pending follow-ups.';
  }
}
