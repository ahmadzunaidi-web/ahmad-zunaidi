import { createHmac } from 'node:crypto';
import { ScriptedProvider, type LlmRequest, type LlmResponse } from '../src/agent/llm.js';
import type { Sender } from '../src/channels/whatsapp.js';
import { loadConfig, type Config } from '../src/config.js';
import { EventHub } from '../src/core/events.js';
import { FollowUps } from '../src/core/followups.js';
import { Pipeline } from '../src/core/pipeline.js';
import { WorkflowEngine } from '../src/workflow/engine.js';
import { openDb } from '../src/db.js';
import { Knowledge } from '../src/knowledge/ingest.js';
import { buildApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { loadWorkspace } from '../src/workspace.js';

export class CaptureSender implements Sender {
  sent: { to: string; body: string }[] = [];
  failNext = false;
  async sendInteractive(to: string, i: { body: string; choices: string[] }) {
    this.sent.push({ to, body: `${i.body} [${i.choices.join(' | ')}]` });
    return { id: `wamid.out.${this.sent.length}` };
  }
  async sendText(to: string, body: string) {
    if (this.failNext) { this.failNext = false; throw new Error('graph api down'); }
    this.sent.push({ to, body });
    return { id: `wamid.out.${this.sent.length}` };
  }
}

export const SECRET = 'app-secret';

export function setup(over: Partial<Config> = {}, fetchImpl?: typeof fetch) {
  const cfg: Config = { ...loadConfig({}), waAppSecret: SECRET, waVerifyToken: 'verify-me', echoFallback: true, devSimulator: true, adminToken: '', ...over };
  const store = new Store(openDb(':memory:'));
  const hub = new EventHub();
  const sender = new CaptureSender();
  const steps: ((req: LlmRequest) => LlmResponse)[] = [];
  const provider = new ScriptedProvider(steps);
  const workspace = loadWorkspace('config/workspace.json');
  const pipeline = new Pipeline({ store, sender, hub, cfg, workspace, provider, fetchImpl });
  const knowledge = new Knowledge(store, fetchImpl);
  const engine = new WorkflowEngine(pipeline);
  const followups = new FollowUps(pipeline);
  const { app, drain } = buildApp({ cfg, store, pipeline, hub, workspace, knowledge, engine, provider, fetchImpl });
  return { cfg, store, hub, sender, steps, provider, workspace, pipeline, knowledge, engine, followups, app, drain };
}

export type Ctx = ReturnType<typeof setup>;

export function waPayload(from: string, text: string, id: string, name = 'Aina Binti Ali') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: from, profile: { name } }],
      messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    } }] }],
  };
}

export function signed(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return { payload: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') } };
}

export async function inbound(c: Ctx, from: string, text: string, id = `wamid.${Math.random().toString(36).slice(2)}`) {
  const { payload, headers } = signed(waPayload(from, text, id));
  const res = await c.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload, headers });
  await c.drain();
  return res;
}

/** POST a signed webhook WITHOUT waiting for background processing. */
export function postInbound(c: Ctx, from: string, text: string, id: string) {
  const { payload, headers } = signed(waPayload(from, text, id));
  return c.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload, headers });
}

export async function api(c: Ctx, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) {
  const res = await c.app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
  return { status: res.statusCode, body: res.body ? safeJson(res.body) : null };
}

const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return s; } };

export const allSkills = (prompt = '') => Object.fromEntries(['assign', 'close', 'set_field', 'set_lifecycle', 'tags', 'comment'].map((k) => [k, { enabled: true, prompt }]));

/** Create + publish an agent through the public API. */
export async function publishAgent(c: Ctx, name: string, draft: Record<string, unknown> = {}) {
  const created = await api(c, 'POST', '/api/agents', { name, draft: { instructions: `# CONTEXT\nYou are ${name}. Hi $contact.firstname.`, wait_seconds: 0, skills: allSkills(), ...draft } });
  if (created.status !== 200) throw new Error(JSON.stringify(created.body));
  const pub = await api(c, 'POST', `/api/agents/${created.body.id}/publish`);
  return pub.body as { id: number; name: string };
}
