import type { AgentSnapshot, ConvEvent, KnowledgeHit, SkillKey } from '../types.js';
import { COMMENT_LIMIT } from '../types.js';
import { BUILTIN_FIELDS, teamOf, validList, type Workspace } from '../workspace.js';
import { contactVars } from '../workflow/template.js';
import { buildHttpTools, httpToolName, runHttpAction } from './http-skill.js';
import type { ToolDef } from './llm.js';

export interface ConvState {
  contact: { name: string | null; phone: string; email: string | null; lifecycle: string | null; tags: string[]; fields: Record<string, string | number> };
  status: 'open' | 'closed';
  handler: 'none' | 'ai' | 'human';
  assignee_team: string | null;
  assignee_user: string | null;
}

export type AssignTarget = { kind: 'team' | 'user' | 'agent'; name: string; agentId?: number };

export interface FollowupStep {
  after_minutes: number;
  message: string | null;
  template: string | null;
  params: string[];
  then: { tool: string; input: Record<string, unknown> }[];
}

type MaybeAsync<T> = T | Promise<T>;

/** Side effects of skills. The DB implementation persists; the simulator implementation only records. */
export interface Effects {
  assign(target: AssignTarget, strategy: 'round_robin' | 'least_open'): MaybeAsync<string>;
  close(note: string | null, summary: string | null): MaybeAsync<string>;
  setField(field: string, value: string | number): MaybeAsync<string>;
  setLifecycle(stage: string): MaybeAsync<string>;
  updateTags(add: string[], remove: string[]): MaybeAsync<string>;
  comment(text: string, mention: string | null): MaybeAsync<string>;
  sendAttachment(url: string, kind: 'image' | 'document', caption: string | null): MaybeAsync<string>;
  triggerWorkflow(workflowId: number, vars: Record<string, string>): MaybeAsync<string>;
  scheduleFollowups(steps: FollowupStep[], agentId: number): MaybeAsync<string>;
  cancelFollowups(): MaybeAsync<string>;
}

export interface AgentEnv {
  workspace: Workspace;
  state: ConvState;
  effects: Effects;
  /** Other published AI agents that can be handed the conversation. */
  agents: { id: number; name: string }[];
  selfName: string;
  selfId: number;
  searchKnowledge(query: string, sourceIds: number[]): KnowledgeHit[];
  knowledgeMentions(sourceIds: number[], needle: string): boolean;
  workflows: { id: number; name: string; status: string; triggerType: string }[];
  templates: { name: string; language: string; params: number }[];
  fetch?: typeof fetch;
  /** URLs seen in HTTP responses during this run (allowed as attachments). */
  runUrls: Set<string>;
  attachmentsSent: number;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  hits?: KnowledgeHit[];
}

export const MAX_ATTACHMENTS_PER_RUN = 5;
export const MAX_FOLLOWUPS = 5;
export const MAX_FOLLOWUP_MINUTES = 24 * 60;

export const TOOL_NAMES = {
  assign: 'assign_conversation',
  close: 'close_conversation',
  set_field: 'update_contact_field',
  set_lifecycle: 'update_lifecycle_stage',
  tags: 'update_tags',
  comment: 'add_internal_comment',
  trigger_workflow: 'trigger_workflow',
  followup: 'schedule_follow_ups',
  attachment: 'send_attachment',
  search: 'search_knowledge_base',
  cancel_followup: 'cancel_follow_ups',
} as const;

/** Skills a follow-up may run after it sends its message. */
const FOLLOWUP_THEN: string[] = [TOOL_NAMES.assign, TOOL_NAMES.close, TOOL_NAMES.set_field, TOOL_NAMES.set_lifecycle, TOOL_NAMES.tags, TOOL_NAMES.comment];

const withPrompt = (base: string, prompt: string) =>
  prompt.trim() ? `${base}\n\nWhen and how to use this skill (set by the workspace owner):\n${prompt.trim()}` : base;

const ATTACH_EXT: Record<string, 'image' | 'document'> = { jpg: 'image', jpeg: 'image', png: 'image', pdf: 'document', docx: 'document', pptx: 'document' };

export function buildTools(snap: AgentSnapshot, env: AgentEnv): ToolDef[] {
  const ws = env.workspace;
  const tools: ToolDef[] = [];
  const sk = snap.skills;
  const others = env.agents.filter((a) => a.name !== env.selfName).map((a) => a.name);
  if (sk.assign?.enabled) {
    tools.push({
      name: TOOL_NAMES.assign,
      description: withPrompt(
        `Hand the conversation to a human team, a specific user, or another AI agent. Use the exact name (no "@").\nTeams: ${validList(ws.teams.map((t) => t.name))}\nUsers: ${validList(ws.users)}\nOther AI agents: ${validList(others)}\nRound robin works within one team only; to balance by workload use strategy "least_open". Skills run before your reply.`,
        sk.assign.prompt),
      input_schema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Exact team, user or AI agent name' },
          strategy: { type: 'string', enum: ['round_robin', 'least_open'], description: 'How to pick a member when target is a team (default round_robin)' },
        },
        required: ['target'], additionalProperties: false,
      },
    });
  }
  if (sk.close?.enabled) {
    tools.push({
      name: TOOL_NAMES.close,
      description: withPrompt(
        `Close the conversation once the contact's request is resolved. Closing notes (exact names): ${validList(ws.closing_notes)}. Include a short summary of the issue and solution (max ${COMMENT_LIMIT} characters). You cannot reopen a conversation after closing it. Skills run before your reply, so you can still send a final goodbye message.`,
        sk.close.prompt),
      input_schema: {
        type: 'object',
        properties: { closing_note: { type: 'string', description: 'Exact closing note name (optional)' }, summary: { type: 'string', description: 'Short summary (optional)' } },
        additionalProperties: false,
      },
    });
  }
  if (sk.set_field?.enabled) {
    tools.push({
      name: TOOL_NAMES.set_field,
      description: withPrompt(
        `Save or update a contact field. Field names (exact): ${validList([...BUILTIN_FIELDS, ...ws.custom_fields.map((f) => `${f.name} (${f.type})`)])}. Use the field name without the type. Number fields need numeric values.`,
        sk.set_field.prompt),
      input_schema: {
        type: 'object',
        properties: { field: { type: 'string', description: 'Exact field name' }, value: { type: 'string', description: 'New value (numbers as digits)' } },
        required: ['field', 'value'], additionalProperties: false,
      },
    });
  }
  if (sk.set_lifecycle?.enabled) {
    tools.push({
      name: TOOL_NAMES.set_lifecycle,
      description: withPrompt(`Move the contact to a lifecycle stage. Stages (exact): ${validList(ws.lifecycle_stages)}.`, sk.set_lifecycle.prompt),
      input_schema: { type: 'object', properties: { stage: { type: 'string', description: 'Exact lifecycle stage name' } }, required: ['stage'], additionalProperties: false },
    });
  }
  if (sk.tags?.enabled) {
    tools.push({
      name: TOOL_NAMES.tags,
      description: withPrompt(`Add or remove contact tags. Tags (exact): ${validList(ws.tags)}. You cannot read existing tags except from the contact context.`, sk.tags.prompt),
      input_schema: {
        type: 'object',
        properties: { add: { type: 'array', items: { type: 'string' } }, remove: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    });
  }
  if (sk.comment?.enabled) {
    tools.push({
      name: TOOL_NAMES.comment,
      description: withPrompt(
        `Add an internal comment (never shown to the contact), e.g. a handoff note: issue, what was tried, why escalating. Max ${COMMENT_LIMIT} characters. You may mention a user (exact name from: ${validList(ws.users)}) but not teams or AI agents.`,
        sk.comment.prompt),
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string' }, mention: { type: 'string', description: 'Exact user name to notify (optional)' } },
        required: ['text'], additionalProperties: false,
      },
    });
  }
  if (sk.trigger_workflow?.enabled) {
    const eligible = env.workflows.filter((w) => w.status === 'published' && w.triggerType === 'manual').map((w) => w.name);
    tools.push({
      name: TOOL_NAMES.trigger_workflow,
      description: withPrompt(
        `Start an existing workflow for this contact (it must be published and use the Manual trigger). Workflows (exact names): ${validList(eligible)}. The workflow runs independently: you cannot see its steps or result. Do not also do by yourself what the workflow does, or the contact gets duplicates.`,
        sk.trigger_workflow.prompt),
      input_schema: {
        type: 'object',
        properties: {
          workflow: { type: 'string', description: 'Exact workflow name' },
          variables: { type: 'object', description: 'Optional values the workflow can read as {{$trigger.<key>}}', additionalProperties: { type: 'string' } },
        },
        required: ['workflow'], additionalProperties: false,
      },
    });
  }
  if (sk.followup?.enabled) {
    tools.push({
      name: TOOL_NAMES.followup,
      description: withPrompt(
        `Schedule automatic follow-up messages for when the contact stops replying (max ${MAX_FOLLOWUPS} steps; each step waits after_minutes (1-${MAX_FOLLOWUP_MINUTES}) after the previous message). Optionally run skills after a step via "then" (allowed: ${FOLLOWUP_THEN.join(', ')}). They stop automatically when the contact replies or the conversation is reassigned or closed. Messages after 24h of silence need a registered template: ${validList(env.templates.map((t) => t.name))}. Calling this replaces earlier follow-ups. You cannot branch between sequences.`,
        sk.followup.prompt),
      input_schema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array', minItems: 1, maxItems: MAX_FOLLOWUPS,
            items: {
              type: 'object',
              properties: {
                after_minutes: { type: 'number' },
                message: { type: 'string' },
                template: { type: 'string', description: 'Registered template name to use if the 24h window has closed' },
                template_params: { type: 'array', items: { type: 'string' } },
                then: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, input: { type: 'object' } }, required: ['tool'] } },
              },
              required: ['after_minutes'],
            },
          },
        },
        required: ['steps'], additionalProperties: false,
      },
    });
    tools.push({
      name: TOOL_NAMES.cancel_followup,
      description: 'Cancel pending follow-ups, e.g. when the contact says goodbye, is no longer interested, or the goal is achieved.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    });
  }
  if (sk.attachment?.enabled) {
    tools.push({
      name: TOOL_NAMES.attachment,
      description: withPrompt(
        `Send an image (jpg/jpeg/png) or document (pdf/docx/pptx) to the contact as an attachment. The url MUST appear in your instructions, in the knowledge base results, or in an API response from this conversation - never invent or guess a URL. At most ${MAX_ATTACHMENTS_PER_RUN} attachments per reply.`,
        sk.attachment.prompt),
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'https URL ending in .jpg .jpeg .png .pdf .docx or .pptx' }, caption: { type: 'string' } },
        required: ['url'], additionalProperties: false,
      },
    });
  }
  if (sk.http?.enabled && snap.http_actions.length) tools.push(...buildHttpTools(snap.http_actions));
  if (snap.knowledge_ids.length) {
    tools.push({
      name: TOOL_NAMES.search,
      description: 'Search the business knowledge base. You can only search by keywords that appear inside documents (not by document title). Use specific keywords from the contact\'s question. Answer only from what is returned; if nothing relevant is found, say so and follow your handover rules.',
      input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Keywords to search for' } }, required: ['query'], additionalProperties: false },
    });
  }
  return tools;
}

const fail = (message: string): ToolResult => ({ ok: false, message });
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);

export function enabledToolNames(snap: AgentSnapshot): string[] {
  const names: string[] = [];
  for (const k of Object.keys(snap.skills) as SkillKey[]) {
    if (!snap.skills[k]?.enabled) continue;
    if (k === 'http') names.push(...snap.http_actions.map(httpToolName));
    else if (k === 'followup') names.push(TOOL_NAMES.followup, TOOL_NAMES.cancel_followup);
    else names.push((TOOL_NAMES as Record<string, string>)[k]);
  }
  if (snap.knowledge_ids.length) names.push(TOOL_NAMES.search);
  return names;
}

/** Validate (exact workspace names) then run a skill. Errors list the valid names so the model can self-correct. */
export async function executeTool(name: string, input: Record<string, unknown>, env: AgentEnv, snap: AgentSnapshot): Promise<ToolResult> {
  const ws = env.workspace;
  const on = (k: SkillKey) => !!snap.skills[k]?.enabled && (TOOL_NAMES as Record<string, string>)[k] === name;
  try {
    if (on('assign')) {
      const target = str(input.target)?.replace(/^@/, '');
      if (!target) return fail('target is required');
      const strategy = input.strategy === 'least_open' ? 'least_open' : 'round_robin';
      if (teamOf(ws, target)) {
        if (!teamOf(ws, target)!.members.length) return fail(`Team "${target}" has no members`);
        return { ok: true, message: await env.effects.assign({ kind: 'team', name: target }, strategy) };
      }
      if (ws.users.includes(target)) return { ok: true, message: await env.effects.assign({ kind: 'user', name: target }, strategy) };
      const agent = env.agents.find((a) => a.name === target);
      if (agent) {
        if (agent.name === env.selfName) return fail('You cannot assign the conversation to yourself');
        return { ok: true, message: await env.effects.assign({ kind: 'agent', name: agent.name, agentId: agent.id }, strategy) };
      }
      return fail(`Unknown target "${target}". Valid teams: ${validList(ws.teams.map((t) => t.name))}; users: ${validList(ws.users)}; AI agents: ${validList(env.agents.filter((a) => a.name !== env.selfName).map((a) => a.name))}`);
    }
    if (on('close')) {
      const note = str(input.closing_note);
      if (note && !ws.closing_notes.includes(note)) return fail(`Unknown closing note "${note}". Valid: ${validList(ws.closing_notes)}`);
      const summary = str(input.summary);
      if (summary && summary.length > COMMENT_LIMIT) return fail(`summary too long (max ${COMMENT_LIMIT} characters)`);
      return { ok: true, message: await env.effects.close(note, summary) };
    }
    if (on('set_field')) {
      const field = str(input.field);
      const raw = input.value;
      if (!field) return fail('field is required');
      if (raw === undefined || raw === null || String(raw).trim() === '') return fail('value is required');
      const def = ws.custom_fields.find((f) => f.name === field);
      const builtin = (BUILTIN_FIELDS as readonly string[]).includes(field);
      if (!def && !builtin) return fail(`Unknown field "${field}". Valid: ${validList([...BUILTIN_FIELDS, ...ws.custom_fields.map((f) => f.name)])}`);
      let value: string | number = String(raw).trim().slice(0, 500);
      if (def?.type === 'number') {
        const n = Number(value.replace(/,/g, ''));
        if (!Number.isFinite(n)) return fail(`Field "${field}" needs a numeric value, got "${value}"`);
        value = n;
      }
      return { ok: true, message: await env.effects.setField(field, value) };
    }
    if (on('set_lifecycle')) {
      const stage = str(input.stage);
      if (!stage || !ws.lifecycle_stages.includes(stage)) return fail(`Unknown lifecycle stage "${stage ?? ''}". Valid: ${validList(ws.lifecycle_stages)}`);
      return { ok: true, message: await env.effects.setLifecycle(stage) };
    }
    if (on('tags')) {
      const add = strList(input.add);
      const remove = strList(input.remove);
      if (!add.length && !remove.length) return fail('Provide at least one tag in add or remove');
      const bad = [...add, ...remove].filter((t) => !ws.tags.includes(t));
      if (bad.length) return fail(`Unknown tag(s) ${validList(bad)}. Valid: ${validList(ws.tags)}`);
      return { ok: true, message: await env.effects.updateTags(add, remove) };
    }
    if (on('comment')) {
      const text = str(input.text);
      if (!text) return fail('text is required');
      if (text.length > COMMENT_LIMIT) return fail(`comment too long (max ${COMMENT_LIMIT} characters)`);
      const mention = str(input.mention)?.replace(/^@/, '') ?? null;
      if (mention && !ws.users.includes(mention)) return fail(`Cannot mention "${mention}": only users can be mentioned. Valid: ${validList(ws.users)}`);
      return { ok: true, message: await env.effects.comment(text, mention) };
    }
    if (on('trigger_workflow')) {
      const wname = str(input.workflow)?.replace(/^!/, '');
      const eligible = env.workflows.filter((w) => w.status === 'published' && w.triggerType === 'manual');
      const w = eligible.find((x) => x.name === wname);
      if (!w) return fail(`Unknown workflow "${wname ?? ''}". It must be published with the Manual trigger. Valid: ${validList(eligible.map((x) => x.name))}`);
      const vars: Record<string, string> = {};
      if (input.variables && typeof input.variables === 'object') {
        for (const [k, v] of Object.entries(input.variables as Record<string, unknown>).slice(0, 20)) if (/^[A-Za-z0-9_]{1,30}$/.test(k)) vars[k] = String(v).slice(0, 500);
      }
      return { ok: true, message: await env.effects.triggerWorkflow(w.id, vars) };
    }
    if (on('followup')) {
      const steps = Array.isArray(input.steps) ? (input.steps as Record<string, unknown>[]) : [];
      if (!steps.length || steps.length > MAX_FOLLOWUPS) return fail(`Provide 1-${MAX_FOLLOWUPS} follow-up steps`);
      const allowedThen = FOLLOWUP_THEN.filter((t) => enabledToolNames(snap).includes(t));
      const out: FollowupStep[] = [];
      for (const [i, s] of steps.entries()) {
        const mins = Number(s.after_minutes);
        if (!Number.isFinite(mins) || mins < 1 || mins > MAX_FOLLOWUP_MINUTES) return fail(`Step ${i + 1}: after_minutes must be between 1 and ${MAX_FOLLOWUP_MINUTES} (follow-ups must be within 24h of the previous message)`);
        const message = str(s.message);
        if (message && message.length > 1000) return fail(`Step ${i + 1}: message is too long (max 1000 characters)`);
        const template = str(s.template);
        if (template && !env.templates.some((t) => t.name === template)) return fail(`Step ${i + 1}: unknown template "${template}". Valid: ${validList(env.templates.map((t) => t.name))}`);
        const then = (Array.isArray(s.then) ? s.then : []).slice(0, 3) as { tool?: string; input?: Record<string, unknown> }[];
        for (const t of then) if (!t.tool || !allowedThen.includes(t.tool)) return fail(`Step ${i + 1}: "then" tool "${t.tool}" is not allowed. Enabled options: ${validList(allowedThen)}`);
        if (!message && !then.length) return fail(`Step ${i + 1}: needs a message or a "then" action`);
        out.push({ after_minutes: mins, message, template, params: strList(s.template_params), then: then.map((t) => ({ tool: t.tool!, input: t.input ?? {} })) });
      }
      return { ok: true, message: await env.effects.scheduleFollowups(out, env.selfId) };
    }
    if (name === TOOL_NAMES.cancel_followup && snap.skills.followup?.enabled) return { ok: true, message: await env.effects.cancelFollowups() };
    if (on('attachment')) {
      const url = str(input.url);
      if (!url) return fail('url is required');
      let u: URL;
      try { u = new URL(url); } catch { return fail('url is not valid'); }
      if (u.protocol !== 'https:') return fail('Only https URLs can be sent as attachments');
      const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
      const kind = ATTACH_EXT[ext];
      if (!kind) return fail('Unsupported file type. Allowed: .jpg .jpeg .png .pdf .docx .pptx (videos, voice notes and stickers are not supported)');
      if (env.attachmentsSent >= MAX_ATTACHMENTS_PER_RUN) return fail(`At most ${MAX_ATTACHMENTS_PER_RUN} attachments per reply`);
      const known = snap.instructions.includes(url) || env.runUrls.has(url) || env.knowledgeMentions(snap.knowledge_ids, url);
      if (!known) return fail('That URL was not found in your instructions, the knowledge base or an API response. Do not guess URLs: say you do not have that file, or hand over to a person.');
      const caption = str(input.caption)?.slice(0, 1000) ?? null;
      env.attachmentsSent++;
      return { ok: true, message: await env.effects.sendAttachment(url, kind, caption) };
    }
    if (snap.skills.http?.enabled) {
      const action = snap.http_actions.find((a) => httpToolName(a) === name);
      if (action) {
        return runHttpAction(action, input, {
          contact: { ...contactVars({ name: env.state.contact.name, wa_id: env.state.contact.phone, email: env.state.contact.email, lifecycle: env.state.contact.lifecycle, fields: env.state.contact.fields }) },
          fetchImpl: env.fetch,
          onUrls: (urls) => urls.forEach((x) => env.runUrls.add(x)),
        });
      }
    }
    if (name === TOOL_NAMES.search && snap.knowledge_ids.length) {
      const q = str(input.query);
      if (!q) return fail('query is required');
      const hits = env.searchKnowledge(q, snap.knowledge_ids);
      if (!hits.length) return { ok: true, message: 'No matching content found in the knowledge base for these keywords. Try different keywords once; otherwise say you do not know and follow the handover rules.', hits };
      return { ok: true, message: hits.map((h, i) => `[${i + 1}] (source: ${h.source})\n${h.text}`).join('\n\n'), hits };
    }
  } catch (e) {
    return fail(`Skill failed: ${(e as Error).message}`);
  }
  return fail(`Unknown or disabled tool "${name}"`);
}

export function describeEvents(events: ConvEvent[]): string[] {
  return events.map((e) => {
    if (e.type === 'assigned') return `Assignment Event: you were just assigned to this conversation by ${String(e.payload.by ?? 'the platform')}.`;
    return 'Conversation Reopened Event: a closed conversation was reopened by an incoming message from the contact.';
  });
}
