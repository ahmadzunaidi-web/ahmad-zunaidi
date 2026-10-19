import type { AgentSnapshot, ConvEvent, KnowledgeHit, SkillKey } from '../types.js';
import { COMMENT_LIMIT } from '../types.js';
import { BUILTIN_FIELDS, teamOf, validList, type Workspace } from '../workspace.js';
import type { ToolDef } from './llm.js';

export interface ConvState {
  contact: { name: string | null; phone: string; email: string | null; lifecycle: string | null; tags: string[]; fields: Record<string, string | number> };
  status: 'open' | 'closed';
  handler: 'none' | 'ai' | 'human';
  assignee_team: string | null;
  assignee_user: string | null;
}

export type AssignTarget = { kind: 'team' | 'user' | 'agent'; name: string; agentId?: number };

/** Side effects of skills. The DB implementation persists; the simulator implementation only records. */
export interface Effects {
  assign(target: AssignTarget, strategy: 'round_robin' | 'least_open'): string;
  close(note: string | null, summary: string | null): string;
  setField(field: string, value: string | number): string;
  setLifecycle(stage: string): string;
  updateTags(add: string[], remove: string[]): string;
  comment(text: string, mention: string | null): string;
}

export interface AgentEnv {
  workspace: Workspace;
  state: ConvState;
  effects: Effects;
  /** Other published AI agents that can be handed the conversation. */
  agents: { id: number; name: string }[];
  selfName: string;
  searchKnowledge(query: string, sourceIds: number[]): KnowledgeHit[];
}

export interface ToolResult {
  ok: boolean;
  message: string;
  hits?: KnowledgeHit[];
}

export const TOOL_NAMES: Record<SkillKey | 'search', string> = {
  assign: 'assign_conversation',
  close: 'close_conversation',
  set_field: 'update_contact_field',
  set_lifecycle: 'update_lifecycle_stage',
  tags: 'update_tags',
  comment: 'add_internal_comment',
  search: 'search_knowledge_base',
};

const withPrompt = (base: string, prompt: string) =>
  prompt.trim() ? `${base}\n\nWhen and how to use this skill (set by the workspace owner):\n${prompt.trim()}` : base;

export function buildTools(snap: AgentSnapshot, ws: Workspace, agents: { id: number; name: string }[], selfName: string): ToolDef[] {
  const tools: ToolDef[] = [];
  const sk = snap.skills;
  const others = agents.filter((a) => a.name !== selfName).map((a) => a.name);
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
        `Save or update a contact field. Field names (exact): ${validList([...BUILTIN_FIELDS, ...ws.custom_fields.map((f) => `${f.name} (${f.type})`).map((s) => s)])}. Use the field name without the type. Number fields need numeric values.`,
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

/** Validate (exact workspace names) then run a skill. Errors list the valid names so the model can self-correct. */
export function executeTool(name: string, input: Record<string, unknown>, env: AgentEnv, snap: AgentSnapshot): ToolResult {
  const ws = env.workspace;
  const enabledName = (k: SkillKey) => snap.skills[k]?.enabled && TOOL_NAMES[k] === name;
  try {
    if (enabledName('assign')) {
      const target = str(input.target)?.replace(/^@/, '');
      if (!target) return fail('target is required');
      const strategy = input.strategy === 'least_open' ? 'least_open' : 'round_robin';
      if (teamOf(ws, target)) {
        if (!teamOf(ws, target)!.members.length) return fail(`Team "${target}" has no members`);
        return { ok: true, message: env.effects.assign({ kind: 'team', name: target }, strategy) };
      }
      if (ws.users.includes(target)) return { ok: true, message: env.effects.assign({ kind: 'user', name: target }, strategy) };
      const agent = env.agents.find((a) => a.name === target);
      if (agent) {
        if (agent.name === env.selfName) return fail('You cannot assign the conversation to yourself');
        return { ok: true, message: env.effects.assign({ kind: 'agent', name: agent.name, agentId: agent.id }, strategy) };
      }
      return fail(`Unknown target "${target}". Valid teams: ${validList(ws.teams.map((t) => t.name))}; users: ${validList(ws.users)}; AI agents: ${validList(env.agents.filter((a) => a.name !== env.selfName).map((a) => a.name))}`);
    }
    if (enabledName('close')) {
      const note = str(input.closing_note);
      if (note && !ws.closing_notes.includes(note)) return fail(`Unknown closing note "${note}". Valid: ${validList(ws.closing_notes)}`);
      const summary = str(input.summary);
      if (summary && summary.length > COMMENT_LIMIT) return fail(`summary too long (max ${COMMENT_LIMIT} characters)`);
      return { ok: true, message: env.effects.close(note, summary) };
    }
    if (enabledName('set_field')) {
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
      return { ok: true, message: env.effects.setField(field, value) };
    }
    if (enabledName('set_lifecycle')) {
      const stage = str(input.stage);
      if (!stage || !ws.lifecycle_stages.includes(stage)) return fail(`Unknown lifecycle stage "${stage ?? ''}". Valid: ${validList(ws.lifecycle_stages)}`);
      return { ok: true, message: env.effects.setLifecycle(stage) };
    }
    if (enabledName('tags')) {
      const add = strList(input.add);
      const remove = strList(input.remove);
      if (!add.length && !remove.length) return fail('Provide at least one tag in add or remove');
      const bad = [...add, ...remove].filter((t) => !ws.tags.includes(t));
      if (bad.length) return fail(`Unknown tag(s) ${validList(bad)}. Valid: ${validList(ws.tags)}`);
      return { ok: true, message: env.effects.updateTags(add, remove) };
    }
    if (enabledName('comment')) {
      const text = str(input.text);
      if (!text) return fail('text is required');
      if (text.length > COMMENT_LIMIT) return fail(`comment too long (max ${COMMENT_LIMIT} characters)`);
      const mention = str(input.mention)?.replace(/^@/, '') ?? null;
      if (mention && !ws.users.includes(mention)) return fail(`Cannot mention "${mention}": only users can be mentioned. Valid: ${validList(ws.users)}`);
      return { ok: true, message: env.effects.comment(text, mention) };
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
