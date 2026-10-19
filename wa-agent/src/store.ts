import type { DatabaseSync } from 'node:sqlite';
import type {
  Agent, AgentDraft, AgentSnapshot, Comment, Contact, Conversation, ConvEvent, KnowledgeHit,
  KnowledgeSource, Message, MessageSender, MessageStatus, SkillConfig, SkillKey,
} from './types.js';
import { HISTORY_WINDOW } from './types.js';

type Param = string | number | null;
type Row = Record<string, unknown>;

export const SKILL_KEYS: SkillKey[] = ['assign', 'close', 'set_field', 'set_lifecycle', 'tags', 'comment'];

export function emptyDraft(model: string): AgentDraft {
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, { enabled: false, prompt: '' } satisfies SkillConfig])) as Record<SkillKey, SkillConfig>;
  return { instructions: '', model, wait_seconds: 1, knowledge_ids: [], skills };
}

const now = () => Date.now();
const json = <T>(s: unknown, d: T): T => {
  try { return JSON.parse(String(s)) as T; } catch { return d; }
};

export class Store {
  constructor(readonly db: DatabaseSync) {}

  private get(sql: string, ...p: Param[]): Row | undefined {
    const r = this.db.prepare(sql).get(...p);
    return r ? { ...r } : undefined;
  }
  private all(sql: string, ...p: Param[]): Row[] {
    return this.db.prepare(sql).all(...p).map((r) => ({ ...r }));
  }
  private run(sql: string, ...p: Param[]) {
    return this.db.prepare(sql).run(...p);
  }

  // ---- contacts -------------------------------------------------------------------------------
  private toContact(r: Row): Contact {
    return { ...(r as unknown as Contact), tags: json(r.tags, []), fields: json(r.fields, {}) };
  }
  upsertContact(waId: string, name: string | null): Contact {
    const ex = this.get('SELECT * FROM contact WHERE wa_id = ?', waId);
    if (ex) {
      if (name && name !== ex.name) this.run('UPDATE contact SET name = ? WHERE id = ?', name, ex.id as number);
      return this.getContact(ex.id as number)!;
    }
    const id = Number(this.run('INSERT INTO contact (wa_id, name, created_at) VALUES (?, ?, ?)', waId, name, now()).lastInsertRowid);
    return this.getContact(id)!;
  }
  getContact(id: number): Contact | undefined {
    const r = this.get('SELECT * FROM contact WHERE id = ?', id);
    return r ? this.toContact(r) : undefined;
  }
  patchContact(id: number, patch: Partial<Pick<Contact, 'name' | 'email' | 'lifecycle' | 'tags' | 'fields'>>): Contact {
    const c = this.getContact(id)!;
    const n = { ...c, ...patch };
    this.run('UPDATE contact SET name = ?, email = ?, lifecycle = ?, tags = ?, fields = ? WHERE id = ?',
      n.name, n.email, n.lifecycle, JSON.stringify(n.tags), JSON.stringify(n.fields), id);
    return this.getContact(id)!;
  }

  // ---- conversations --------------------------------------------------------------------------
  getConversation(id: number): Conversation | undefined {
    return this.get('SELECT * FROM conversation WHERE id = ?', id) as unknown as Conversation | undefined;
  }
  findOpenConversation(contactId: number): Conversation | undefined {
    return this.get("SELECT * FROM conversation WHERE contact_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", contactId) as unknown as Conversation | undefined;
  }
  lastConversation(contactId: number): Conversation | undefined {
    return this.get('SELECT * FROM conversation WHERE contact_id = ? ORDER BY id DESC LIMIT 1', contactId) as unknown as Conversation | undefined;
  }
  createConversation(contactId: number): Conversation {
    const id = Number(this.run('INSERT INTO conversation (contact_id, opened_at) VALUES (?, ?)', contactId, now()).lastInsertRowid);
    return this.getConversation(id)!;
  }
  reopenConversation(id: number): Conversation {
    this.run("UPDATE conversation SET status = 'open', closed_at = NULL WHERE id = ?", id);
    return this.getConversation(id)!;
  }
  patchConversation(id: number, patch: Partial<Omit<Conversation, 'id' | 'contact_id'>>): Conversation {
    const entries = Object.entries(patch);
    if (entries.length) {
      const sql = `UPDATE conversation SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`;
      this.run(sql, ...entries.map(([, v]) => v as Param), id);
    }
    return this.getConversation(id)!;
  }
  listConversations(status?: string): (Conversation & { contact_name: string | null; wa_id: string; last_body: string | null; last_at: number | null })[] {
    const where = status ? 'WHERE c.status = ?' : '';
    const rows = this.all(
      `SELECT c.*, ct.name AS contact_name, ct.wa_id AS wa_id,
        (SELECT body FROM message m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM message m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
       FROM conversation c JOIN contact ct ON ct.id = c.contact_id ${where} ORDER BY COALESCE(last_at, c.opened_at) DESC LIMIT 200`,
      ...(status ? [status] : []));
    return rows as never;
  }
  countOpenForUser(user: string): number {
    return Number(this.get("SELECT COUNT(*) AS n FROM conversation WHERE status = 'open' AND assignee_user = ?", user)!.n);
  }

  // ---- messages -------------------------------------------------------------------------------
  insertMessage(m: { conversation_id: number; direction: 'in' | 'out'; sender: MessageSender; type?: string; body: string; wa_message_id?: string | null; status: MessageStatus; error?: string | null; created_at?: number }): Message {
    const id = Number(this.run(
      'INSERT INTO message (conversation_id, direction, sender, type, body, wa_message_id, status, error, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      m.conversation_id, m.direction, m.sender, m.type ?? 'text', m.body, m.wa_message_id ?? null, m.status, m.error ?? null, m.created_at ?? now()).lastInsertRowid);
    return this.get('SELECT * FROM message WHERE id = ?', id) as unknown as Message;
  }
  findMessageByWaId(waId: string): Message | undefined {
    return this.get('SELECT * FROM message WHERE wa_message_id = ?', waId) as unknown as Message | undefined;
  }
  updateMessage(id: number, patch: { status?: MessageStatus; error?: string | null; wa_message_id?: string | null }): void {
    const cur = this.get('SELECT * FROM message WHERE id = ?', id)!;
    this.run('UPDATE message SET status = ?, error = ?, wa_message_id = ? WHERE id = ?',
      patch.status ?? (cur.status as string), patch.error === undefined ? (cur.error as string | null) : patch.error,
      patch.wa_message_id === undefined ? (cur.wa_message_id as string | null) : patch.wa_message_id, id);
  }
  messages(conversationId: number): Message[] {
    return this.all('SELECT * FROM message WHERE conversation_id = ? ORDER BY id', conversationId) as unknown as Message[];
  }
  recentMessages(conversationId: number, n = HISTORY_WINDOW): Message[] {
    return (this.all('SELECT * FROM message WHERE conversation_id = ? ORDER BY id DESC LIMIT ?', conversationId, n) as unknown as Message[]).reverse();
  }
  lastInboundMessageId(conversationId: number): number {
    return Number(this.get("SELECT COALESCE(MAX(id), 0) AS n FROM message WHERE conversation_id = ? AND direction = 'in'", conversationId)!.n);
  }
  lastMessageId(conversationId: number): number {
    return Number(this.get('SELECT COALESCE(MAX(id), 0) AS n FROM message WHERE conversation_id = ?', conversationId)!.n);
  }

  // ---- events & comments ----------------------------------------------------------------------
  addEvent(conversationId: number, type: ConvEvent['type'], payload: Record<string, unknown> = {}): void {
    this.run('INSERT INTO conv_event (conversation_id, type, payload, after_message_id, created_at) VALUES (?,?,?,?,?)',
      conversationId, type, JSON.stringify(payload), this.lastMessageId(conversationId), now());
  }
  /** Latest event per type that still sits inside the AI's 20-message window. */
  eventsInWindow(conversationId: number): ConvEvent[] {
    const win = this.recentMessages(conversationId, HISTORY_WINDOW);
    const startId = win.length >= HISTORY_WINDOW ? win[0].id : 0;
    const rows = this.all('SELECT * FROM conv_event WHERE conversation_id = ? AND after_message_id >= ? ORDER BY id DESC', conversationId, startId);
    const seen = new Set<string>();
    const out: ConvEvent[] = [];
    for (const r of rows) {
      const t = r.type as string;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ ...(r as unknown as ConvEvent), payload: json(r.payload, {}) });
    }
    return out.reverse();
  }
  events(conversationId: number): ConvEvent[] {
    return this.all('SELECT * FROM conv_event WHERE conversation_id = ? ORDER BY id', conversationId)
      .map((r) => ({ ...(r as unknown as ConvEvent), payload: json(r.payload, {}) }));
  }
  addComment(conversationId: number, author: string, body: string): Comment {
    const id = Number(this.run('INSERT INTO comment (conversation_id, author, body, created_at) VALUES (?,?,?,?)', conversationId, author, body, now()).lastInsertRowid);
    return this.get('SELECT * FROM comment WHERE id = ?', id) as unknown as Comment;
  }
  comments(conversationId: number): Comment[] {
    return this.all('SELECT * FROM comment WHERE conversation_id = ? ORDER BY id', conversationId) as unknown as Comment[];
  }

  // ---- agents ---------------------------------------------------------------------------------
  private toAgent(r: Row): Agent {
    return { ...(r as unknown as Agent), draft: json(r.draft, emptyDraft('')) };
  }
  createAgent(name: string, emoji: string, description: string, draft: AgentDraft): Agent {
    const t = now();
    const id = Number(this.run('INSERT INTO agent (name, emoji, description, draft, created_at, updated_at) VALUES (?,?,?,?,?,?)', name, emoji, description, JSON.stringify(draft), t, t).lastInsertRowid);
    return this.getAgent(id)!;
  }
  getAgent(id: number): Agent | undefined {
    const r = this.get('SELECT * FROM agent WHERE id = ?', id);
    return r ? this.toAgent(r) : undefined;
  }
  listAgents(): Agent[] {
    return this.all('SELECT * FROM agent ORDER BY id').map((r) => this.toAgent(r));
  }
  updateAgent(id: number, p: { name?: string; emoji?: string; description?: string; draft?: AgentDraft }): Agent {
    const a = this.getAgent(id)!;
    this.run('UPDATE agent SET name = ?, emoji = ?, description = ?, draft = ?, updated_at = ? WHERE id = ?',
      p.name ?? a.name, p.emoji ?? a.emoji, p.description ?? a.description, JSON.stringify(p.draft ?? a.draft), now(), id);
    return this.getAgent(id)!;
  }
  publishAgent(id: number): Agent {
    const a = this.getAgent(id)!;
    const version = (a.published_version ?? 0) + 1;
    const snapshot: AgentSnapshot = { ...a.draft, id, name: a.name, version };
    this.run('INSERT INTO agent_version (agent_id, version, snapshot, created_at) VALUES (?,?,?,?)', id, version, JSON.stringify(snapshot), now());
    this.run("UPDATE agent SET status = 'active', published_version = ?, updated_at = ? WHERE id = ?", version, now(), id);
    return this.getAgent(id)!;
  }
  unpublishAgent(id: number): Agent {
    this.run("UPDATE agent SET status = 'inactive', updated_at = ? WHERE id = ?", now(), id);
    return this.getAgent(id)!;
  }
  /** Live snapshot used by the runtime (null when the agent is inactive or never published). */
  liveAgent(id: number): AgentSnapshot | null {
    const a = this.getAgent(id);
    if (!a || a.status !== 'active' || a.published_version == null) return null;
    const r = this.get('SELECT snapshot FROM agent_version WHERE agent_id = ? AND version = ?', id, a.published_version);
    return r ? json<AgentSnapshot | null>(r.snapshot, null) : null;
  }
  activeAgents(): Agent[] {
    return this.listAgents().filter((a) => a.status === 'active');
  }
  getSetting(key: string): number | null {
    const r = this.get('SELECT value FROM kv WHERE key = ?', key);
    return r ? Number(r.value) : null;
  }
  setSetting(key: string, value: number | null): void {
    if (value == null) this.run('DELETE FROM kv WHERE key = ?', key);
    else this.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }
  nextCounter(key: string): number {
    const v = (this.getSetting(key) ?? 0) + 1;
    this.setSetting(key, v);
    return v - 1;
  }
  addRun(r: { conversation_id: number | null; agent_id: number; trigger: string; reply: string | null; tool_calls: unknown; usage: unknown; error: string | null; latency_ms: number }): void {
    this.run('INSERT INTO agent_run (conversation_id, agent_id, trigger, reply, tool_calls, usage, error, latency_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      r.conversation_id, r.agent_id, r.trigger, r.reply, JSON.stringify(r.tool_calls), JSON.stringify(r.usage), r.error, r.latency_ms, now());
  }
  runs(agentId: number, limit = 30): Row[] {
    return this.all('SELECT * FROM agent_run WHERE agent_id = ? ORDER BY id DESC LIMIT ?', agentId, limit)
      .map((r) => ({ ...r, tool_calls: json(r.tool_calls, []), usage: json(r.usage, {}) }));
  }

  // ---- knowledge ------------------------------------------------------------------------------
  addSource(name: string, type: 'text' | 'url', uri: string | null, chunks: string[], error: string | null = null): KnowledgeSource {
    const chars = chunks.reduce((n, c) => n + c.length, 0);
    const id = Number(this.run('INSERT INTO knowledge_source (name, type, uri, status, error, chars, chunks, created_at) VALUES (?,?,?,?,?,?,?,?)',
      name, type, uri, error ? 'error' : 'completed', error, chars, chunks.length, now()).lastInsertRowid);
    chunks.forEach((text, i) => {
      const cid = Number(this.run('INSERT INTO knowledge_chunk (source_id, ord, text) VALUES (?,?,?)', id, i, text).lastInsertRowid);
      this.run('INSERT INTO chunk_fts (rowid, text, source_id) VALUES (?,?,?)', cid, text, id);
    });
    return this.getSource(id)!;
  }
  getSource(id: number): KnowledgeSource | undefined {
    return this.get('SELECT * FROM knowledge_source WHERE id = ?', id) as unknown as KnowledgeSource | undefined;
  }
  listSources(): KnowledgeSource[] {
    return this.all('SELECT * FROM knowledge_source ORDER BY id DESC') as unknown as KnowledgeSource[];
  }
  countSources(): number {
    return Number(this.get('SELECT COUNT(*) AS n FROM knowledge_source')!.n);
  }
  deleteSource(id: number): void {
    const ids = this.all('SELECT id FROM knowledge_chunk WHERE source_id = ?', id).map((r) => r.id as number);
    for (const c of ids) this.run('DELETE FROM chunk_fts WHERE rowid = ?', c);
    this.run('DELETE FROM knowledge_chunk WHERE source_id = ?', id);
    this.run('DELETE FROM knowledge_source WHERE id = ?', id);
  }
  /** BM25 keyword search over the chosen sources (the AI searches by content keywords, not by document title). */
  searchKnowledge(sourceIds: number[], query: string, limit = 5): KnowledgeHit[] {
    if (!sourceIds.length) return [];
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 12);
    if (!terms.length) return [];
    const match = terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const marks = sourceIds.map(() => '?').join(',');
    const rows = this.all(
      `SELECT f.text AS text, f.source_id AS source_id, s.name AS source
         FROM chunk_fts f JOIN knowledge_source s ON s.id = f.source_id
        WHERE chunk_fts MATCH ? AND f.source_id IN (${marks})
        ORDER BY bm25(chunk_fts) LIMIT ?`, match, ...sourceIds, limit);
    return rows as unknown as KnowledgeHit[];
  }
}
