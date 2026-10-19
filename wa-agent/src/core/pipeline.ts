import type { Config } from '../config.js';
import type { Sender, InboundMessage, StatusUpdate } from '../channels/whatsapp.js';
import { splitText } from '../channels/whatsapp.js';
import type { LlmProvider } from '../agent/llm.js';
import { runAgent, type HistoryMsg, type RunResult } from '../agent/runtime.js';
import type { AgentEnv, AssignTarget, ConvState, Effects } from '../agent/skills.js';
import type { Store } from '../store.js';
import type { AgentSnapshot, Conversation, Message, MessageSender } from '../types.js';
import { teamOf, type Workspace } from '../workspace.js';
import type { EventHub } from './events.js';

export const MAX_HANDOFF_DEPTH = 3;

interface Deps {
  store: Store;
  sender: Sender;
  hub: EventHub;
  cfg: Config;
  workspace: Workspace;
  provider: LlmProvider;
  log?: (msg: string, extra?: unknown) => void;
}

type Trigger = 'message' | 'assignment';
interface Pending { timer: NodeJS.Timeout; resolve: () => void }

const STATUS_RANK: Record<string, number> = { received: 0, pending: 1, failed: 1, sent: 2, delivered: 3, read: 4 };

export class Pipeline {
  private pending = new Map<number, Pending>();
  private chains = new Map<number, Promise<void>>();
  private running = 0;

  constructor(readonly d: Deps) {}

  private log(msg: string, extra?: unknown) { this.d.log?.(msg, extra); }

  // ---- inbound --------------------------------------------------------------------------------
  async handleInbound(m: InboundMessage): Promise<void> {
    const { store, hub } = this.d;
    if (store.findMessageByWaId(m.waMessageId)) return; // WhatsApp retries deliveries: be idempotent

    const contact = store.upsertContact(m.from, m.name);
    let conv = store.findOpenConversation(contact.id);
    if (!conv) {
      const last = store.lastConversation(contact.id);
      if (last) {
        conv = store.reopenConversation(last.id);
        store.addEvent(conv.id, 'reopened');
      } else conv = store.createConversation(contact.id);
    }
    store.insertMessage({ conversation_id: conv.id, direction: 'in', sender: 'contact', type: m.type, body: m.text, wa_message_id: m.waMessageId, status: 'received', created_at: m.timestamp });
    conv = store.patchConversation(conv.id, { last_inbound_at: m.timestamp });
    hub.publish({ type: 'message', conversationId: conv.id });
    hub.publish({ type: 'conversation', conversationId: conv.id });
    await this.route(conv, m);
  }

  private async route(conv: Conversation, m?: InboundMessage): Promise<void> {
    const { store, cfg } = this.d;
    if (conv.handler === 'human') return; // a person owns it: inbox only
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
  /** Send free-form text. WhatsApp only allows this within 24h of the contact's last message. */
  async send(conversationId: number, text: string, sender: MessageSender): Promise<Message[]> {
    const { store, hub, cfg } = this.d;
    const conv = store.getConversation(conversationId);
    if (!conv) throw new Error('conversation not found');
    const contact = store.getContact(conv.contact_id)!;
    const out: Message[] = [];
    for (const part of splitText(text)) {
      const row = store.insertMessage({ conversation_id: conv.id, direction: 'out', sender, body: part, status: 'pending' });
      const cur = store.getConversation(conv.id)!;
      if (cur.last_inbound_at == null || Date.now() - cur.last_inbound_at > cfg.windowMs) {
        store.updateMessage(row.id, { status: 'failed', error: '24h customer-service window is closed: a WhatsApp template message is required' });
      } else {
        try {
          const r = await this.d.sender.sendText(contact.wa_id, part);
          store.updateMessage(row.id, { status: 'sent', wa_message_id: r.id });
        } catch (e) {
          store.updateMessage(row.id, { status: 'failed', error: (e as Error).message });
          this.log('send failed', (e as Error).message);
        }
      }
      out.push(store.messages(conv.id).find((x) => x.id === row.id)!);
      hub.publish({ type: 'message', conversationId: conv.id });
    }
    return out;
  }

  // ---- handler changes ------------------------------------------------------------------------
  /** `trigger` is 'message' when a contact message caused the assignment (so wait time still applies). */
  assignToAgent(conversationId: number, agentId: number, by: string, depth = 0, trigger: Trigger = 'assignment'): void {
    const { store, hub } = this.d;
    const snap = store.liveAgent(agentId);
    if (!snap) throw new Error('Agent is not published/active');
    this.cancel(conversationId);
    store.patchConversation(conversationId, { handler: 'ai', agent_id: agentId, assignee_team: null, assignee_user: null, status: 'open', closed_at: null });
    store.addEvent(conversationId, 'assigned', { by });
    hub.publish({ type: 'conversation', conversationId });
    this.scheduleAgent(conversationId, trigger, trigger === 'message' ? undefined : 0, depth);
  }

  takeover(conversationId: number, user = 'Inbox user'): Conversation {
    this.cancel(conversationId);
    const conv = this.d.store.patchConversation(conversationId, { handler: 'human', agent_id: null, assignee_user: user, assignee_team: null });
    this.d.hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  assignToHuman(conversationId: number, target: { team?: string; user?: string }): Conversation {
    const { store, workspace, hub } = this.d;
    this.cancel(conversationId);
    let team = target.team ?? null;
    let user = target.user ?? null;
    if (team && !teamOf(workspace, team)) throw new Error(`Unknown team "${team}"`);
    if (user && !workspace.users.includes(user)) throw new Error(`Unknown user "${user}"`);
    if (team && !user) user = this.pickMember(team, 'round_robin');
    if (user && !team) team = workspace.teams.find((t) => t.members.includes(user!))?.name ?? null;
    const conv = store.patchConversation(conversationId, { handler: 'human', agent_id: null, assignee_team: team, assignee_user: user });
    hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  unassign(conversationId: number): Conversation {
    this.cancel(conversationId);
    const conv = this.d.store.patchConversation(conversationId, { handler: 'none', agent_id: null, assignee_team: null, assignee_user: null });
    this.d.hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  setStatus(conversationId: number, status: 'open' | 'closed', note: string | null, summary: string | null): Conversation {
    const { store, hub, workspace } = this.d;
    if (note && !workspace.closing_notes.includes(note)) throw new Error(`Unknown closing note "${note}"`);
    this.cancel(conversationId);
    const conv = status === 'closed'
      ? store.patchConversation(conversationId, { status: 'closed', closed_at: Date.now(), closing_note: note, summary, handler: 'none', agent_id: null })
      : store.reopenConversation(conversationId);
    hub.publish({ type: 'conversation', conversationId });
    return conv;
  }

  pickMember(team: string, strategy: 'round_robin' | 'least_open'): string {
    const members = teamOf(this.d.workspace, team)!.members;
    if (strategy === 'least_open') {
      return [...members].sort((a, b) => this.d.store.countOpenForUser(a) - this.d.store.countOpenForUser(b))[0];
    }
    return members[this.d.store.nextCounter(`rr:${team}`) % members.length];
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

  private buildState(conv: Conversation): ConvState {
    const c = this.d.store.getContact(conv.contact_id)!;
    return {
      contact: { name: c.name, phone: c.wa_id, email: c.email, lifecycle: c.lifecycle, tags: [...c.tags], fields: { ...c.fields } },
      status: conv.status, handler: conv.handler, assignee_team: conv.assignee_team, assignee_user: conv.assignee_user,
    };
  }

  private async runAgentFor(conversationId: number, trigger: Trigger, depth: number): Promise<void> {
    const { store, hub, workspace } = this.d;
    const conv = store.getConversation(conversationId);
    if (!conv || conv.status !== 'open' || conv.handler !== 'ai' || !conv.agent_id) return;
    const snap = store.liveAgent(conv.agent_id);
    if (!snap) {
      store.patchConversation(conversationId, { handler: 'none', agent_id: null });
      return;
    }
    const inboundBefore = store.lastInboundMessageId(conversationId);
    const state = this.buildState(conv);
    const effects = new DbEffects(this, conv, state, snap.name, depth);
    const env: AgentEnv = {
      workspace, state, effects, selfName: snap.name,
      agents: store.activeAgents().map((a) => ({ id: a.id, name: a.name })),
      searchKnowledge: (q, ids) => store.searchKnowledge(ids, q),
    };
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
class DbEffects implements Effects {
  handoffTo: number | null = null;
  constructor(private p: Pipeline, private conv: Conversation, private state: ConvState, private selfName: string, private depth: number) {}

  private get d() { return this.p.d; }
  private touch() { this.d.hub.publish({ type: 'conversation', conversationId: this.conv.id }); }

  assign(target: AssignTarget, strategy: 'round_robin' | 'least_open'): string {
    const { store, workspace } = this.d;
    if (target.kind === 'agent') {
      if (!target.agentId || !store.liveAgent(target.agentId)) throw new Error(`Agent "${target.name}" is not active`);
      store.patchConversation(this.conv.id, { handler: 'ai', agent_id: target.agentId, assignee_team: null, assignee_user: null });
      store.addEvent(this.conv.id, 'assigned', { by: this.selfName });
      this.handoffTo = target.agentId;
      this.state.handler = 'ai';
      this.touch();
      return `Conversation handed to AI agent ${target.name}.`;
    }
    let team: string | null = null;
    let user: string;
    if (target.kind === 'team') {
      team = target.name;
      user = this.p.pickMember(team, strategy);
    } else {
      user = target.name;
      team = workspace.teams.find((t) => t.members.includes(user))?.name ?? null;
    }
    store.patchConversation(this.conv.id, { handler: 'human', agent_id: null, assignee_team: team, assignee_user: user });
    this.state.handler = 'human'; this.state.assignee_team = team; this.state.assignee_user = user;
    this.touch();
    return team ? `Assigned to ${user} in ${team}${target.kind === 'team' ? ` (${strategy})` : ''}.` : `Assigned to ${user}.`;
  }

  close(note: string | null, summary: string | null): string {
    this.d.store.patchConversation(this.conv.id, { status: 'closed', closed_at: Date.now(), closing_note: note, summary, handler: 'none', agent_id: null });
    this.state.status = 'closed'; this.state.handler = 'none';
    this.touch();
    return `Conversation closed${note ? ` with note "${note}"` : ''}. It can only be reopened by the contact's next message.`;
  }

  setField(field: string, value: string | number): string {
    const { store } = this.d;
    const c = this.state.contact;
    if (field === 'Name') { c.name = String(value); store.patchContact(this.conv.contact_id, { name: c.name }); }
    else if (field === 'Email') { c.email = String(value); store.patchContact(this.conv.contact_id, { email: c.email }); }
    else { c.fields[field] = value; store.patchContact(this.conv.contact_id, { fields: c.fields }); }
    this.touch();
    return `Field "${field}" set to ${value}.`;
  }

  setLifecycle(stage: string): string {
    this.d.store.patchContact(this.conv.contact_id, { lifecycle: stage });
    this.state.contact.lifecycle = stage;
    this.touch();
    return `Lifecycle stage set to "${stage}".`;
  }

  updateTags(add: string[], remove: string[]): string {
    const tags = new Set(this.state.contact.tags);
    add.forEach((t) => tags.add(t));
    remove.forEach((t) => tags.delete(t));
    this.state.contact.tags = [...tags];
    this.d.store.patchContact(this.conv.contact_id, { tags: this.state.contact.tags });
    this.touch();
    return `Tags are now: ${this.state.contact.tags.join(', ') || '(none)'}.`;
  }

  comment(text: string, mention: string | null): string {
    this.d.store.addComment(this.conv.id, this.selfName, mention ? `@${mention} ${text}` : text);
    this.touch();
    return 'Internal comment added.';
  }
}

export type { AgentSnapshot };
