import { readFileSync } from 'node:fs';

export interface Team {
  name: string;
  members: string[];
}
export interface FieldDef {
  name: string;
  type: 'text' | 'number';
}

/** Canonical names the AI is allowed to use. Matching is exact (case-sensitive) on purpose. */
export interface Workspace {
  timezone: string;
  teams: Team[];
  users: string[];
  lifecycle_stages: string[];
  custom_fields: FieldDef[];
  closing_notes: string[];
  tags: string[];
}

const strArr = (v: unknown, label: string): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) throw new Error(`workspace.${label} must be an array of non-empty strings`);
  return v as string[];
};

export function parseWorkspace(raw: unknown): Workspace {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('workspace config must be an object');
  const teams = (o.teams ?? []) as { name: string; members: string[] }[];
  for (const t of teams) {
    if (!t?.name) throw new Error('workspace.teams[].name required');
    strArr(t.members, `teams[${t.name}].members`);
  }
  const fields = (o.custom_fields ?? []) as FieldDef[];
  for (const f of fields) if (!f?.name || (f.type !== 'text' && f.type !== 'number')) throw new Error('workspace.custom_fields[] needs name and type text|number');
  return {
    timezone: typeof o.timezone === 'string' ? o.timezone : 'UTC',
    teams,
    users: strArr(o.users ?? [], 'users'),
    lifecycle_stages: strArr(o.lifecycle_stages ?? [], 'lifecycle_stages'),
    custom_fields: fields,
    closing_notes: strArr(o.closing_notes ?? [], 'closing_notes'),
    tags: strArr(o.tags ?? [], 'tags'),
  };
}

export function loadWorkspace(path: string): Workspace {
  return parseWorkspace(JSON.parse(readFileSync(path, 'utf8')));
}

export const BUILTIN_FIELDS = ['Name', 'Email'] as const;

export function validList(list: string[]): string {
  return list.length ? list.map((x) => `"${x}"`).join(', ') : '(none configured)';
}

export function teamOf(ws: Workspace, name: string): Team | undefined {
  return ws.teams.find((t) => t.name === name);
}
