import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Loaded via require so bundlers/test runners that strip the `node:` prefix still resolve the built-in.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contact (
  id INTEGER PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  lifecycle TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contact(id),
  status TEXT NOT NULL DEFAULT 'open',
  handler TEXT NOT NULL DEFAULT 'none',
  agent_id INTEGER,
  assignee_team TEXT,
  assignee_user TEXT,
  last_inbound_at INTEGER,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  closing_note TEXT,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS conv_contact ON conversation(contact_id, status);
CREATE TABLE IF NOT EXISTS message (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversation(id),
  direction TEXT NOT NULL,
  sender TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  wa_message_id TEXT UNIQUE,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS msg_conv ON message(conversation_id, id);
CREATE TABLE IF NOT EXISTS conv_event (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversation(id),
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  after_message_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS comment (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversation(id),
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🤖',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inactive',
  published_version INTEGER,
  draft TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_version (
  agent_id INTEGER NOT NULL REFERENCES agent(id),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, version)
);
CREATE TABLE IF NOT EXISTS agent_run (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER,
  agent_id INTEGER,
  trigger TEXT,
  reply TEXT,
  tool_calls TEXT NOT NULL DEFAULT '[]',
  usage TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_source (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  uri TEXT,
  status TEXT NOT NULL,
  error TEXT,
  chars INTEGER NOT NULL DEFAULT 0,
  chunks INTEGER NOT NULL DEFAULT 0,
  embed_status TEXT NOT NULL DEFAULT 'none',
  embed_model TEXT,
  embed_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_chunk (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES knowledge_source(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB,
  embed_model TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(text, source_id UNINDEXED, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workflow (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  trigger TEXT NOT NULL,
  graph TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  hook_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE TABLE IF NOT EXISTS workflow_run (
  id INTEGER PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflow(id),
  contact_id INTEGER NOT NULL,
  conversation_id INTEGER,
  status TEXT NOT NULL,
  step_id TEXT,
  wait_kind TEXT,
  wait_until INTEGER,
  vars TEXT NOT NULL DEFAULT '{}',
  trigger_vars TEXT NOT NULL DEFAULT '{}',
  steps_run INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0,
  ended_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wr_active ON workflow_run(status, wait_until);
CREATE INDEX IF NOT EXISTS wr_contact ON workflow_run(contact_id, status);
CREATE TABLE IF NOT EXISTS wa_template (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  body TEXT NOT NULL,
  params INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name, language)
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES message(id),
  wa_media_id TEXT,
  kind TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  sha256 TEXT,
  path TEXT,
  status TEXT NOT NULL,
  transcript TEXT,
  caption TEXT,
  filename TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_msg ON media(message_id);
CREATE TABLE IF NOT EXISTS followup_job (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  delay_minutes REAL NOT NULL,
  run_at INTEGER,
  message TEXT,
  template TEXT,
  params TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fj_due ON followup_job(status, run_at);
`;

export function openDb(path: string): DatabaseSyncType {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** CREATE TABLE IF NOT EXISTS never alters an existing table: add columns introduced later. */
function ensureColumns(db: DatabaseSyncType, table: string, cols: Record<string, string>): void {
  const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name));
  for (const [name, ddl] of Object.entries(cols)) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
}

function migrate(db: DatabaseSyncType): void {
  ensureColumns(db, 'knowledge_source', { embed_status: "TEXT NOT NULL DEFAULT 'none'", embed_model: 'TEXT', embed_error: 'TEXT' });
  ensureColumns(db, 'knowledge_chunk', { embedding: 'BLOB', embed_model: 'TEXT' });
}
