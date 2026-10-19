# WA Agent — milestones 1–5

Clean-room rebuild of a WhatsApp AI-agent platform (inbox + AI agent with skills + knowledge/RAG), following
`../respondio-ai-agent-rebuild-blueprint.md`. TypeScript, Fastify, SQLite (`node:sqlite`, FTS5), Claude API.

| # | Milestone | State |
|---|---|---|
| 1 | WhatsApp Cloud API webhook (HMAC), idempotent storage, echo bot, 24h window | ✅ tested |
| 2 | Inbox UI + API: takeover, assign (team round-robin / user / AI), close/reopen, internal notes, live updates (SSE) | ✅ tested |
| 3 | AI agent: instructions, `$contact.*` variables, wait-time debounce, draft/publish versions, "Test agent" panel | ✅ tested (scripted model) |
| 4 | Skills: assign, close, contact field, lifecycle, tags, internal comment — exact-name validation | ✅ tested (scripted model) |
| 5 | Knowledge: text + public URL crawl (SSRF-safe), chunking, BM25 search, per-agent source selection | ✅ tested |

## Run it

```bash
cd wa-agent
npm install
cp .env.example .env        # optional; the app also runs with no env at all
npm run dev                 # http://localhost:3000
npm test                    # 53 tests
npm run typecheck
```

With **no credentials** it still runs end to end: a customer simulator is built into the inbox, WhatsApp sends are
logged (dry-run) and a keyword-based **demo model** stands in for Claude (clearly labelled in the header chips).
It is not a language model — set `ANTHROPIC_API_KEY` for real answers.

Edit `config/workspace.json` to define your teams, users, lifecycle stages, contact fields, closing notes and tags.
The AI may only use these **exact** names; anything else makes the skill fail and the error lists the valid names.

### Environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Real model (default `claude-opus-5-5`, per-agent `model` field). Unset → demo model |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | Send via the WhatsApp Cloud API. Unset → dry-run |
| `WA_APP_SECRET` | Verifies `X-Hub-Signature-256`. **Required** unless `ALLOW_UNSIGNED=1` (local only) |
| `WA_VERIFY_TOKEN` | Token for Meta's `GET /webhook/whatsapp` handshake |
| `ADMIN_TOKEN` | Bearer token for `/api/*` (the UI prompts for it). **Set it before exposing the server** |
| `ECHO_FALLBACK` | Echo inbound text when no AI agent handles the chat (default on outside production) |
| `DEV_SIMULATOR` | Enables `/api/dev/simulate` and the simulator box (default on outside production) |
| `PORT`, `DB_PATH`, `WORKSPACE_CONFIG`, `AGENT_MODEL` | Port, SQLite file, workspace JSON, default model |

### Connect WhatsApp

1. Meta for Developers → your app → WhatsApp → Configuration.
2. Callback URL `https://<your-host>/webhook/whatsapp`, verify token = `WA_VERIFY_TOKEN`, subscribe to **messages**.
3. Put the app secret in `WA_APP_SECRET`, the permanent token in `WA_ACCESS_TOKEN`, the number's id in `WA_PHONE_NUMBER_ID`.

## How it fits together

```
Meta ──webhook──► /webhook/whatsapp ─► Pipeline.handleInbound ─► store (contact, conversation, message)
                                            │ route by handler
                          none ─► default AI agent? ─► else echo
                          ai   ─► debounce(wait_seconds) ─► runAgent ─► skills (tools) + search_knowledge_base
                          human─► inbox only                         └► reply ─► Pipeline.send (24h window) ─► Cloud API
```

* `src/agent/runtime.ts` — builds the context (platform rules, workspace names, contact state, events, last 20
  messages), runs the tool loop (max 6 iterations), replays assistant content verbatim and returns all tool results in
  one user message.
* `src/agent/skills.ts` — tool definitions + exact-name validation. The owner's "when and how" prompt is appended to
  each tool's description.
* `src/core/pipeline.ts` — routing, debounce, superseded-reply handling, AI→AI handoff (max 3 hops), 24h window.
* Versioning: edits change the **draft**; **Publish** creates a new immutable version that the runtime uses.

## Known limits (be honest before going live)

* **Not tested against live services.** WhatsApp Cloud API and Claude are exercised only through fakes/scripted
  responses in tests; the Cloud API sender and `ClaudeProvider` have not been run with real credentials.
* Inbound **media is not downloaded**: images/audio/etc. reach the AI as placeholders (`[Image]`, `[Audio message]`).
* Outbound is **plain text only**; WhatsApp **template messages** (needed outside the 24h window) are not implemented
  — such sends are marked failed with a clear reason.
* Single workspace, in-process queue and timers (a restart drops pending debounce timers). Use a real queue
  (e.g. BullMQ) before running more than one instance.
* Retrieval is keyword/BM25 (FTS5), not embeddings; PDF/DOCX parsing is not included (text, markdown, CSV, HTML only).
* Not built yet: workflow engine, HTTP-request and trigger-workflow skills, follow-ups, prompt "Review" linter,
  multi-user auth (one shared `ADMIN_TOKEN`).
* `node:sqlite` is experimental in Node 22 (prints a warning); requires Node ≥ 22.13.
