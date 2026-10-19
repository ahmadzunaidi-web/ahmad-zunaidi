import type { AgentEnv, AssignTarget, ConvState, Effects } from './skills.js';
import type { KnowledgeHit } from '../types.js';
import type { Workspace } from '../workspace.js';

/** Skill effects for the "Test AI Agent" panel: mutate an in-memory snapshot and record what would happen. */
export class SimEffects implements Effects {
  readonly actions: string[] = [];
  constructor(private state: ConvState, private ws: Workspace) {}

  assign(target: AssignTarget, strategy: 'round_robin' | 'least_open'): string {
    if (target.kind === 'agent') {
      this.state.handler = 'ai';
      this.actions.push(`Assigned to AI agent ${target.name}`);
      return `(simulated) Conversation handed to AI agent ${target.name}.`;
    }
    const team = target.kind === 'team' ? target.name : this.ws.teams.find((t) => t.members.includes(target.name))?.name ?? null;
    const user = target.kind === 'team' ? this.ws.teams.find((t) => t.name === target.name)!.members[0] : target.name;
    this.state.handler = 'human'; this.state.assignee_team = team; this.state.assignee_user = user;
    this.actions.push(`Assigned to ${user}${team ? ` (${team}, ${strategy})` : ''}`);
    return `(simulated) Assigned to ${user}${team ? ` in ${team}` : ''}.`;
  }
  close(note: string | null, summary: string | null): string {
    this.state.status = 'closed'; this.state.handler = 'none';
    this.actions.push(`Closed${note ? ` — note "${note}"` : ''}${summary ? ` — summary: ${summary}` : ''}`);
    return 'Conversation closed (simulated).';
  }
  setField(field: string, value: string | number): string {
    const c = this.state.contact;
    if (field === 'Name') c.name = String(value); else if (field === 'Email') c.email = String(value); else c.fields[field] = value;
    this.actions.push(`Field ${field} = ${value}`);
    return `Field "${field}" set to ${value}.`;
  }
  setLifecycle(stage: string): string {
    this.state.contact.lifecycle = stage;
    this.actions.push(`Lifecycle → ${stage}`);
    return `Lifecycle stage set to "${stage}".`;
  }
  updateTags(add: string[], remove: string[]): string {
    const t = new Set(this.state.contact.tags);
    add.forEach((x) => t.add(x)); remove.forEach((x) => t.delete(x));
    this.state.contact.tags = [...t];
    this.actions.push(`Tags +[${add.join(', ')}] −[${remove.join(', ')}]`);
    return `Tags are now: ${this.state.contact.tags.join(', ') || '(none)'}.`;
  }
  comment(text: string, mention: string | null): string {
    this.actions.push(`Internal comment${mention ? ` @${mention}` : ''}: ${text}`);
    return 'Internal comment added (simulated).';
  }
}

export function simEnv(o: {
  workspace: Workspace; state: ConvState; selfName: string; agents: { id: number; name: string }[];
  search: (q: string, ids: number[]) => KnowledgeHit[];
}): { env: AgentEnv; effects: SimEffects } {
  const effects = new SimEffects(o.state, o.workspace);
  return { effects, env: { workspace: o.workspace, state: o.state, effects, agents: o.agents, selfName: o.selfName, searchKnowledge: o.search } };
}
