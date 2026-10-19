import type { DatabaseSync } from 'node:sqlite';
import type {
  Agent, AgentDraft, AgentSnapshot, Comment, Contact, Conversation, ConvEvent, KnowledgeHit,
  KnowledgeSource, Message, MessageSender, MessageStatus, SkillConfig, SkillKey,
} from './types.js';
import { HISTORY_WINDOW } from './types.js';
import type { Graph, Trigger, WorkflowSettings, WorkflowRun, WorkflowRecord, RunStatus } from './workflow/types.js';

export interface MediaRow {
  id: number; message_id: number; wa_media_id: string | null; kind: string; mime: string | null; size: number | null; sha256: string | null;
  path: string | null; status: 'stored' | 'failed' | 'skipped' | 'expired'; transcript: string | null; caption: string | null; filename: string | null; error: string | null; created_at: number;
}
type Param = string | number | null | Uint8Array;
type Row = Record<string, unknown>;

export const SKILL_KEYS: SkillKey[] = ['assign', 'close', 'set_field', 'set_lifecycle', 'tags', 'comment', 'http', 'trigger_workflow', 'followup', 'attachment'];

export function emptyDraft(model: string): AgentDraft {
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, { enabled: false, prompt: '' } satisfies SkillConfig])) as Record<SkillKey, SkillConfig>;
  return { instructions: '', model, wait_seconds: 1, knowledge_ids: [], skills, http_actions: [] };
}

/** Fill in fields added after a draft/snapshot was stored (older rows stay valid). */
export function normalizeDraft<T extends Partial<AgentDraft>>(d: T): T & AgentDraft {
  const base = emptyDraft(d.model ?? '');
  return { ...base, ...d, skills: { ...base.skills, ...(d.skills ?? {}) }, http_actions: d.http_actions ?? [] } as T & AgentDraft;
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
    return { ...(r as unknown as Agent), draft: normalizeDraft(json(r.draft, emptyDraft(''))) };
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
    const snap = r ? json<AgentSnapshot | null>(r.snapshot, null) : null;
    return snap ? normalizeDraft(snap) : null;
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
  setEmbedStatus(sourceId: number, status: 'none' | 'pending' | 'done' | 'failed', error: string | null, model: string | null): void {
    this.run('UPDATE knowledge_source SET embed_status = ?, embed_error = ?, embed_model = ? WHERE id = ?', status, error, model, sourceId);
  }
  chunksNeedingEmbedding(sourceId: number, model: string, limit: number): { id: number; text: string }[] {
    return this.all('SELECT id, text FROM knowledge_chunk WHERE source_id = ? AND (embedding IS NULL OR embed_model IS NOT ?) ORDER BY ord LIMIT ?', sourceId, model, limit) as never;
  }
  setChunkEmbedding(chunkId: number, blob: Uint8Array, model: string): void {
    this.run('UPDATE knowledge_chunk SET embedding = ?, embed_model = ? WHERE id = ?', blob, model, chunkId);
  }
  clearEmbeddings(sourceId?: number): void {
    if (sourceId === undefined) this.run('UPDATE knowledge_chunk SET embedding = NULL, embed_model = NULL');
    else this.run('UPDATE knowledge_chunk SET embedding = NULL, embed_model = NULL WHERE source_id = ?', sourceId);
  }
  embeddingProgress(sourceId: number, model: string): { done: number; total: number } {
    const r = this.get('SELECT COUNT(*) AS total, SUM(embed_model = ? AND embedding IS NOT NULL) AS done FROM knowledge_chunk WHERE source_id = ?', model, sourceId)!;
    return { done: Number(r.done ?? 0), total: Number(r.total) };
  }
  embeddingsFor(sourceIds: number[], model: string): { id: number; source_id: number; text: string; embedding: Uint8Array; source: string }[] {
    if (!sourceIds.length) return [];
    const marks = sourceIds.map(() => '?').join(',');
    return this.all(`SELECT c.id AS id, c.source_id AS source_id, c.text AS text, c.embedding AS embedding, s.name AS source FROM knowledge_chunk c JOIN knowledge_source s ON s.id = c.source_id WHERE c.source_id IN (${marks}) AND c.embed_model = ? AND c.embedding IS NOT NULL ORDER BY c.id`, ...sourceIds, model) as never;
  }
  /** BM25 keyword search over the chosen sources (the AI searches by content keywords, not by document title). */
  searchKnowledge(sourceIds: number[], query: string, limit = 5): KnowledgeHit[] {
    if (!sourceIds.length) return [];
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 12);
    if (!terms.length) return [];
    const match = terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const marks = sourceIds.map(() => '?').join(',');
    const rows = this.all(
      `SELECT f.rowid AS chunk_id, f.text AS text, f.source_id AS source_id, s.name AS source
         FROM chunk_fts f JOIN knowledge_source s ON s.id = f.source_id
        WHERE chunk_fts MATCH ? AND f.source_id IN (${marks})
        ORDER BY bm25(chunk_fts) LIMIT ?`, match, ...sourceIds, limit);
    return rows as unknown as KnowledgeHit[];
  }

  // ---- workflows ------------------------------------------------------------------------------
  private toWorkflow(r: Row): WorkflowRecord {
    return {
      ...(r as unknown as WorkflowRecord),
      trigger: json<Trigger>(r.trigger, { type: 'manual' }),
      graph: json<Graph>(r.graph, { start: null, steps: {} }),
      settings: json<WorkflowSettings>(r.settings, {}),
    };
  }
  createWorkflow(name: string, trigger: Trigger, graph: Graph, settings: WorkflowSettings, hookToken: string): WorkflowRecord {
    const t = now();
    const id = Number(this.run('INSERT INTO workflow (name, status, trigger, graph, settings, hook_token, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      name, 'draft', JSON.stringify(trigger), JSON.stringify(graph), JSON.stringify(settings), hookToken, t, t).lastInsertRowid);
    return this.getWorkflow(id)!;
  }
  getWorkflow(id: number): WorkflowRecord | undefined {
    const r = this.get('SELECT * FROM workflow WHERE id = ?', id);
    return r ? this.toWorkflow(r) : undefined;
  }
  getWorkflowByName(name: string): WorkflowRecord | undefined {
    const r = this.get('SELECT * FROM workflow WHERE name = ?', name);
    return r ? this.toWorkflow(r) : undefined;
  }
  getWorkflowByToken(token: string): WorkflowRecord | undefined {
    const r = this.get('SELECT * FROM workflow WHERE hook_token = ?', token);
    return r ? this.toWorkflow(r) : undefined;
  }
  listWorkflows(): WorkflowRecord[] {
    return this.all('SELECT * FROM workflow ORDER BY id').map((r) => this.toWorkflow(r));
  }
  publishedWorkflows(): WorkflowRecord[] {
    return this.all("SELECT * FROM workflow WHERE status = 'published' ORDER BY id").map((r) => this.toWorkflow(r));
  }
  updateWorkflow(id: number, p: { name?: string; trigger?: Trigger; graph?: Graph; settings?: WorkflowSettings }): WorkflowRecord {
    const w = this.getWorkflow(id)!;
    this.run('UPDATE workflow SET name = ?, trigger = ?, graph = ?, settings = ?, updated_at = ? WHERE id = ?',
      p.name ?? w.name, JSON.stringify(p.trigger ?? w.trigger), JSON.stringify(p.graph ?? w.graph), JSON.stringify(p.settings ?? w.settings), now(), id);
    return this.getWorkflow(id)!;
  }
  setWorkflowStatus(id: number, status: 'draft' | 'published' | 'stopped'): WorkflowRecord {
    this.run('UPDATE workflow SET status = ?, published_at = CASE WHEN ? = \'published\' THEN ? ELSE published_at END, updated_at = ? WHERE id = ?', status, status, now(), now(), id);
    return this.getWorkflow(id)!;
  }
  deleteWorkflow(id: number): void {
    this.run('DELETE FROM workflow_run WHERE workflow_id = ?', id);
    this.run('DELETE FROM workflow WHERE id = ?', id);
  }
  countWorkflows(): number {
    return Number(this.get('SELECT COUNT(*) AS n FROM workflow')!.n);
  }

  private toRun(r: Row): WorkflowRun {
    return { ...(r as unknown as WorkflowRun), vars: json(r.vars, {}), trigger_vars: json(r.trigger_vars, {}), is_test: !!r.is_test };
  }
  createRun(workflowId: number, contactId: number, conversationId: number | null, stepId: string | null, triggerVars: Record<string, unknown>, isTest: boolean): WorkflowRun {
    const t = now();
    const id = Number(this.run('INSERT INTO workflow_run (workflow_id, contact_id, conversation_id, status, step_id, trigger_vars, is_test, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      workflowId, contactId, conversationId, 'running', stepId, JSON.stringify(triggerVars), isTest ? 1 : 0, t, t).lastInsertRowid);
    return this.getRun(id)!;
  }
  getRun(id: number): WorkflowRun | undefined {
    const r = this.get('SELECT * FROM workflow_run WHERE id = ?', id);
    return r ? this.toRun(r) : undefined;
  }
  saveRun(r: WorkflowRun): void {
    this.run('UPDATE workflow_run SET conversation_id = ?, status = ?, step_id = ?, wait_kind = ?, wait_until = ?, vars = ?, steps_run = ?, ended_reason = ?, updated_at = ? WHERE id = ?',
      r.conversation_id, r.status, r.step_id, r.wait_kind, r.wait_until, JSON.stringify(r.vars), r.steps_run, r.ended_reason, now(), r.id);
  }
  activeRuns(opts: { workflowId?: number; contactId?: number } = {}): WorkflowRun[] {
    const where = ["status IN ('running','waiting')"];
    const p: Param[] = [];
    if (opts.workflowId != null) { where.push('workflow_id = ?'); p.push(opts.workflowId); }
    if (opts.contactId != null) { where.push('contact_id = ?'); p.push(opts.contactId); }
    return this.all(`SELECT * FROM workflow_run WHERE ${where.join(' AND ')} ORDER BY id`, ...p).map((r) => this.toRun(r));
  }
  dueRuns(at: number): WorkflowRun[] {
    return this.all("SELECT * FROM workflow_run WHERE status = 'waiting' AND wait_until IS NOT NULL AND wait_until <= ? ORDER BY wait_until", at).map((r) => this.toRun(r));
  }
  runsFor(workflowId: number, limit = 50): WorkflowRun[] {
    return this.all('SELECT * FROM workflow_run WHERE workflow_id = ? ORDER BY id DESC LIMIT ?', workflowId, limit).map((r) => this.toRun(r));
  }
  recentRunCount(workflowId: number, contactId: number, since: number): number {
    return Number(this.get('SELECT COUNT(*) AS n FROM workflow_run WHERE workflow_id = ? AND contact_id = ? AND created_at >= ?', workflowId, contactId, since)!.n);
  }
  endRunsFor(workflowId: number, reason: string, status: RunStatus = 'exited'): number {
    return Number(this.run("UPDATE workflow_run SET status = ?, ended_reason = ?, wait_until = NULL, updated_at = ? WHERE workflow_id = ? AND status IN ('running','waiting')", status, reason, now(), workflowId).changes);
  }

  // ---- WhatsApp templates ---------------------------------------------------------------------
  upsertTemplate(name: string, language: string, body: string): { id: number; name: string; language: string; body: string; params: number } {
    const params = new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))).size;
    this.run('INSERT INTO wa_template (name, language, body, params) VALUES (?,?,?,?) ON CONFLICT(name, language) DO UPDATE SET body = excluded.body, params = excluded.params', name, language, body, params);
    return this.getTemplate(name, language)!;
  }
  getTemplate(name: string, language?: string): { id: number; name: string; language: string; body: string; params: number } | undefined {
    const r = language
      ? this.get('SELECT * FROM wa_template WHERE name = ? AND language = ?', name, language)
      : this.get('SELECT * FROM wa_template WHERE name = ? ORDER BY id LIMIT 1', name);
    return r as never;
  }
  listTemplates(): { id: number; name: string; language: string; body: string; params: number }[] {
    return this.all('SELECT * FROM wa_template ORDER BY name, language') as never;
  }
  deleteTemplate(id: number): void {
    this.run('DELETE FROM wa_template WHERE id = ?', id);
  }

  // ---- follow-ups -----------------------------------------------------------------------------
  cancelFollowups(conversationId: number, reason = 'cancelled'): number {
    return Number(this.run("UPDATE followup_job SET status = 'cancelled', error = ? WHERE conversation_id = ? AND status IN ('queued','pending')", reason, conversationId).changes);
  }
  addFollowups(conversationId: number, agentId: number, steps: { delay_minutes: number; message: string | null; template: string | null; params: string[]; actions: unknown[] }[]): void {
    this.cancelFollowups(conversationId, 'replaced');
    const t = now();
    steps.forEach((st, i) => {
      this.run('INSERT INTO followup_job (conversation_id, agent_id, seq, delay_minutes, run_at, message, template, params, actions, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        conversationId, agentId, i, st.delay_minutes, i === 0 ? t + st.delay_minutes * 60_000 : null, st.message, st.template, JSON.stringify(st.params), JSON.stringify(st.actions), i === 0 ? 'pending' : 'queued', t);
    });
  }
  dueFollowups(at: number): { id: number; conversation_id: number; agent_id: number; seq: number; message: string | null; template: string | null; params: string[]; actions: { tool: string; input: Record<string, unknown> }[] }[] {
    return this.all("SELECT * FROM followup_job WHERE status = 'pending' AND run_at IS NOT NULL AND run_at <= ? ORDER BY run_at", at)
      .map((r) => ({ ...(r as never as { id: number; conversation_id: number; agent_id: number; seq: number; message: string | null; template: string | null }), params: json(r.params, []), actions: json(r.actions, []) }));
  }
  finishFollowup(id: number, status: 'sent' | 'failed', error: string | null): void {
    this.run('UPDATE followup_job SET status = ?, error = ? WHERE id = ?', status, error, id);
  }
  activateNextFollowup(conversationId: number, afterSeq: number): void {
    const next = this.get("SELECT * FROM followup_job WHERE conversation_id = ? AND seq = ? AND status = 'queued'", conversationId, afterSeq + 1);
    if (next) this.run("UPDATE followup_job SET status = 'pending', run_at = ? WHERE id = ?", now() + Number(next.delay_minutes) * 60_000, next.id as number);
  }
  followupsFor(conversationId: number): Row[] {
    return this.all('SELECT * FROM followup_job WHERE conversation_id = ? ORDER BY id', conversationId);
  }

  // ---- media ----------------------------------------------------------------------------------
  addMedia(m: { message_id: number; wa_media_id?: string | null; kind: string; mime?: string | null; size?: number | null; sha256?: string | null; path?: string | null; status: string; caption?: string | null; filename?: string | null; error?: string | null }): MediaRow {
    const id = Number(this.run('INSERT INTO media (message_id, wa_media_id, kind, mime, size, sha256, path, status, caption, filename, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      m.message_id, m.wa_media_id ?? null, m.kind, m.mime ?? null, m.size ?? null, m.sha256 ?? null, m.path ?? null, m.status, m.caption ?? null, m.filename ?? null, m.error ?? null, now()).lastInsertRowid);
    return this.getMedia(id)!;
  }
  getMedia(id: number): MediaRow | undefined {
    return this.get('SELECT * FROM media WHERE id = ?', id) as unknown as MediaRow | undefined;
  }
  updateMedia(id: number, p: Partial<Pick<MediaRow, 'status' | 'transcript' | 'error' | 'path'>>): void {
    const cur = this.getMedia(id)!;
    this.run('UPDATE media SET status = ?, transcript = ?, error = ?, path = ? WHERE id = ?',
      p.status ?? cur.status, p.transcript === undefined ? cur.transcript : p.transcript, p.error === undefined ? cur.error : p.error, p.path === undefined ? cur.path : p.path, id);
  }
  updateMessageBody(id: number, body: string): void {
    this.run('UPDATE message SET body = ? WHERE id = ?', body, id);
  }
  /** Media rows for a conversation (without file paths: those never leave the server). */
  mediaForConversation(conversationId: number): Omit<MediaRow, 'path' | 'sha256'>[] {
    return this.all('SELECT m.id, m.message_id, m.wa_media_id, m.kind, m.mime, m.size, m.status, m.transcript, m.caption, m.filename, m.error, m.created_at FROM media m JOIN message g ON g.id = m.message_id WHERE g.conversation_id = ? ORDER BY m.id', conversationId) as never;
  }
  /** The AI sees at most the 5 most recent stored files that sit inside its 20-message window. */
  recentMediaForAi(conversationId: number, limit = 5): MediaRow[] {
    const win = this.recentMessages(conversationId, HISTORY_WINDOW);
    if (!win.length) return [];
    const marks = win.map(() => '?').join(',');
    return (this.all(`SELECT * FROM media WHERE message_id IN (${marks}) AND status = 'stored' AND path IS NOT NULL AND (kind = 'image' OR (kind = 'document' AND mime = 'application/pdf')) ORDER BY id DESC LIMIT ?`, ...win.map((m) => m.id), limit) as unknown as MediaRow[]).reverse();
  }
  expiredMedia(before: number): MediaRow[] {
    return this.all("SELECT * FROM media WHERE created_at < ? AND status IN ('stored','failed','skipped')", before) as unknown as MediaRow[];
  }
  pathInUse(path: string, exceptId: number): boolean {
    return !!this.get("SELECT 1 AS x FROM media WHERE path = ? AND id != ? AND status = 'stored'", path, exceptId);
  }
  mediaBySha(sha: string): MediaRow | undefined {
    return this.get("SELECT * FROM media WHERE sha256 = ? AND status = 'stored' AND path IS NOT NULL LIMIT 1", sha) as unknown as MediaRow | undefined;
  }

  // ---- misc queries ---------------------------------------------------------------------------
  recentAgentRunCount(conversationId: number, since: number): number {
    return Number(this.get('SELECT COUNT(*) AS n FROM agent_run WHERE conversation_id = ? AND created_at >= ? AND error IS NOT ?', conversationId, since, 'superseded by newer message')!.n);
  }
  knowledgeMentions(sourceIds: number[], needle: string): boolean {
    if (!sourceIds.length) return false;
    const marks = sourceIds.map(() => '?').join(',');
    return !!this.get(`SELECT 1 AS x FROM knowledge_chunk WHERE source_id IN (${marks}) AND instr(text, ?) > 0 LIMIT 1`, ...sourceIds, needle);
  }
  contactByPhone(waId: string): Contact | undefined {
    const r = this.get('SELECT * FROM contact WHERE wa_id = ?', waId);
    return r ? this.toContact(r) : undefined;
  }
  openConversationsNeedingReply(since: number): Conversation[] {
    return this.all(`SELECT c.* FROM conversation c WHERE c.status = 'open' AND c.handler = 'ai' AND c.agent_id IS NOT NULL
      AND (SELECT direction FROM message m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) = 'in'
      AND (SELECT created_at FROM message m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) >= ?`, since) as unknown as Conversation[];
  }

  metrics(since: number): Record<string, unknown> {
    const n = (sql: string, ...p: Param[]) => Number(this.get(sql, ...p)!.n);
    const rows = (sql: string, ...p: Param[]) => this.all(sql, ...p);
    return {
      conversations: {
        total: n('SELECT COUNT(*) AS n FROM conversation'),
        open: n("SELECT COUNT(*) AS n FROM conversation WHERE status = 'open'"),
        closed: n("SELECT COUNT(*) AS n FROM conversation WHERE status = 'closed'"),
        byHandler: rows("SELECT handler AS k, COUNT(*) AS v FROM conversation WHERE status = 'open' GROUP BY handler"),
      },
      contacts: { total: n('SELECT COUNT(*) AS n FROM contact'), byLifecycle: rows("SELECT COALESCE(lifecycle,'(none)') AS k, COUNT(*) AS v FROM contact GROUP BY lifecycle ORDER BY v DESC") },
      messages: {
        inbound: n("SELECT COUNT(*) AS n FROM message WHERE direction = 'in' AND created_at >= ?", since),
        bySender: rows("SELECT sender AS k, COUNT(*) AS v FROM message WHERE direction = 'out' AND created_at >= ? GROUP BY sender", since),
        failed: n("SELECT COUNT(*) AS n FROM message WHERE status = 'failed' AND created_at >= ?", since),
        perDay: rows("SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day, SUM(direction='in') AS inbound, SUM(direction='out') AS outbound FROM message WHERE created_at >= ? GROUP BY day ORDER BY day", since),
      },
      ai: {
        runs: n('SELECT COUNT(*) AS n FROM agent_run WHERE created_at >= ?', since),
        errors: n("SELECT COUNT(*) AS n FROM agent_run WHERE created_at >= ? AND error IS NOT NULL AND error != 'superseded by newer message'", since),
        avgLatencyMs: Math.round(Number(this.get('SELECT COALESCE(AVG(latency_ms),0) AS n FROM agent_run WHERE created_at >= ?', since)!.n)),
        inputTokens: n("SELECT COALESCE(SUM(json_extract(usage,'$.input')),0) AS n FROM agent_run WHERE created_at >= ?", since),
        outputTokens: n("SELECT COALESCE(SUM(json_extract(usage,'$.output')),0) AS n FROM agent_run WHERE created_at >= ?", since),
        byAgent: rows('SELECT a.name AS k, COUNT(*) AS v FROM agent_run r JOIN agent a ON a.id = r.agent_id WHERE r.created_at >= ? GROUP BY a.name ORDER BY v DESC', since),
        followupsSent: n("SELECT COUNT(*) AS n FROM followup_job WHERE status = 'sent' AND created_at >= ?", since),
      },
      workflows: {
        runs: n('SELECT COUNT(*) AS n FROM workflow_run WHERE created_at >= ?', since),
        byStatus: rows('SELECT status AS k, COUNT(*) AS v FROM workflow_run WHERE created_at >= ? GROUP BY status', since),
      },
    };
  }
}
