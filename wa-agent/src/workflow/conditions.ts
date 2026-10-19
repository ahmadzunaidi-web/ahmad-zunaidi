import type { Condition } from './types.js';

export interface CondContext {
  contact: { name: string | null; wa_id: string; email: string | null; lifecycle: string | null; tags: string[]; fields: Record<string, string | number> };
  conversation?: { status: string; handler: string; assignee_team: string | null; assignee_user: string | null } | null;
  vars: Record<string, unknown>;
  trigger: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

function actual(c: Condition, ctx: CondContext): string | null {
  const key = c.key ?? '';
  switch (c.source) {
    case 'lifecycle': return ctx.contact.lifecycle;
    case 'field': {
      const k = key.toLowerCase();
      if (k === 'name') return ctx.contact.name;
      if (k === 'email') return ctx.contact.email;
      if (k === 'phone') return ctx.contact.wa_id;
      const f = Object.entries(ctx.contact.fields).find(([n]) => n === key);
      return f ? String(f[1]) : null;
    }
    case 'var': return ctx.vars[key] === undefined ? null : String(ctx.vars[key]);
    case 'trigger': return ctx.trigger[key] === undefined ? null : String(ctx.trigger[key]);
    case 'conversation': {
      const v = ctx.conversation?.[key as 'status'];
      return v === undefined || v === null ? null : String(v);
    }
    case 'tag': return null;
  }
}

export function evalCondition(c: Condition, ctx: CondContext): boolean {
  if (c.op === 'has_tag' || c.op === 'not_has_tag' || c.source === 'tag') {
    const has = ctx.contact.tags.includes(c.key ?? c.value ?? '');
    return c.op === 'not_has_tag' ? !has : has;
  }
  const a = actual(c, ctx);
  const v = c.value ?? '';
  switch (c.op) {
    case 'is_empty': return a === null || a === '';
    case 'is_not_empty': return a !== null && a !== '';
    case 'equals': return a !== null && (num(a) !== null && num(v) !== null ? num(a) === num(v) : a === v);
    case 'not_equals': return !(a !== null && (num(a) !== null && num(v) !== null ? num(a) === num(v) : a === v));
    case 'contains': return a !== null && a.toLowerCase().includes(v.toLowerCase());
    case 'not_contains': return a === null || !a.toLowerCase().includes(v.toLowerCase());
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const x = num(a), y = num(v);
      if (x === null || y === null) return false;
      return c.op === 'gt' ? x > y : c.op === 'gte' ? x >= y : c.op === 'lt' ? x < y : x <= y;
    }
    default: return false;
  }
}

export function evalAll(conds: Condition[] | undefined, ctx: CondContext, match: 'all' | 'any' = 'all'): boolean {
  if (!conds?.length) return true;
  return match === 'any' ? conds.some((c) => evalCondition(c, ctx)) : conds.every((c) => evalCondition(c, ctx));
}
