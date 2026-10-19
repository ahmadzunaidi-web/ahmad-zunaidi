import { INSTRUCTIONS_LIMIT, type AgentDraft } from '../types.js';
import { BUILTIN_FIELDS, type Workspace } from '../workspace.js';

export type Severity = 'error' | 'warning' | 'info';

export interface ReviewIssue {
  severity: Severity;
  /** "instructions", "skill:assign", "http:<name>", "config" */
  location: string;
  code: string;
  message: string;
  /** Mechanical fix the UI can apply to the text of `location`. */
  fix?: { find: string; replace: string };
}

export interface ReviewInput {
  draft: AgentDraft;
  workspace: Workspace;
  /** Active AI agents (names). */
  agents: string[];
  workflows: { name: string; status: string; triggerType: string }[];
  templates: string[];
}

const FIELD_KEYS = (ws: Workspace) => [...['firstname', 'lastname', 'name', 'phone', 'email', 'lifecycle'], ...ws.custom_fields.map((f) => f.name.toLowerCase().replace(/\s+/g, ''))];

/** Longest valid name that `text` starts with (case-sensitive), or a case-insensitive near miss. */
function matchName(text: string, names: string[]): { exact?: string; near?: string } {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const exact = sorted.find((n) => text.startsWith(n) && !/^[A-Za-z0-9]/.test(text.slice(n.length)));
  if (exact) return { exact };
  const low = text.toLowerCase();
  const near = sorted.find((n) => low.startsWith(n.toLowerCase()) && !/^[A-Za-z0-9]/.test(text.slice(n.length)));
  return near ? { near } : {};
}

/** Every `sigil` occurrence (non-overlapping scan): the text after it, up to 60 chars on the same line. */
function refs(text: string, sigil: string, okPrev: (prev: string) => boolean, okNext: (next: string) => boolean): string[] {
  const out: string[] = [];
  for (let i = text.indexOf(sigil); i >= 0; i = text.indexOf(sigil, i + 1)) {
    const prev = i === 0 ? ' ' : text[i - 1];
    const next = text[i + 1] ?? '';
    if (okPrev(prev) && okNext(next)) out.push(text.slice(i + 1, i + 61).split('\n')[0]);
  }
  return out;
}

function dur(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^(sec|saat)/.test(u)) return n / 60;
  if (/^(min)/.test(u)) return n;
  if (/^(hour|jam)/.test(u)) return n * 60;
  return n * 1440; // day / hari
}

export function reviewAgent(inp: ReviewInput): ReviewIssue[] {
  const { draft, workspace: ws } = inp;
  const out: ReviewIssue[] = [];
  const add = (severity: Severity, location: string, code: string, message: string, fix?: ReviewIssue['fix']) => out.push({ severity, location, code, message, fix });

  const texts: { loc: string; text: string }[] = [{ loc: 'instructions', text: draft.instructions }];
  for (const [k, s] of Object.entries(draft.skills)) if (s.enabled && s.prompt.trim()) texts.push({ loc: `skill:${k}`, text: s.prompt });
  for (const a of draft.http_actions) if (a.description) texts.push({ loc: `http:${a.name}`, text: a.description });
  const all = texts.map((t) => t.text).join('\n');
  const lower = all.toLowerCase();
  const ins = draft.instructions.toLowerCase();

  if (draft.instructions.length > INSTRUCTIONS_LIMIT) add('error', 'instructions', 'too_long', `Instructions are ${draft.instructions.length} characters; the limit is ${INSTRUCTIONS_LIMIT}.`);
  if (!draft.instructions.trim()) add('error', 'instructions', 'empty', 'Instructions are empty. Describe who the agent is talking to, its role, the flow and its boundaries.');

  // ---- references to workspace items -------------------------------------------------------
  const people = [...ws.teams.map((t) => t.name), ...ws.users, ...inp.agents];
  const wfNames = inp.workflows.map((w) => w.name);
  for (const { loc, text } of texts) {
    for (const rest of refs(text, '@', (prev) => !/[A-Za-z0-9]/.test(prev), () => true)) {
      const r = matchName(rest, people);
      if (r.exact) continue;
      if (r.near) add('error', loc, 'unknown_mention', `"@${rest.slice(0, r.near.length)}" must match "${r.near}" exactly (names are case-sensitive; a wrong name makes the skill fail).`, { find: `@${rest.slice(0, r.near.length)}`, replace: `@${r.near}` });
      else add('error', loc, 'unknown_mention', `"@${rest.split(/[.,;:!?\n]/)[0].trim().slice(0, 30)}" is not a team, user or active AI agent. Valid: ${people.join(', ') || '(none)'}.`);
    }
    for (const rest of refs(text, '!', (prev) => /\s/.test(prev), (next) => /[A-Za-z0-9]/.test(next))) {
      const r = matchName(rest, wfNames);
      if (r.exact) {
        const w = inp.workflows.find((x) => x.name === r.exact)!;
        if (w.status !== 'published') add('warning', loc, 'workflow_unpublished', `Workflow "${w.name}" is not published, so triggering it does nothing.`);
        if (w.triggerType !== 'manual') add('warning', loc, 'workflow_not_manual', `Workflow "${w.name}" does not use the Manual trigger, so the AI cannot start it.`);
      } else if (r.near) add('error', loc, 'unknown_workflow', `"!${rest.slice(0, r.near.length)}" must match workflow "${r.near}" exactly.`, { find: `!${rest.slice(0, r.near.length)}`, replace: `!${r.near}` });
      else if (/^[A-Za-z0-9]+[_-][A-Za-z0-9_-]*/.test(rest)) { // looks like an identifier (not prose such as "!Great")
        add('error', loc, 'unknown_workflow', `"!${rest.split(/[\s.,;:!?]/)[0]}" is not an existing workflow. Valid: ${wfNames.join(', ') || '(none)'}.`);
      }
    }
    for (const rest of refs(text, '%', (prev) => /\s/.test(prev), (next) => /[A-Za-z]/.test(next))) {
      const r = matchName(rest, ws.tags);
      if (r.exact) continue;
      if (r.near) add('error', loc, 'unknown_tag', `"%${rest.slice(0, r.near.length)}" must match tag "${r.near}" exactly.`, { find: `%${rest.slice(0, r.near.length)}`, replace: `%${r.near}` });
      else add('error', loc, 'unknown_tag', `"%${rest.split(/[\s.,;:!?]/)[0]}" is not an existing tag. Valid: ${ws.tags.join(', ') || '(none)'}.`);
    }
    for (const m of text.matchAll(/\$contact\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const keys = FIELD_KEYS(ws);
      if (keys.includes(m[1].toLowerCase())) continue;
      const near = keys.find((k) => k.startsWith(m[1].toLowerCase().slice(0, 4)));
      add('error', loc, 'unknown_variable', `$contact.${m[1]} is not a contact field. Valid: ${keys.map((k) => `$contact.${k}`).join(', ')}.`, near ? { find: `$contact.${m[1]}`, replace: `$contact.${near}` } : undefined);
    }
  }

  // ---- skills vs what the instructions ask for ---------------------------------------------
  const rules: { key: keyof AgentDraft['skills']; label: string; re: RegExp }[] = [
    { key: 'assign', label: 'Assign to team/user/agent', re: /\b(assign|hand ?over|hand off|escalat\w*|transfer)\b|serahkan|salurkan|assign ke/ },
    { key: 'close', label: 'Close conversation', re: /close (the )?(conversation|chat)|tutup (perbualan|chat)/ },
    { key: 'set_lifecycle', label: 'Update lifecycle stage', re: /lifecycle/ },
    { key: 'tags', label: 'Update tags', re: /\b(add|remove|apply|tambah|buang)\b.{0,20}\btags?\b|%[a-z]/ },
    { key: 'comment', label: 'Add internal comment', re: /internal (comment|note)|nota dalaman|komen dalaman/ },
    { key: 'set_field', label: 'Update contact field', re: /(save|store|update|simpan|kemas kini)\b.{0,40}\bfield\b|\bfield\b.{0,20}\b(save|simpan)/ },
    { key: 'attachment', label: 'Send attachment', re: /send (the |a )?(image|photo|pdf|brochure|file|attachment)|hantar (gambar|pdf|fail|brosur)/ },
    { key: 'followup', label: 'Follow-up', re: /follow[- ]?up|tiada balasan|doesn'?t reply|does not reply/ },
    { key: 'trigger_workflow', label: 'Trigger workflow', re: /trigger .{0,20}workflow|(^|\s)!\w/ },
  ];
  for (const r of rules) {
    const sk = draft.skills[r.key];
    const mentioned = r.re.test(ins);
    if (mentioned && !sk?.enabled) add('error', 'instructions', 'skill_disabled', `The instructions ask the AI to "${r.label.toLowerCase()}" but that skill is turned off, so it cannot do it.`);
    if (!mentioned && sk?.enabled && !sk.prompt.trim()) add('warning', `skill:${r.key}`, 'skill_no_instructions', `"${r.label}" is on but has no instructions, and the main instructions never mention it. The AI will not know when to use it.`);
  }
  if (draft.skills.http?.enabled && !draft.http_actions.length) add('error', 'skill:http', 'http_no_actions', 'The HTTP skill is on but no action is configured.');
  if (!draft.skills.http?.enabled && draft.http_actions.length) add('info', 'skill:http', 'http_off', 'HTTP actions are configured but the skill is off, so they are ignored.');
  if (draft.skills.assign?.enabled) {
    const hasDest = people.some((n) => all.includes(n));
    if (!hasDest) add('error', 'skill:assign', 'assign_no_destination', 'The Assign skill has no destination: name a team, user or AI agent (e.g. "assign to @Sales Team").');
  }
  if (draft.skills.comment?.enabled) {
    for (const t of [...ws.teams.map((x) => x.name), ...inp.agents]) {
      const c = draft.skills.comment.prompt;
      if (c.includes(`@${t}`)) add('error', 'skill:comment', 'comment_mention_target', `Comments can only @mention users, not teams or AI agents ("@${t}").`);
    }
  }

  // ---- things the platform cannot do -------------------------------------------------------
  const unsupported: [RegExp, Severity, string, string][] = [
    [/(read|check|see|look at|review)\b.{0,25}(internal )?(comment|note)s?\b/, 'warning', 'reads_comments', 'The AI cannot see internal comments. Put important context in contact fields or the lifecycle stage.'],
    [/(check|open|refer to|see|look in|rujuk)\b.{0,25}\b(the )?"?[a-z0-9 ]{3,30}"? (guide|document|pdf|file|manual|handbook|dokumen)\b/, 'warning', 'search_by_title', 'The AI cannot search knowledge by document title, only by keywords inside the content. Tell it which keywords to search for.'],
    [/(send|hantar)\b.{0,20}\b(video|voice note|voicenote|sticker|audio)\b/, 'error', 'unsupported_media', 'Videos, voice notes and stickers cannot be sent. Only images (jpg/png) and documents (pdf/docx/pptx).'],
    [/assign\b.{0,30}\bat \d/, 'warning', 'scheduled_assign', 'Assignments cannot be scheduled for a later time; they happen immediately.'],
    [/(entire|whole|full) (conversation )?history|all (previous|earlier) messages/, 'warning', 'long_history', 'The AI only sees the last 20 messages. Store important facts in contact fields.'],
    [/(unassign).{0,40}(then|and).{0,30}(reply|respond)/, 'warning', 'unassign_then_reply', 'Unassigning and then replying leaves the conversation in an undefined state; the reply may fail.'],
  ];
  for (const [re, sev, code, msg] of unsupported) if (re.test(lower)) add(sev, 'instructions', code, msg);
  for (const m of lower.matchAll(/(last|previous|past|terakhir)\s+(\d{2,4})\s+messages/g)) if (Number(m[2]) > 20) add('warning', 'instructions', 'long_history', `The AI only sees the last 20 messages, not ${m[2]}.`);

  // ---- follow-up limits ----------------------------------------------------------------------
  if (draft.skills.followup?.enabled || rules[7].re.test(ins)) {
    for (const m of ins.matchAll(/(?:after|selepas)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|saat|minutes?|mins?|minit|hours?|jam|days?|hari)/g)) {
      if (dur(Number(m[1]), m[2]) > 1440) add('error', 'instructions', 'followup_too_long', `A follow-up must be within 24 hours of the previous message, not ${m[1]} ${m[2]}.`);
    }
    if ((ins.match(/follow[- ]?up/g) ?? []).length > 6) add('warning', 'instructions', 'followup_count', 'At most 5 follow-up steps are supported.');
    if (/(sequence|option) [ab]\b.*(sequence|option) [ab]\b/s.test(ins)) add('warning', 'instructions', 'followup_branching', 'The AI cannot choose between multiple follow-up sequences.');
  }

  // ---- clarity -------------------------------------------------------------------------------
  if (draft.instructions.trim()) {
    if (!/\b(close|assign|hand ?over|escalat|end the (conversation|chat)|tutup|serah|salurkan)/.test(ins) && !rules[7].re.test(ins)) add('warning', 'instructions', 'no_exit', 'There is no clear exit condition (when to hand over, close or stop). Conversations may never end.');
    if (!/(#\s*context|\bgoal\b|\bobjective\b|matlamat|tujuan|anda bercakap|you are speaking|you're speaking)/.test(ins)) add('info', 'instructions', 'no_goal', 'State the goal of the conversation (e.g. a "# CONTEXT" section).');
    if (!/(boundar|jangan|do not|don't|never|tidak boleh)/.test(ins)) add('info', 'instructions', 'no_boundaries', 'Add a "# BOUNDARIES" section: what the AI must not do or promise.');
    if (!/^#/m.test(draft.instructions) && draft.instructions.length > 400) add('info', 'instructions', 'no_structure', 'Use headers (# CONTEXT, # ROLE & COMMUNICATION STYLE, # TOP-LEVEL FLOW, # BOUNDARIES) and point form so the flow is easy to follow.');
    if (!draft.knowledge_ids.length && /(knowledge|faq|dokumen|brochure|senarai harga|price list)/.test(ins)) add('info', 'config', 'no_knowledge', 'The instructions mention knowledge/FAQs but no knowledge source is selected for this agent.');
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  void BUILTIN_FIELDS;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function summarize(issues: ReviewIssue[]) {
  return { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length };
}
