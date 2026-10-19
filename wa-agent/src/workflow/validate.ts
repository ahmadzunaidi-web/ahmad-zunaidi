import type { Workspace } from '../workspace.js';
import { BUILTIN_FIELDS } from '../workspace.js';
import { LIMITS, STEP_TYPES, TRIGGER_TYPES, type Graph, type Step, type Trigger } from './types.js';

export interface ValidationIssue { stepId: string | null; message: string }

export const OUTPUT_KEYS_BY_TYPE: Record<string, (s: Step) => string[]> = {
  ask_question: (s) => [...(s.config.failure_branch ? ['failure'] : []), ...(s.config.timeout_branch ? ['timeout'] : [])],
  assign_to: (s) => (s.config.timeout_branch ? ['timeout'] : []),
  http_request: (s) => (s.config.failure_branch ? ['failure'] : []),
  branch: (s) => [...(s.config.branches ?? []).map((_: unknown, i: number) => `b${i}`), 'else'],
  date_time: (s) => [...(s.config.branches ?? []).map((_: unknown, i: number) => `b${i}`), 'else'],
};

/** Steps that use `next` as the success/main path. Branch-like steps use only outputs. */
export const HAS_NEXT = (t: string) => !['branch', 'date_time', 'jump_to'].includes(t);

export function referencedIds(s: Step): string[] {
  const ids: (string | null | undefined)[] = [];
  if (HAS_NEXT(s.type)) ids.push(s.next);
  for (const v of Object.values(s.outputs ?? {})) ids.push(v);
  if (s.type === 'jump_to') ids.push(s.config.target);
  return ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function reachable(g: Graph): Set<string> {
  const seen = new Set<string>();
  const stack = g.start ? [g.start] : [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !g.steps[id]) continue;
    seen.add(id);
    stack.push(...referencedIds(g.steps[id]));
  }
  return seen;
}

export function validateTrigger(t: Trigger): string[] {
  const errs: string[] = [];
  if (!t || !TRIGGER_TYPES.includes(t.type)) errs.push(`Unknown trigger "${t?.type}"`);
  if (t?.type === 'contact_tag_updated' && !t.config?.tag) errs.push('Contact Tag Updated needs a tag');
  if (t?.type === 'contact_field_updated' && !t.config?.field) errs.push('Contact Field Updated needs a field');
  return errs;
}

/** Structural validation used before saving a draft (shape) and before publishing (completeness). */
export function validateGraph(g: Graph, ws: Workspace, opts: { publish?: boolean; lookup?: { agentNames: string[]; workflows: { id: number; name: string; status: string; triggerType: string }[]; templateNames: string[] } } = {}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (stepId: string | null, message: string) => out.push({ stepId, message });
  const ids = Object.keys(g.steps ?? {});
  if (ids.length > LIMITS.maxSteps) add(null, `A workflow can have at most ${LIMITS.maxSteps} steps (has ${ids.length})`);
  if (g.start !== null && !g.steps[g.start as string]) add(null, `Start step "${g.start}" does not exist`);
  if (opts.publish && !g.start) add(null, 'Add at least one step before publishing');

  for (const id of ids) {
    const s = g.steps[id];
    if (s.id !== id) add(id, `Step key "${id}" does not match its id "${s.id}"`);
    if (!STEP_TYPES.includes(s.type)) { add(id, `Unknown step type "${s.type}"`); continue; }
    for (const ref of referencedIds(s)) if (!g.steps[ref]) add(id, `Points to missing step "${ref}"`);
    const c = s.config ?? {};
    const need = (cond: boolean, msg: string) => { if (!cond) add(id, msg); };
    switch (s.type) {
      case 'send_message': need(typeof c.text === 'string' && c.text.trim().length > 0, 'Message text is required'); break;
      case 'ask_question': {
        need(typeof c.text === 'string' && c.text.trim().length > 0, 'Question text is required');
        need(['text', 'choice', 'number', 'date', 'phone', 'email', 'url', 'rating', 'location'].includes(c.qtype), 'Unknown question type');
        if (c.qtype === 'choice') {
          const ch: string[] = c.choices ?? [];
          need(ch.length >= 1 && ch.length <= LIMITS.maxChoices, `Multiple choice needs 1-${LIMITS.maxChoices} choices`);
          need(ch.every((x) => typeof x === 'string' && x.length >= 1 && x.length <= LIMITS.maxChoiceLen), `Each choice must be 1-${LIMITS.maxChoiceLen} characters`);
          need(new Set(ch.map((x) => x.toLowerCase())).size === ch.length, 'Choices must be unique');
        }
        if (c.qtype === 'number' && c.min != null && c.max != null) need(Number(c.min) <= Number(c.max), 'Minimum must not exceed maximum');
        const sa = c.save_as ?? {};
        if (sa.field) need(ws.custom_fields.some((f) => f.name === sa.field) || (BUILTIN_FIELDS as readonly string[]).includes(sa.field), `Unknown contact field "${sa.field}"`);
        if (sa.variable) need(/^[A-Za-z_][A-Za-z0-9_]{0,29}$/.test(sa.variable), 'Variable names use letters, numbers and _ (max 30)');
        if (sa.tag) {
          need(c.qtype === 'choice', 'Saving the answer as a tag only works for multiple choice');
          for (const ch of c.choices ?? []) need(ws.tags.includes(ch), `Choice "${ch}" must match an existing tag to be saved as a tag`);
        }
        if (c.timeout_minutes != null) need(Number(c.timeout_minutes) > 0 && Number(c.timeout_minutes) * 60_000 <= LIMITS.maxTimeoutMs, 'Timeout must be between 1 minute and 7 days');
        break;
      }
      case 'branch':
        need((c.branches ?? []).length >= 1, 'Add at least one branch condition');
        for (const b of c.branches ?? []) need((b.conditions ?? []).length >= 1, `Branch "${b.name ?? ''}" needs at least one condition`);
        break;
      case 'assign_to': {
        const t = c.target ?? {};
        need(['agent', 'team', 'user', 'workspace', 'unassign'].includes(t.kind), 'Choose who to assign to');
        if (t.kind === 'team') need(ws.teams.some((x) => x.name === t.name), `Unknown team "${t.name}"`);
        if (t.kind === 'user') need(ws.users.includes(t.name), `Unknown user "${t.name}"`);
        if (t.kind === 'agent' && opts.lookup) need(opts.lookup.agentNames.includes(t.name), `AI agent "${t.name}" is not active`);
        break;
      }
      case 'update_field': {
        need(typeof c.field === 'string' && (ws.custom_fields.some((f) => f.name === c.field) || (BUILTIN_FIELDS as readonly string[]).includes(c.field)), `Unknown contact field "${c.field}"`);
        need(c.value !== undefined && String(c.value).length > 0, 'Value is required');
        break;
      }
      case 'update_tag': {
        const all = [...(c.add ?? []), ...(c.remove ?? [])];
        need(all.length > 0, 'Choose at least one tag');
        for (const t of all) need(ws.tags.includes(t), `Unknown tag "${t}"`);
        break;
      }
      case 'update_lifecycle': need(ws.lifecycle_stages.includes(c.stage), `Unknown lifecycle stage "${c.stage}"`); break;
      case 'close_conversation': if (c.note) need(ws.closing_notes.includes(c.note), `Unknown closing note "${c.note}"`); break;
      case 'add_comment': need(typeof c.text === 'string' && c.text.trim().length > 0 && c.text.length <= 2000, 'Comment text is required (max 2000 characters)'); break;
      case 'jump_to': need(typeof c.target === 'string' && !!g.steps[c.target], 'Jump target does not exist'); break;
      case 'wait': need(Number(c.minutes) >= 1 && Number(c.minutes) <= 60 * 24 * 30, 'Wait between 1 minute and 30 days'); break;
      case 'trigger_workflow':
        need(Number.isInteger(c.workflow_id), 'Choose a workflow');
        if (opts.lookup && Number.isInteger(c.workflow_id)) {
          const w = opts.lookup.workflows.find((x) => x.id === c.workflow_id);
          need(!!w, 'Target workflow does not exist');
          if (w) need(w.triggerType === 'manual', 'The target workflow must use the Manual trigger');
          if (w && opts.publish) need(w.status === 'published', 'The target workflow must be published');
        }
        break;
      case 'date_time':
        need((c.branches ?? []).length >= 1, 'Add at least one time window');
        for (const b of c.branches ?? []) {
          need(/^\d{2}:\d{2}$/.test(b.from ?? '') && /^\d{2}:\d{2}$/.test(b.to ?? ''), `Window "${b.name ?? ''}" needs HH:MM times`);
          need(Array.isArray(b.days) && b.days.every((d: number) => Number.isInteger(d) && d >= 0 && d <= 6), `Window "${b.name ?? ''}" has invalid days (0=Sun..6=Sat)`);
        }
        break;
      case 'http_request':
        need(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method), 'Choose an HTTP method');
        need(typeof c.url === 'string' && /^https?:\/\//i.test(c.url), 'URL must start with http:// or https://');
        if (c.body) { try { JSON.parse(String(c.body).replace(/\{\{[^}]*\}\}/g, 'x')); } catch { add(id, 'Body must be valid JSON'); } }
        break;
      case 'send_template':
        need(typeof c.template === 'string' && c.template.length > 0, 'Choose a template');
        if (opts.lookup && c.template) need(opts.lookup.templateNames.includes(c.template), `Template "${c.template}" is not registered`);
        break;
    }
  }
  // unreachable steps are an authoring error worth flagging (they will never run)
  if (g.start && !out.some((i) => i.message.startsWith('Start step'))) {
    const seen = reachable(g);
    for (const id of ids) if (!seen.has(id)) add(id, 'This step is not connected to the start and will never run');
  }
  return out;
}

/** Problems that make a graph unsafe to store at all (drafts may otherwise be incomplete). */
export function structuralIssues(g: Graph): string[] {
  const errs: string[] = [];
  if (!g || typeof g !== 'object' || typeof g.steps !== 'object' || g.steps === null) return ['graph must have a steps object'];
  const ids = Object.keys(g.steps);
  if (ids.length > LIMITS.maxSteps) errs.push(`A workflow can have at most ${LIMITS.maxSteps} steps`);
  if (g.start !== null && g.start !== undefined && !g.steps[g.start]) errs.push(`Start step "${g.start}" does not exist`);
  for (const id of ids) {
    const s = g.steps[id];
    if (!s || s.id !== id) { errs.push(`Step key "${id}" does not match its id`); continue; }
    if (!STEP_TYPES.includes(s.type)) errs.push(`Step "${id}" has unknown type "${s.type}"`);
    if (typeof s.config !== 'object' || s.config === null) errs.push(`Step "${id}" needs a config object`);
    for (const ref of referencedIds(s)) if (!g.steps[ref]) errs.push(`Step "${id}" points to missing step "${ref}"`);
  }
  return errs;
}
