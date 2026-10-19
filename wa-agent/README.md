# WA Agent

Clean-room rebuild of a WhatsApp AI-agent platform: inbox, AI agents with skills, knowledge/RAG, workflows, follow-ups.
TypeScript · Fastify · SQLite (`node:sqlite`, FTS5) · Claude API. Specification: `../docs/respondio-ai-agent-rebuild-blueprint.md`,
rebuild instructions: `../docs/REBUILD-GUIDE.md`.

| # | Milestone | State |
|---|---|---|
| 1 | WhatsApp Cloud API webhook (HMAC), idempotent storage, echo bot, 24h window | ✅ tested |
| 2 | Inbox UI + API: takeover, assign (team round-robin / user / AI), close/reopen, internal notes, live updates | ✅ tested |
| 3 | AI agent: instructions, `$contact.*`, wait-time debounce, draft/publish versions, "Test agent" panel | ✅ tested |
| 4 | Skills with exact-name validation (assign, close, field, lifecycle, tags, comment) | ✅ tested |
| 5 | Knowledge: text + public URL crawl (SSRF-safe), BM25 search, per-agent sources | ✅ tested |
| 6 | Workflow engine: 9 trigger types, 16 step types, Ask-a-Question (9 answer types), branch/wait/assign/jump/HTTP/templates, exit conditions | ✅ tested |
| 7 | Prompt **Review** linter with "Apply fix", visual workflow builder, metrics dashboard | ✅ tested (+ browser smoke test) |
| 8 | HTTP skill, Trigger-Workflow skill, persistent follow-ups, attachments, WhatsApp templates + buttons/lists, AI rate limit, restart recovery | ✅ tested |
| 9 | **Inbound media**: authenticated download, magic-byte validation, private hash-named storage, images/PDFs shown to Claude, opt-in voice-note transcription, retention | ✅ tested (+ browser smoke test) |

## Run it

```bash
npm ci
cp .env.example .env        # optional; the app also runs with no env at all
npm run dev                 # http://localhost:3000
npm test                    # 120 tests
npm run typecheck
```

With **no credentials** everything still works end to end: a customer simulator is built into the inbox, WhatsApp sends
are logged (dry-run) and a keyword-based **demo model** stands in for Claude (shown in the header chips; it is not a
language model). Set `ANTHROPIC_API_KEY` for real answers.

Edit `config/workspace.json` for your teams, users, lifecycle stages, contact fields, closing notes, tags and timezone.
The AI may only use these **exact** names; anything else makes the skill fail and the error lists the valid names.

### Environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Real model (default `claude-opus-5-5`, per-agent `model` field). Unset → demo model |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | Send via the WhatsApp Cloud API. Unset → dry-run |
| `WA_APP_SECRET` | Verifies `X-Hub-Signature-256`. **Required** unless `ALLOW_UNSIGNED=1` (local only) |
| `WA_VERIFY_TOKEN` | Token for Meta's `GET /webhook/whatsapp` handshake |
| `ADMIN_TOKEN` | Bearer token for `/api/*`. **Required when `NODE_ENV=production`** |
| `AI_MAX_RUNS_PER_HOUR` | Circuit breaker per conversation (default 40) |
| `MEDIA_DIR`, `MEDIA_MAX_MB`, `MEDIA_RETENTION_DAYS` | Where inbound media is stored (default `data/media`), size cap (16), days to keep (30; 0 = forever) |
| `TRANSCRIBE_URL`, `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL` | **Opt-in** speech-to-text (OpenAI-compatible `/audio/transcriptions`, e.g. a self-hosted Whisper). Unset → voice notes stay `[Audio message]` |
| `ECHO_FALLBACK`, `DEV_SIMULATOR` | Echo bot / customer simulator (default on outside production) |
| `PORT`, `DB_PATH`, `WORKSPACE_CONFIG`, `AGENT_MODEL` | Port, SQLite file, workspace JSON, default model |

### Connect WhatsApp

1. Meta for Developers → your app → WhatsApp → Configuration.
2. Callback URL `https://<host>/webhook/whatsapp`, verify token = `WA_VERIFY_TOKEN`, subscribe to **messages**.
3. `WA_APP_SECRET` (app secret), `WA_ACCESS_TOKEN` (permanent token), `WA_PHONE_NUMBER_ID`.
4. Register approved templates in **Knowledge → Template WhatsApp** (needed to message outside the 24h window).

## Inbound media

Images, PDFs and voice notes are downloaded (Graph API: resolve the media id, then fetch the short-lived URL with your token),
checked against magic bytes (a `.png` that is not a PNG is rejected; SVG is never stored), saved under `MEDIA_DIR` by content
hash and served back only through the authenticated `/api/media/:id` with `nosniff` + sandbox headers. The AI receives the
5 most recent images/PDFs of the last 20 messages as real image/document blocks (images ≤ 5 MB, ≤ 20 MB in total; the text
placeholder stays otherwise). A voice note becomes `[Voice note] <transcript>` and a workflow question can be answered by
voice. **Privacy:** audio is sent to the transcription provider you configure (nothing is sent unless `TRANSCRIBE_URL` is set);
files and transcripts are deleted after `MEDIA_RETENTION_DAYS`. Video, stickers, other documents and other image types stay
placeholders. In the inbox, the 📎 box of the simulator injects a file through the same validation.

## Workflows in 60 seconds

Workflows tab → **+ Workflow baharu** → "Menu → AI fallback": greet, ask a multiple-choice menu, route a valid choice to a
team, and send *anything else* to an AI agent. Click a step to edit it, **+** to insert one, **Publish** to go live.
Triggers: conversation opened/closed, tag/field/lifecycle updated, shortcut (button in the inbox), incoming webhook
(`POST /hooks/workflow/<token>` with `{"phone": "...", ...}` → `{{$trigger.x}}`), click-to-WhatsApp ad, manual.
Texts use `{{$contact.firstname}}`, `{{$var.topic}}`, `{{$trigger.order.id}}`.

## HTTP API (all under `/api`, admin token)

Conversations `GET/POST /conversations[/:id[/messages|takeover|assign|status|comments|template|shortcut]]` ·
Contacts `PUT /contacts/:id` · Agents `GET/POST/PUT /agents[/:id]`, `…/publish|unpublish|test|review|tools|runs` ·
Media `GET /media/:id`, Knowledge `GET/POST/DELETE /knowledge`, `POST /knowledge/search` · Workflows `GET/POST/PUT/DELETE /workflows[/:id]`,
`…/validate|publish|stop|clone|test|runs` · Templates `GET/POST/DELETE /templates` · `GET /metrics?days=` ·
`GET /config`, `PUT /settings/default-agent`, `GET /events` (SSE), `POST /dev/simulate`.

## Known limits (be honest before going live)

* **Not tested against live services.** WhatsApp Cloud API and Claude are exercised through fakes/scripted responses; the
  Cloud API sender and `ClaudeProvider` request shapes are unit-tested but have not run with real credentials.
* Inbound **video, stickers and non-PDF documents** are not downloaded (placeholders only); no OCR beyond what Claude does on images/PDFs; transcription needs an external provider you choose.
* No voice calls, Google Sheets/Conversions-API steps, or "only assign to online users" (no presence).
* Retrieval is keyword/BM25, not embeddings; no PDF/DOCX parsing (text, markdown, CSV, HTML only).
* Single workspace, single `ADMIN_TOKEN`, single instance (debounce timers are in-process; follow-ups, workflow timers
  and `recover()` are persisted).
* `node:sqlite` is experimental in Node 22 (prints a warning); requires Node ≥ 22.13.
