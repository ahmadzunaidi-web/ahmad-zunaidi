import { CloudApiSender, DryRunSender } from './channels/whatsapp.js';
import { ClaudeProvider } from './agent/llm.js';
import { DemoProvider } from './agent/demo.js';
import { loadConfig } from './config.js';
import { EventHub } from './core/events.js';
import { FollowUps } from './core/followups.js';
import { Pipeline } from './core/pipeline.js';
import { WorkflowEngine } from './workflow/engine.js';
import { openDb } from './db.js';
import { Knowledge } from './knowledge/ingest.js';
import { buildApp } from './server.js';
import { Store } from './store.js';
import { loadWorkspace } from './workspace.js';

const cfg = loadConfig();
if (process.env.NODE_ENV === 'production' && !cfg.adminToken) {
  console.error('[wa-agent] refusing to start in production without ADMIN_TOKEN (the inbox API would be open to the internet).');
  process.exit(1);
}
const workspace = loadWorkspace(cfg.workspacePath);
const store = new Store(openDb(cfg.dbPath));
const hub = new EventHub();

const waReady = !!(cfg.waAccessToken && cfg.waPhoneNumberId);
const sender = waReady ? new CloudApiSender(cfg) : new DryRunSender();
const provider = cfg.anthropicKey || process.env.ANTHROPIC_AUTH_TOKEN
  ? new ClaudeProvider(cfg.anthropicKey || undefined)
  : new DemoProvider(workspace.teams[0]?.name ?? null);

const log = (msg: string, extra?: unknown) => console.log(`[wa-agent] ${msg}`, extra ?? '');
const pipeline = new Pipeline({ store, sender, hub, cfg, workspace, provider, log });
const knowledge = new Knowledge(store);
const engine = new WorkflowEngine(pipeline);
const followups = new FollowUps(pipeline);
const { app } = buildApp({ cfg, store, pipeline, hub, workspace, knowledge, engine, provider });

if (!waReady) log('WhatsApp credentials missing: outbound messages are logged (dry-run). Set WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID.');
if (!cfg.waAppSecret && !cfg.allowUnsigned) log('WA_APP_SECRET not set: the webhook will reject requests. Use ALLOW_UNSIGNED=1 only for local testing.');
if (provider.name !== 'claude') log(`LLM: ${provider.name}`);
if (!cfg.adminToken) log('ADMIN_TOKEN not set: the inbox API is open. Set it before exposing this server.');

await app.listen({ port: cfg.port, host: '0.0.0.0' });
log(`listening on http://localhost:${cfg.port}`);

// Timers: workflow waits/timeouts and AI follow-ups are persisted, so a restart only delays them.
const timers = [
  setInterval(() => void engine.tick().catch((e) => log('workflow tick failed', (e as Error).message)), 5_000),
  setInterval(() => void followups.tick().catch((e) => log('follow-up tick failed', (e as Error).message)), 15_000),
];
const recovered = pipeline.recover();
if (recovered) log(`recovered ${recovered} conversation(s) that were waiting for an AI reply`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    timers.forEach(clearInterval);
    await pipeline.idle().catch(() => {});
    await app.close();
    process.exit(0);
  });
}
