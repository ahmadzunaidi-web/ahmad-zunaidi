import { randomBytes } from 'node:crypto';
import { safeRequest } from '../knowledge/safe-fetch.js';
import type { Origin, Pipeline } from '../core/pipeline.js';
import type { Conversation } from '../types.js';
import { BUILTIN_FIELDS } from '../workspace.js';
import { evalAll, evalCondition, type CondContext } from './conditions.js';
import { contactVars, renderTemplate, type TemplateContext } from './template.js';
import { LIMITS, type Condition, type Step, type WorkflowEvent, type WorkflowRecord, type WorkflowRun } from './types.js';
import type { WaitKind } from './types.js';

type Outcome =
  | { kind: 'go'; to: string | null }
  | { kind: 'wait'; waitKind: WaitKind; until: number }
  | { kind: 'end'; status: 'completed' | 'exited' | 'failed'; reason: string };

const DAY = 24 * 3600_000;
const ASSIGN_POLL_MS = 60_000;
const MAX_INVALID_ANSWERS = 3;

export const newHookToken = () => randomBytes(16).toString('hex');

/** Parsed, validated answer to an Ask a Question step. */
export function parseAnswer(c: Record<string, any>, raw: string): { ok: true; value: string | number } | { ok: false } {
  const text = raw.trim();
  switch (c.qtype) {
    case 'text': return text ? { ok: true, value: text.slice(0, 4000) } : { ok: false };
    case 'choice': {
      const choices: string[] = c.choices ?? [];
      const exact = choices.find((x) => x.toLowerCase() === text.toLowerCase());
      if (exact) return { ok: true, value: exact };
      if (/^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= choices.length) return { ok: true, value: choices[Number(text) - 1] };
      return { ok: false };
    }
    case 'number': {
      const n = Number(text.replace(/,/g, ''));
      if (!text || !Number.isFinite(n)) return { ok: false };
      if (c.min != null && c.min !== '' && n < Number(c.min)) return { ok: false };
      if (c.max != null && c.max !== '' && n > Number(c.max)) return { ok: false };
      return { ok: true, value: n };
    }
    case 'date': return parseDate(text, c.date_format ?? 'YYYY-MM-DD');
    case 'phone': {
      const digits = text.replace(/[\s()-]/g, '').replace(/^\+/, '');
      return /^\d{8,15}$/.test(digits) ? { ok: true, value: digits } : { ok: false };
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? { ok: true, value: text.toLowerCase() } : { ok: false };
    case 'url': {
      try { const u = new URL(text); return /^https?:$/.test(u.protocol) ? { ok: true, value: u.toString() } : { ok: false }; } catch { return { ok: false }; }
    }
    case 'rating': {
      const stars = (text.match(/⭐/g) ?? []).length;
      const n = stars || Number(text.match(/^[1-5]/)?.[0]);
      return Number.isInteger(n) && n >= 1 && n <= 5 ? { ok: true, value: n } : { ok: false };
    }
    case 'location': {
      const m = text.match(/\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?/);
      if (!m) return { ok: false };
      const lat = Number(m[1]), lon = Number(m[2]);
      return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { ok: true, value: `${lat},${lon}` } : { ok: false };
    }
    default: return { ok: false };
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(text: string, fmt: string): { ok: true; value: string } | { ok: false } {
  const parts = fmt.split(/([/-])/).filter((x) => x !== '/' && x !== '-');
  const sep = fmt.includes('/') ? '/' : '-';
  const vals = text.trim().split(sep);
  if (vals.length !== parts.length) return { ok: false };
  let y = new Date().getFullYear(), mo = 0, d = 0;
  for (const [i, tok] of parts.entries()) {
    const v = vals[i];
    if (tok === 'YYYY') { if (!/^\d{4}$/.test(v)) return { ok: false }; y = Number(v); }
    else if (tok === 'YY') { if (!/^\d{2}$/.test(v)) return { ok: false }; y = 2000 + Number(v); }
    else if (tok === 'MMM') { const k = MONTHS.indexOf(v.toLowerCase().slice(0, 3)); if (k < 0 || v.length < 3) return { ok: false }; mo = k + 1; }
    else if (tok === 'MM') { if (!/^\d{1,2}$/.test(v)) return { ok: false }; mo = Number(v); }
    else if (tok === 'DD') { if (!/^\d{1,2}$/.test(v)) return { ok: false }; d = Number(v); }
    else return { ok: false };
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { ok: false };
  return { ok: true, value: `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

const lookup = (obj: unknown, path: string): unknown => {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
};

/** Flatten nested JSON so triggers/templates can read {{$trigger.order.id}} (lookup walks the nested form, so keep both). */
export function triggerVarsFromBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export class WorkflowEngine {
  /** Set only while tick(now) runs, so timers/timeouts are testable and consistent. */
  private clock: number | null = null;
  constructor(private p: Pipeline) { p.engine = this; }

  private t(): number { return this.clock ?? Date.now(); }

  private get d() { return this.p.d; }
  private log(msg: string, extra?: unknown) { this.d.log?.(`[workflow] ${msg}`, extra); }
  private origin(wf: WorkflowRecord): Origin { return { source: 'workflow', originWorkflowId: wf.id }; }

  // ---- starting runs --------------------------------------------------------------------------
  private matches(w: WorkflowRecord, ev: WorkflowEvent): boolean {
    const t = w.trigger;
    if (t.type !== ev.type) return false;
    if (ev.originWorkflowId === w.id) return false; // a workflow never re-triggers itself
    const c = t.config ?? {};
    if (Array.isArray(c.sources) && c.sources.length && !c.sources.includes(ev.source)) return false;
    if (t.type === 'contact_tag_updated' && (c.tag !== ev.data?.tag || (c.action && c.action !== 'any' && c.action !== ev.data?.action))) return false;
    if (t.type === 'contact_field_updated' && c.field !== ev.data?.field) return false;
    if (t.type === 'lifecycle_updated' && c.stage && c.stage !== ev.data?.stage) return false;
    if (t.type === 'click_to_chat_ad' && c.campaign) {
      const r = ev.data?.referral ?? {};
      if (![r.headline, r.sourceUrl, r.sourceId, r.body].some((x) => (x ?? '').toLowerCase().includes(String(c.campaign).toLowerCase()))) return false;
    }
    const contact = this.d.store.getContact(ev.contactId);
    if (!contact) return false;
    return evalAll(t.conditions, this.condCtx(contact.id, ev.conversationId, {}, this.eventVars(ev)));
  }

  private eventVars(ev: WorkflowEvent): Record<string, unknown> {
    return { ...(ev.data?.referral ? { referral: ev.data.referral, ...ev.data.referral } : {}), ...(ev.data?.tag ? { tag: ev.data.tag, action: ev.data.action } : {}), ...(ev.data?.field ? { field: ev.data.field } : {}), ...(ev.data?.stage ? { stage: ev.data.stage } : {}), source: ev.source };
  }

  async fire(ev: WorkflowEvent): Promise<void> {
    for (const w of this.d.store.publishedWorkflows()) {
      if (!this.matches(w, ev)) continue;
      try { await this.begin(w, ev.contactId, ev.conversationId, this.eventVars(ev), false); } catch (e) { this.log(`"${w.name}" not started: ${(e as Error).message}`); }
    }
  }

  private ensureConversation(contactId: number, convId: number | null): Conversation {
    const { store } = this.d;
    const c = convId ? store.getConversation(convId) : undefined;
    return c ?? store.lastConversation(contactId) ?? store.createConversation(contactId);
  }

  /** Create a run and execute it until it waits or ends. */
  private async begin(w: WorkflowRecord, contactId: number, convId: number | null, vars: Record<string, unknown>, isTest: boolean): Promise<WorkflowRun> {
    const { store } = this.d;
    if (!w.graph.start) throw new Error('workflow has no steps');
    if (store.activeRuns({ workflowId: w.id, contactId }).length) throw new Error('contact is already in this workflow');
    if (store.recentRunCount(w.id, contactId, this.t() - 60_000) >= LIMITS.maxRunsPerMinute) throw new Error('too many runs for this contact (loop protection)');
    const conv = this.ensureConversation(contactId, convId);
    const run = store.createRun(w.id, contactId, conv.id, w.graph.start, vars, isTest);
    this.log(`"${w.name}" started for contact ${contactId}${isTest ? ' (test)' : ''}`);
    await this.advance(run, w);
    return store.getRun(run.id)!;
  }

  /** AI skill / "Trigger Another Workflow" step / shortcut: needs a published workflow. */
  async startManual(workflowId: number, contactId: number, convId: number | null, vars: Record<string, unknown>, o: { source: string; requireManual?: boolean } = { source: 'user' }): Promise<WorkflowRecord> {
    const w = this.d.store.getWorkflow(workflowId);
    if (!w) throw new Error('workflow not found');
    if (w.status !== 'published') throw new Error(`workflow "${w.name}" is not published`);
    if (o.requireManual !== false && w.trigger.type !== 'manual') throw new Error(`workflow "${w.name}" does not use the Manual trigger`);
    await this.begin(w, contactId, convId, vars, false);
    return w;
  }

  /** Draft/test runs and shortcut/webhook starts. */
  async startFor(w: WorkflowRecord, contactId: number, convId: number | null, vars: Record<string, unknown>, isTest = false): Promise<WorkflowRun> {
    if (!isTest && w.status !== 'published') throw new Error(`workflow "${w.name}" is not published`);
    return this.begin(w, contactId, convId, vars, isTest);
  }

  // ---- state queries --------------------------------------------------------------------------
  /** True while a workflow is talking to the contact (running or waiting for an answer). */
  holdsConversation(contactId: number): boolean {
    return this.d.store.activeRuns({ contactId }).some((r) => r.status === 'running' || r.wait_kind === 'question');
  }

  async consumeAnswer(contactId: number, text: string): Promise<boolean> {
    const run = this.d.store.activeRuns({ contactId }).reverse().find((r) => r.status === 'waiting' && r.wait_kind === 'question');
    if (!run) return false;
    const wf = this.d.store.getWorkflow(run.workflow_id);
    if (!wf) return false;
    await this.answer(run, wf, text);
    return true;
  }

  async noteIncoming(contactId: number): Promise<void> {
    await this.exitWhere(contactId, 'exit_on_incoming', 'contact_replied');
  }

  async onHumanActivity(contactId: number, kind: 'outgoing' | 'assign'): Promise<void> {
    await this.exitWhere(contactId, kind === 'outgoing' ? 'exit_on_outgoing' : 'exit_on_manual_assign', kind === 'outgoing' ? 'agent_replied' : 'manually_assigned');
  }

  private async exitWhere(contactId: number, flag: 'exit_on_incoming' | 'exit_on_outgoing' | 'exit_on_manual_assign', reason: string): Promise<void> {
    for (const r of this.d.store.activeRuns({ contactId })) {
      if (r.status !== 'waiting' || (flag === 'exit_on_incoming' && r.wait_kind === 'question')) continue;
      const wf = this.d.store.getWorkflow(r.workflow_id);
      if (wf?.settings?.[flag]) this.finish(r, 'exited', reason);
    }
  }

  stopWorkflow(id: number, reason = 'workflow_stopped'): number {
    return this.d.store.endRunsFor(id, reason);
  }

  // ---- timers ---------------------------------------------------------------------------------
  /** Resume runs whose wait/timeout expired. Call every few seconds. */
  async tick(now = Date.now()): Promise<number> {
    this.clock = now;
    try { return await this.tickInner(now); } finally { this.clock = null; }
  }

  private async tickInner(now: number): Promise<number> {
    const { store } = this.d;
    let n = 0;
    for (const run of store.dueRuns(now)) {
      const wf = store.getWorkflow(run.workflow_id);
      if (!wf) { this.finish(run, 'failed', 'workflow_deleted'); continue; }
      const step = wf.graph.steps[run.step_id ?? ''];
      n++;
      try {
        if (!step) { this.finish(run, 'failed', 'missing_step'); continue; }
        run.status = 'running'; run.wait_until = null;
        if (run.wait_kind === 'wait') { run.wait_kind = null; run.step_id = step.next ?? null; store.saveRun(run); await this.advance(run, wf); }
        else if (run.wait_kind === 'question') {
          run.wait_kind = null; delete run.vars.__q;
          if (step.config.timeout_branch) { run.step_id = step.outputs?.timeout ?? null; store.saveRun(run); await this.advance(run, wf); }
          else this.finish(run, 'exited', 'timeout');
        } else if (run.wait_kind === 'assign') { run.wait_kind = null; store.saveRun(run); await this.advance(run, wf); } // re-run the assign step
        else this.finish(run, 'failed', 'unknown_wait');
      } catch (e) { this.log('tick failed', (e as Error).message); this.finish(run, 'failed', (e as Error).message); }
    }
    return n;
  }

  // ---- interpreter ----------------------------------------------------------------------------
  private finish(run: WorkflowRun, status: 'completed' | 'exited' | 'failed', reason: string | null) {
    run.status = status; run.ended_reason = reason; run.wait_kind = null; run.wait_until = null;
    this.d.store.saveRun(run);
    this.log(`run ${run.id} ${status}${reason ? ` (${reason})` : ''}`);
  }

  private async advance(run: WorkflowRun, wf: WorkflowRecord): Promise<void> {
    const { store } = this.d;
    for (;;) {
      run = store.getRun(run.id)!;
      if (run.status !== 'running') return;
      if (!run.step_id) return this.finish(run, 'completed', null);
      if (run.steps_run >= LIMITS.maxRunSteps) return this.finish(run, 'exited', 'loop_guard');
      const step = wf.graph.steps[run.step_id];
      if (!step) return this.finish(run, 'failed', 'missing_step');
      run.steps_run++;
      let out: Outcome;
      try { out = await this.exec(step, run, wf); } catch (e) { out = { kind: 'end', status: 'failed', reason: (e as Error).message }; }
      if (out.kind === 'go') { run.step_id = out.to; store.saveRun(run); continue; }
      if (out.kind === 'wait') { run.status = 'waiting'; run.wait_kind = out.waitKind; run.wait_until = out.until; store.saveRun(run); return; }
      return this.finish(run, out.status, out.reason);
    }
  }

  private condCtx(contactId: number, convId: number | null, vars: Record<string, unknown>, trig: Record<string, unknown>): CondContext {
    const { store } = this.d;
    const c = store.getContact(contactId)!;
    const conv = convId ? store.getConversation(convId) : undefined;
    return { contact: { name: c.name, wa_id: c.wa_id, email: c.email, lifecycle: c.lifecycle, tags: c.tags, fields: c.fields }, conversation: conv ? { status: conv.status, handler: conv.handler, assignee_team: conv.assignee_team, assignee_user: conv.assignee_user } : null, vars, trigger: trig };
  }

  private tctx(run: WorkflowRun): TemplateContext {
    const c = this.d.store.getContact(run.contact_id)!;
    return { contact: contactVars(c), vars: run.vars, trigger: run.trigger_vars };
  }

  private async exec(step: Step, run: WorkflowRun, wf: WorkflowRecord): Promise<Outcome> {
    const { store, workspace } = this.d;
    const c = step.config ?? {};
    const conv = this.ensureConversation(run.contact_id, run.conversation_id);
    if (run.conversation_id !== conv.id) run.conversation_id = conv.id;
    const next = (): Outcome => ({ kind: 'go', to: step.next ?? null });
    const origin = this.origin(wf);
    const tctx = this.tctx(run);

    switch (step.type) {
      case 'send_message': {
        await this.p.send(conv.id, renderTemplate(c.text, tctx), 'workflow');
        return next();
      }
      case 'send_template': {
        const params = ((c.params ?? []) as string[]).map((x) => renderTemplate(String(x), tctx));
        const m = await this.p.sendTemplate(conv.id, c.template, null, params, 'workflow');
        if (m.status === 'failed') this.log(`template send failed: ${m.error}`);
        return next();
      }
      case 'ask_question': {
        const text = renderTemplate(c.text, tctx);
        const m = c.qtype === 'choice' ? await this.p.sendChoices(conv.id, text, c.choices, 'workflow')
          : c.qtype === 'rating' ? await this.p.sendChoices(conv.id, text, ['1', '2', '3', '4', '5'], 'workflow')
            : (await this.p.send(conv.id, text, 'workflow'))[0];
        if (!m || m.status === 'failed') {
          return c.failure_branch ? { kind: 'go', to: step.outputs?.failure ?? null } : { kind: 'end', status: 'exited', reason: `send_failed: ${m?.error ?? 'unknown'}` };
        }
        const ms = Math.min(Math.max(Number(c.timeout_minutes ?? 7 * 24 * 60) * 60_000, 60_000), LIMITS.maxTimeoutMs);
        run.vars.__q = { step: step.id, attempts: (run.vars.__q as { attempts?: number } | undefined)?.attempts ?? 0 };
        return { kind: 'wait', waitKind: 'question', until: this.t() + ms };
      }
      case 'branch': {
        const cc = this.condCtx(run.contact_id, conv.id, run.vars, run.trigger_vars);
        const list: { match?: 'all' | 'any'; conditions: Condition[] }[] = c.branches ?? [];
        const i = list.findIndex((b) => evalAll(b.conditions, cc, b.match ?? 'all'));
        return { kind: 'go', to: (i >= 0 ? step.outputs?.[`b${i}`] : step.outputs?.else) ?? null };
      }
      case 'date_time': {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: workspace.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        const get = (t: string) => parts.find((x) => x.type === t)!.value;
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
        const mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
        const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
        const list: { days: number[]; from: string; to: string }[] = c.branches ?? [];
        const i = list.findIndex((b) => b.days.includes(day) && (toMin(b.from) <= toMin(b.to) ? mins >= toMin(b.from) && mins < toMin(b.to) : mins >= toMin(b.from) || mins < toMin(b.to)));
        return { kind: 'go', to: (i >= 0 ? step.outputs?.[`b${i}`] : step.outputs?.else) ?? null };
      }
      case 'assign_to': return this.execAssign(step, run, conv);
      case 'update_field': {
        const value = renderTemplate(String(c.value), tctx);
        const def = workspace.custom_fields.find((f) => f.name === c.field);
        if (def?.type === 'number') {
          const n = Number(value.replace(/,/g, ''));
          if (!Number.isFinite(n)) return { kind: 'end', status: 'failed', reason: `"${value}" is not a number for field ${c.field}` };
          await this.p.setField(run.contact_id, conv.id, c.field, n, origin);
        } else if (def || (BUILTIN_FIELDS as readonly string[]).includes(c.field)) await this.p.setField(run.contact_id, conv.id, c.field, value, origin);
        else return { kind: 'end', status: 'failed', reason: `unknown field ${c.field}` };
        return next();
      }
      case 'update_tag': { await this.p.updateTags(run.contact_id, conv.id, c.add ?? [], c.remove ?? [], origin); return next(); }
      case 'update_lifecycle': { await this.p.setLifecycle(run.contact_id, conv.id, c.stage, origin); return next(); }
      case 'open_conversation': { await this.p.setStatus(conv.id, 'open', null, null, origin); return next(); }
      case 'close_conversation': { await this.p.setStatus(conv.id, 'closed', c.note ?? null, c.summary ? renderTemplate(c.summary, tctx) : null, origin); return next(); }
      case 'add_comment': { store.addComment(conv.id, `Workflow: ${wf.name}`, renderTemplate(c.text, tctx)); this.d.hub.publish({ type: 'conversation', conversationId: conv.id }); return next(); }
      case 'jump_to': return { kind: 'go', to: c.target };
      case 'wait': return { kind: 'wait', waitKind: 'wait', until: this.t() + Number(c.minutes) * 60_000 };
      case 'trigger_workflow': {
        await this.startManual(c.workflow_id, run.contact_id, conv.id, { ...run.vars }, { source: 'workflow' });
        return { kind: 'end', status: 'completed', reason: 'handed_over' };
      }
      case 'http_request': return this.execHttp(step, run, tctx);
    }
  }

  private async execAssign(step: Step, run: WorkflowRun, conv: Conversation): Promise<Outcome> {
    const { store } = this.d;
    const c = step.config;
    const t = c.target as { kind: string; name?: string; agent_id?: number };
    if (t.kind === 'unassign') { this.p.unassign(conv.id); return { kind: 'go', to: step.next ?? null }; }
    if (t.kind === 'agent') {
      const agent = (t.agent_id ? store.getAgent(t.agent_id) : undefined) ?? store.listAgents().find((a) => a.name === t.name);
      if (!agent || !store.liveAgent(agent.id)) return { kind: 'end', status: 'failed', reason: `AI agent "${t.name}" is not active` };
      this.p.assignToAgent(conv.id, agent.id, 'a workflow');
      return { kind: 'go', to: step.next ?? null };
    }
    const strategy = c.strategy === 'least_open' ? 'least_open' : 'round_robin';
    const maxOpen = c.max_open != null && c.max_open !== '' ? Number(c.max_open) : undefined;
    try {
      this.p.assignToHuman(conv.id, t.kind === 'team' ? { team: t.name } : t.kind === 'user' ? { user: t.name } : {}, { strategy, maxOpen });
      delete run.vars.__assign_deadline;
      return { kind: 'go', to: step.next ?? null };
    } catch (e) {
      if (!/No member is available/.test((e as Error).message)) return { kind: 'end', status: 'failed', reason: (e as Error).message };
      // everyone is at capacity: queue until someone frees up, or the timeout branch/exit
      const deadline = (run.vars.__assign_deadline as number | undefined) ?? this.t() + Math.min(Number(c.timeout_minutes ?? 7 * 24 * 60) * 60_000, LIMITS.maxTimeoutMs);
      run.vars.__assign_deadline = deadline;
      if (this.t() >= deadline) {
        delete run.vars.__assign_deadline;
        return c.timeout_branch ? { kind: 'go', to: step.outputs?.timeout ?? null } : { kind: 'end', status: 'exited', reason: 'assign_timeout' };
      }
      return { kind: 'wait', waitKind: 'assign', until: Math.min(this.t() + ASSIGN_POLL_MS, deadline) };
    }
  }

  private async execHttp(step: Step, run: WorkflowRun, tctx: TemplateContext): Promise<Outcome> {
    const c = step.config;
    const jsonEsc = (s: string) => JSON.stringify(s).slice(1, -1);
    try {
      const url = renderTemplate(c.url, tctx, encodeURIComponent);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((c.headers ?? {}) as Record<string, string>)) {
        const val = renderTemplate(String(v), tctx);
        if (/[\r\n]/.test(val)) throw new Error(`header ${k} contains a line break`);
        headers[k] = val;
      }
      const body = c.body ? renderTemplate(String(c.body), tctx, jsonEsc) : undefined;
      if (body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
      const res = await safeRequest(url, { method: c.method, headers, body, timeoutMs: 10_000, maxBytes: 200_000, truncate: true, fetchImpl: this.d.fetchImpl });
      run.vars.http_status = res.status;
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      let json: unknown;
      try { json = JSON.parse(res.body); } catch { json = undefined; }
      for (const m of (c.save ?? []) as { var: string; path: string }[]) {
        const v = json === undefined ? undefined : lookup(json, m.path);
        if (/^[A-Za-z_][A-Za-z0-9_]{0,29}$/.test(m.var) && v !== undefined) run.vars[m.var] = typeof v === 'object' ? JSON.stringify(v) : v;
      }
      return { kind: 'go', to: step.next ?? null };
    } catch (e) {
      this.log(`http step failed: ${(e as Error).message}`);
      return c.failure_branch ? { kind: 'go', to: step.outputs?.failure ?? null } : { kind: 'end', status: 'failed', reason: `http_failed: ${(e as Error).message}` };
    }
  }

  /** The contact answered the pending question. */
  private async answer(run: WorkflowRun, wf: WorkflowRecord, text: string): Promise<void> {
    const { store } = this.d;
    const step = wf.graph.steps[run.step_id ?? ''];
    if (!step || step.type !== 'ask_question') return this.finish(run, 'failed', 'missing_question');
    const c = step.config;
    const parsed = parseAnswer(c, text);
    const conv = this.ensureConversation(run.contact_id, run.conversation_id);
    if (!parsed.ok) {
      if (c.failure_branch) {
        run.status = 'running'; run.wait_kind = null; run.wait_until = null; delete run.vars.__q; run.step_id = step.outputs?.failure ?? null;
        store.saveRun(run);
        return this.advance(run, wf);
      }
      const q = (run.vars.__q as { attempts: number } | undefined) ?? { attempts: 0 };
      q.attempts++;
      run.vars.__q = q;
      if (q.attempts >= MAX_INVALID_ANSWERS) return this.finish(run, 'exited', 'invalid_answers');
      await this.p.send(conv.id, 'Maaf, jawapan itu tidak sah. Sila cuba lagi.', 'workflow');
      if (c.qtype === 'choice') await this.p.sendChoices(conv.id, renderTemplate(c.text, this.tctx(run)), c.choices, 'workflow');
      store.saveRun(run);
      return;
    }
    const sa = (c.save_as ?? {}) as { field?: string; variable?: string; tag?: boolean };
    const origin = this.origin(wf);
    if (sa.variable) run.vars[sa.variable] = parsed.value;
    if (sa.field) {
      const def = this.d.workspace.custom_fields.find((f) => f.name === sa.field);
      await this.p.setField(run.contact_id, conv.id, sa.field, def?.type === 'number' ? Number(parsed.value) : String(parsed.value), origin);
    }
    if (sa.tag && c.qtype === 'choice') await this.p.updateTags(run.contact_id, conv.id, [String(parsed.value)], [], origin);
    run.vars.last_answer = parsed.value;
    delete run.vars.__q;
    run.status = 'running'; run.wait_kind = null; run.wait_until = null; run.step_id = step.next ?? null;
    store.saveRun(run);
    await this.advance(run, wf);
  }
}
