import type { HttpAction, HttpInput } from '../types.js';
import { safeRequest } from '../knowledge/safe-fetch.js';
import type { ToolDef } from './llm.js';

export const MAX_HTTP_ACTIONS = 10;
export const MAX_INPUTS = 20;
export const MAX_QUERY = 50;
export const MAX_HEADERS = 50;
export const MASK = '***';

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|x-api-key|api-key|apikey|x-auth-token|x-token|cookie)$/i;
const SENSITIVE_QUERY = /(key|token|secret|password|signature|auth)/i;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;
const INPUT_NAME = /^[A-Za-z0-9_]{1,30}$/;
const FORMATS = ['text', 'number', 'boolean', 'date'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PLACEHOLDER = /\$(agent|contact)\.([A-Za-z0-9_]+)/g;

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
export const httpToolName = (a: Pick<HttpAction, 'name'>) => `http_${slug(a.name)}`;

/** Hide secrets when actions are sent to the browser. */
export function maskActions(list: HttpAction[]): HttpAction[] {
  return list.map((a) => ({
    ...a,
    headers: Object.fromEntries(Object.entries(a.headers).map(([k, v]) => [k, SENSITIVE_HEADER.test(k) && v ? MASK : v])),
    query: Object.fromEntries(Object.entries(a.query).map(([k, v]) => [k, SENSITIVE_QUERY.test(k) && v && !PLACEHOLDER.test(v) ? MASK : v])),
  }));
}

/** When the browser sends back "***", keep the stored secret. */
export function restoreSecrets(incoming: HttpAction[], existing: HttpAction[]): HttpAction[] {
  return incoming.map((a) => {
    const old = existing.find((e) => e.name === a.name);
    const fix = (nu: Record<string, string>, prev: Record<string, string> | undefined) =>
      Object.fromEntries(Object.entries(nu).map(([k, v]) => [k, v === MASK ? (prev?.[k] ?? '') : v]));
    return { ...a, headers: fix(a.headers ?? {}, old?.headers), query: fix(a.query ?? {}, old?.query) };
  });
}

const placeholdersToProbe = (s: string) => s.replace(PLACEHOLDER, 'x');

export function validateHttpActions(raw: unknown): HttpAction[] {
  if (!Array.isArray(raw)) throw new Error('http_actions must be an array');
  if (raw.length > MAX_HTTP_ACTIONS) throw new Error(`At most ${MAX_HTTP_ACTIONS} HTTP actions per agent`);
  const names = new Set<string>();
  const slugs = new Set<string>();
  return raw.map((r: any, i) => {
    const where = `HTTP action #${i + 1}`;
    const name = String(r?.name ?? '').trim();
    if (!name || name.length > 60) throw new Error(`${where}: name is required (max 60 characters)`);
    if (names.has(name) || slugs.has(slug(name))) throw new Error(`${where}: names must be unique ("${name}")`);
    if (!slug(name)) throw new Error(`${where}: name needs letters or numbers`);
    names.add(name); slugs.add(slug(name));
    const description = String(r.description ?? '').trim();
    if (description.length > 1000) throw new Error(`${where}: description is limited to 1000 characters`);
    const method = String(r.method ?? 'GET').toUpperCase();
    if (!METHODS.includes(method)) throw new Error(`${where}: method must be one of ${METHODS.join(', ')}`);
    const url = String(r.url ?? '').trim();
    try { const u = new URL(placeholdersToProbe(url)); if (!/^https?:$/.test(u.protocol)) throw new Error('x'); } catch { throw new Error(`${where}: URL must be a valid http(s) address`); }
    const inputsRaw: HttpInput[] = Array.isArray(r.inputs) ? r.inputs : [];
    if (inputsRaw.length > MAX_INPUTS) throw new Error(`${where}: at most ${MAX_INPUTS} inputs`);
    const seen = new Set<string>();
    const inputs = inputsRaw.map((x) => {
      const n = String(x?.name ?? '');
      if (!INPUT_NAME.test(n)) throw new Error(`${where}: input names use letters, numbers and _ (max 30), got "${n}"`);
      if (seen.has(n)) throw new Error(`${where}: duplicate input "${n}"`);
      seen.add(n);
      if (!FORMATS.includes(x.format)) throw new Error(`${where}: input "${n}" has an invalid format`);
      return { name: n, format: x.format, description: String(x.description ?? '').slice(0, 300), ...(x.array ? { array: true } : {}) } as HttpInput;
    });
    const query = Object.fromEntries(Object.entries((r.query ?? {}) as Record<string, unknown>).map(([k, v]) => [String(k), String(v ?? '')]));
    if (Object.keys(query).length > MAX_QUERY) throw new Error(`${where}: at most ${MAX_QUERY} query parameters`);
    const headers = Object.fromEntries(Object.entries((r.headers ?? {}) as Record<string, unknown>).map(([k, v]) => [String(k), String(v ?? '')]));
    if (Object.keys(headers).length > MAX_HEADERS) throw new Error(`${where}: at most ${MAX_HEADERS} headers`);
    for (const [k, v] of Object.entries(headers)) {
      if (!HEADER_NAME.test(k)) throw new Error(`${where}: invalid header name "${k}"`);
      if (/[\r\n]/.test(v)) throw new Error(`${where}: header "${k}" must be a single line`);
    }
    for (const m of [url, ...Object.values(query), ...Object.values(headers), r.body ?? ''].join('\n').matchAll(PLACEHOLDER)) {
      if (m[1] === 'agent' && !seen.has(m[2])) throw new Error(`${where}: $agent.${m[2]} is used but no input called "${m[2]}" exists`);
    }
    let body: string | undefined;
    if (r.body !== undefined && String(r.body).trim()) {
      body = String(r.body);
      try {
        const dummy: Record<string, unknown> = Object.fromEntries(inputs.map((i) => {
          const v = i.format === 'number' ? 0 : i.format === 'boolean' ? true : i.format === 'date' ? '2000-01-01' : 'x';
          return [i.name, i.array ? [v] : v];
        }));
        JSON.parse(renderJsonBody(body, { agent: dummy, contact: new Proxy({}, { get: () => 'x' }) as Record<string, string> }));
      } catch { throw new Error(`${where}: body must be valid JSON`); }
      if (method === 'GET') throw new Error(`${where}: GET requests cannot have a body`);
    }
    return { name, description, inputs, method: method as HttpAction['method'], url, query, headers, ...(body ? { body } : {}) };
  });
}

export function buildHttpTools(actions: HttpAction[]): ToolDef[] {
  return actions.map((a) => ({
    name: httpToolName(a),
    description: `Call an external API: ${a.method} ${new URL(placeholdersToProbe(a.url)).host}. ${a.description || a.name}\nIf an input is missing from the conversation, ask the contact for it first. The API result is returned to you; explain it to the contact in plain language. Do not guess values.`,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(a.inputs.map((i) => {
        const base = i.format === 'number' ? { type: 'number' } : i.format === 'boolean' ? { type: 'boolean' } : i.format === 'date' ? { type: 'string', description: 'YYYY-MM-DD' } : { type: 'string' };
        const sch = i.array ? { type: 'array', items: base } : base;
        return [i.name, { ...sch, description: [i.description, (sch as { description?: string }).description].filter(Boolean).join(' ') || undefined }];
      })),
      required: a.inputs.map((i) => i.name),
      additionalProperties: false,
    },
  }));
}

function coerce(i: HttpInput, v: unknown): unknown {
  const one = (x: unknown) => {
    if (i.format === 'number') { const n = Number(x); if (!Number.isFinite(n)) throw new Error(`"${i.name}" must be a number`); return n; }
    if (i.format === 'boolean') { if (typeof x === 'boolean') return x; if (x === 'true' || x === 'false') return x === 'true'; throw new Error(`"${i.name}" must be true or false`); }
    if (i.format === 'date') { const s = String(x); if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(`"${i.name}" must be a date like 2026-01-31`); return s; }
    const s = String(x);
    if (s.length > 2000) throw new Error(`"${i.name}" is too long`);
    return s;
  };
  if (i.array) { if (!Array.isArray(v)) throw new Error(`"${i.name}" must be a list`); return v.slice(0, 50).map(one); }
  return one(v);
}

type Values = { agent: Record<string, unknown>; contact: Record<string, string> };

const asText = (v: unknown) => (Array.isArray(v) ? v.join(',') : v === undefined || v === null ? '' : String(v));
const sub = (s: string, vals: Values, enc: (x: string) => string = (x) => x) =>
  s.replace(PLACEHOLDER, (_m, ns: 'agent' | 'contact', k: string) => enc(asText(ns === 'agent' ? vals.agent[k] : vals.contact[k.toLowerCase()])));

/** Substitute into a JSON template without letting values break out of the JSON structure. */
export function renderJsonBody(tpl: string, vals: Values): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < tpl.length; i++) {
    const ch = tpl[i];
    if (inStr) {
      if (ch === '\\') { out += ch + (tpl[++i] ?? ''); continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '$') {
        const m = /^\$(agent|contact)\.([A-Za-z0-9_]+)/.exec(tpl.slice(i));
        if (m) { out += JSON.stringify(asText(m[1] === 'agent' ? vals.agent[m[2]] : vals.contact[m[2].toLowerCase()])).slice(1, -1); i += m[0].length - 1; continue; }
      }
      out += ch;
    } else if (ch === '"') { inStr = true; out += ch; }
    else if (ch === '$') {
      const m = /^\$(agent|contact)\.([A-Za-z0-9_]+)/.exec(tpl.slice(i));
      if (m) { out += JSON.stringify(m[1] === 'agent' ? vals.agent[m[2]] ?? null : vals.contact[m[2].toLowerCase()] ?? ''); i += m[0].length - 1; }
      else out += ch;
    } else out += ch;
  }
  return out;
}

export interface HttpRunCtx {
  contact: Record<string, string>;
  fetchImpl?: typeof fetch;
  onUrls?: (urls: string[]) => void;
}

export async function runHttpAction(a: HttpAction, input: Record<string, unknown>, ctx: HttpRunCtx): Promise<{ ok: boolean; message: string }> {
  try {
    const agent: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const i of a.inputs) {
      if (input[i.name] === undefined || input[i.name] === null || input[i.name] === '') missing.push(i.name);
      else agent[i.name] = coerce(i, input[i.name]);
    }
    if (missing.length) return { ok: false, message: `Missing input(s): ${missing.join(', ')}. Ask the contact for them, then call again.` };
    const vals: Values = { agent, contact: ctx.contact };
    const url = new URL(sub(a.url, vals, encodeURIComponent));
    for (const [k, v] of Object.entries(a.query)) url.searchParams.set(k, sub(v, vals));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(a.headers)) {
      const val = sub(v, vals);
      if (/[\r\n]/.test(val)) return { ok: false, message: `Header "${k}" contains a line break` };
      headers[k] = val;
    }
    const body = a.body ? renderJsonBody(a.body, vals) : undefined;
    if (body) { JSON.parse(body); if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json'; }
    const res = await safeRequest(url.toString(), { method: a.method, headers, body, timeoutMs: 10_000, maxBytes: 200_000, truncate: true, fetchImpl: ctx.fetchImpl });
    const text = res.body.length > 6000 ? `${res.body.slice(0, 6000)}\n…(truncated)` : res.body;
    ctx.onUrls?.([...res.body.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)].map((m) => m[0]));
    const ok = res.status >= 200 && res.status < 300;
    return { ok, message: `HTTP ${res.status}${ok ? '' : ' (failure)'}\n${text || '(empty body)'}` };
  } catch (e) {
    return { ok: false, message: `Request failed: ${(e as Error).message}` };
  }
}
