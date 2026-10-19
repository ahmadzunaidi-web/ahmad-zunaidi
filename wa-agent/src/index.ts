import { CloudApiSender, DryRunSender } from './channels/whatsapp.js';
import { ClaudeProvider } from './agent/llm.js';
import { DemoProvider } from './agent/demo.js';
import { loadConfig } from './config.js';
import { EventHub } from './core/events.js';
import { Pipeline } from './core/pipeline.js';
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
const { app } = buildApp({ cfg, store, pipeline, hub, workspace, knowledge, provider });

if (!waReady) log('WhatsApp credentials missing: outbound messages are logged (dry-run). Set WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID.');
if (!cfg.waAppSecret && !cfg.allowUnsigned) log('WA_APP_SECRET not set: the webhook will reject requests. Use ALLOW_UNSIGNED=1 only for local testing.');
if (provider.name !== 'claude') log(`LLM: ${provider.name}`);
if (!cfg.adminToken) log('ADMIN_TOKEN not set: the inbox API is open. Set it before exposing this server.');

await app.listen({ port: cfg.port, host: '0.0.0.0' });
log(`listening on http://localhost:${cfg.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await pipeline.idle().catch(() => {});
    await app.close();
    process.exit(0);
  });
}
