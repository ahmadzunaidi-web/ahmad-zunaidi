# Panduan Rebuild A–Z

Dokumen ini menerangkan cara **membina semula** sistem chatbot WhatsApp + AI Agent (gaya respond.io) menggunakan
zip ini. Ia dibina secara *clean-room*: spesifikasi diambil daripada dokumentasi awam respond.io (help center,
SDK/MCP/n8n rasmi) dan dibina semula sebagai kod sendiri. Tiada kod atau prompt proprietari disalin.

> **Jujur dahulu:** kod diuji dengan 138 ujian automatik (WhatsApp & Claude dipalsukan/berskrip) dan ujian pelayar
> (Chromium). Ia **belum** dijalankan dengan nombor WhatsApp atau kunci Claude sebenar. Bahagian 7 menyenaraikan
> perkara yang mesti disahkan sebelum guna dengan pelanggan sebenar.

## 1. Apa dalam zip ini

```
README.md                         ← ringkasan
docs/
  respondio-ai-agent-rebuild-blueprint.md   ← SPESIFIKASI hasil reverse engineering (fakta [DOC] vs reka bentuk [REKA])
  REBUILD-GUIDE.md                ← fail ini
wa-agent/                         ← pelaksanaan lengkap (TypeScript)
  src/ test/ public/ config/ package.json package-lock.json .env.example Dockerfile README.md
scripts/
  ui-smoke.mjs                    ← ujian pelayar (Playwright) — pilihan
build-zip.py                      ← menjana semula zip ini
```

## 2. Jalankan dalam 5 minit

```bash
unzip wa-agent-complete.zip && cd wa-agent-complete/wa-agent     # Node >= 22.13
npm ci
npm test            # 138 ujian
npm run typecheck
npm run dev         # http://localhost:3000  (tiada kunci pun jalan: simulator + model demo)
```

Tanpa kunci: simulator pelanggan dalam Inbox, hantaran WhatsApp dilog (dry-run), dan model demo berasaskan kata kunci.
Dengan kunci: isi `.env` (lihat `.env.example`) — `ANTHROPIC_API_KEY` untuk AI sebenar, `WA_*` untuk WhatsApp.

## 3. Seni bina

```
                         ┌──────────────── Inbox UI (public/index.html) ────────────────┐
Meta WhatsApp Cloud API  │ Inbox · Ejen AI · Workflows (pembina) · Knowledge · Metrik   │
        │  webhook       └───────────────────────────────┬──────────────────────────────┘
        ▼                                                │ REST + SSE
 /webhook/whatsapp ──► Pipeline.handleInbound ◄──────────┘ (src/server.ts)
   (HMAC, idempoten)        │
                            ├─1─ WorkflowEngine.consumeAnswer   (jawapan kepada "Tanya soalan"?)
                            ├─2─ trigger: conversation_opened / click_to_chat_ad …
                            └─3─ route ─ handler=human → inbox sahaja
                                       ─ handler=ai    → debounce(wait_seconds) → runAgent
                                       ─ none          → ejen default / echo
 runAgent: prompt(platform+workspace+contact+events) + 20 mesej + tools
           tools = skills(assign, close, field, lifecycle, tags, comment, trigger_workflow,
                          follow-up, attachment, HTTP actions) + search_knowledge_base
 MediaService (muat turun + validasi + transkripsi) berjalan SEBELUM routing; imej/PDF terkini → blok kandungan Claude
 Pipeline.send/sendChoices/sendTemplate/sendMedia → tetingkap 24 jam → Cloud API
 Timers (index.ts): WorkflowEngine.tick (5s) · FollowUps.tick (15s) · recover() semasa boot
 SQLite (node:sqlite, FTS5): contact, conversation, message, agent(+version), knowledge(+FTS),
                             workflow(+run), wa_template, followup_job, agent_run, comment, kv
```

### Peta fail

| Fail | Tanggungjawab |
|---|---|
| `src/channels/whatsapp.ts` | tandatangan HMAC, parse webhook (teks/interaktif/lokasi/media/referral), `CloudApiSender` (teks, butang/senarai, template, media) |
| `src/core/pipeline.ts` | **teras**: inbound idempoten, routing, debounce, penghantaran + tetingkap 24 jam, operasi kenalan (cetus workflow), handover, AI run, had kadar, `recover()` |
| `src/agent/runtime.ts` | bina konteks (peraturan platform, nama workspace, kenalan, event, 20 mesej), gelung tool (maks 6), balas semua tool result dalam satu mesej |
| `src/agent/skills.ts` | definisi tool + pengesahan nama tepat + semua skill (assign…attachment) |
| `src/agent/http-skill.ts` | skill HTTP: pengesahan, penggantian selamat (JSON/URL/header), topeng rahsia |
| `src/agent/review.ts` | linter prompt (rujukan `@ ! % $contact`, skill vs arahan, had platform, follow-up) |
| `src/core/followups.ts` | penjadual follow-up berterusan (≤5 langkah, ≤24j) |
| `src/workflow/engine.ts` | interpreter workflow: trigger, 16 jenis langkah, pengesahan jawapan, timer, exit conditions |
| `src/workflow/validate.ts` · `conditions.ts` · `template.ts` | validator graf, penilai syarat, `{{$contact.x}}` |
| `src/media/media.ts` | muat turun media 2 langkah, semakan magic bytes, simpanan hash tersendiri, transkripsi (pilihan), tempoh simpan |
| `src/knowledge/*` | chunking, crawler, **SSRF-safe fetch** (`safeRequest` dikongsi dengan HTTP skill); `embed.ts` (klien embedding serasi OpenAI), `vector.ts` (indeks kosinus dalam memori + gabungan RRF) |
| `src/store.ts` · `db.ts` | semua SQL; skema SQLite |
| `src/server.ts` | semua laluan HTTP, auth admin, SSE, webhook masuk workflow |

## 4. Urutan rebuild (jika mahu bina sendiri / dengan ejen pengekodan)

Setiap fasa: **bina → jalankan ujian yang menentukan "siap"**. Mulakan dengan `package.json` + `tsconfig.json`, bina dalam
urutan ini, dan jangan lompat fasa (setiap fasa bergantung pada yang sebelumnya).

| Fasa | Bina | Spesifikasi (blueprint) | Ujian penentu |
|---|---|---|---|
| 1 | webhook + HMAC + simpan mesej idempoten + echo + tetingkap 24 jam | §1.6, §2.3 | `test/m1-webhook.test.ts` |
| 2 | Inbox API/UI: takeover, assign, tutup/buka semula, komen, SSE | §1.5, §2.7 | `test/m2-inbox.test.ts` |
| 3 | runtime AI, pembolehubah, debounce, versi draf/publish, panel ujian | §1A-A,B,C | `test/m3-agent.test.ts`, `test/claude-provider.test.ts` |
| 4 | skills dengan nama tepat + ralat yang membantu AI membetulkan diri | §1A-D | `test/m4-skills.test.ts` |
| 5 | knowledge: chunk, FTS5/BM25, crawler SSRF-safe | §1A-E | `test/m5-knowledge.test.ts` |
| 6 | workflow engine + trigger + exit conditions + timer | §1A-F | `test/m6-workflow.test.ts` |
| 7 | Review prompt, pembina workflow (UI), metrik | §1A-F2, review | `test/m7-review.test.ts` + `scripts/ui-smoke.mjs` |
| 8 | HTTP skill, trigger-workflow, follow-up, lampiran, template/interaktif, had kadar, recover | §1A-D,G,H | `test/m8-ops.test.ts` |
| 9 | media masuk: muat turun, validasi, imej/PDF → Claude, transkripsi suara, retensi | §1A-C (mesej yang AI baca), §H | `test/m9-media.test.ts` |
| 10 | carian knowledge hibrid: embedding (pilihan), BM25 + kosinus digabung RRF, jatuh balik ke kata kunci, migrasi DB | §1A-E | `test/m10-embeddings.test.ts` |

### Prompt untuk ejen pengekodan (cth. Claude Code)

> Baca `docs/respondio-ai-agent-rebuild-blueprint.md` (bahagian 1A, 2 dan 3) dan `docs/REBUILD-GUIDE.md`.
> Bina semula projek dalam folder baharu mengikut fasa 1–8. Gunakan ujian dalam `wa-agent/test/` sebagai spesifikasi
> yang boleh dilaksana: salin fail ujian fasa semasa, implementasikan sehingga ia lulus, jalankan `npm run typecheck`,
> kemudian teruskan ke fasa seterusnya. Patuhi "Penyimpangan" (bahagian 6). Jangan guna `temperature`/`top_p`, jangan
> `tool_choice` paksa, dan hantar semula `content` assistant (termasuk blok thinking) tanpa ubah. Jangan hantar apa-apa
> ke WhatsApp/Claude sebenar sehingga saya beri kunci.

Pilihan kedua: **ubah suai** kod sedia ada — hampir semua tingkah laku tertumpu pada fail dalam peta di atas.

## 5. Peta spesifikasi → kod → ujian (ringkas)

| Tingkah laku respond.io (disahkan) | Kod | Ujian |
|---|---|---|
| AI hanya nampak 20 mesej terakhir | `store.recentMessages`, `HISTORY_WINDOW` | m3 "keeps the window to 20" |
| Event Assignment/Reopened dalam konteks | `store.eventsInWindow`, `describeEvents` | m4 "Reopened"/"Assignment Event" |
| Arahan ≤ 10,000 aksara; draf vs publish | `server.mergeDraft`, `store.publishAgent` | m3 "validates agent input", "versions agents" |
| Nama mesti tepat; `@Team`, `$contact.x` | `skills.executeTool`, `runtime.substituteVars` | m4 skills, m3 substitution |
| Wait time (debounce) | `Pipeline.scheduleAgent` | m3 debounce |
| Skill dilaksana sebelum balasan | `runtime.runAgent` | m4 qualification flow |
| Assign: round robin dalam satu team; least-open | `Pipeline.pickMember` | m2/m4 |
| Tutup: nota sedia ada; ringkasan; tidak boleh buka semula oleh AI | `skills` close, `setStatus` | m4 close |
| Follow-up ≤5, ≤24j, berhenti bila contact balas | `FollowUps`, `skills` followup | m8 follow-ups |
| HTTP skill: ≤10 action, 20 input, tiada OAuth, AI tafsir JSON | `http-skill.ts` | m8 HTTP |
| Trigger Workflow: `!nama`, mesti published, tiada data balik | `skills` trigger_workflow | m8 trigger workflow |
| Lampiran: jpg/png/pdf/docx/pptx, ≤5 | `skills` attachment, `Pipeline.sendMedia` | m8 attachments |
| Knowledge: carian kata kunci (bukan tajuk) | `store.searchKnowledge` | m5 |
| Workflow: 11 trigger-jenis, 16 langkah, ≤100 langkah, ≤150 workflow | `workflow/*` | m6 |
| Ask a Question: 9 jenis, ≤10 pilihan ≤20 aksara, failure/timeout | `engine.parseAnswer`, `exec` | m6 |
| Menu → fallback AI pada jawapan tak sah | `engine.answer` + `assign_to` agent | m6 menu |
| Webhook keluar/masuk, Custom Channel pola | `whatsapp.ts`, `server` `/hooks/workflow/:token` | m1, m6 |
| Review prompt | `agent/review.ts` | m7 |

## 6. Penyimpangan & penambahbaikan yang disengajakan

* **Draf sebenar:** respond.io menyimpan terus ke versi live; di sini Save → draf, Publish → versi tidak berubah.
* **Workflow ↔ AI:** respond.io tidak menghantar data AI→workflow; di sini `trigger_workflow` boleh bawa `variables` (`{{$trigger.x}}`).
* **Pemulihan:** debounce AI hilang bila restart dalam respond.io-gaya sistem; di sini `recover()` menjawab semula, follow-up & timer workflow disimpan dalam DB.
* **Lampiran anti-rekaan:** URL mesti wujud dalam instructions/knowledge/respons API.
* **Had kadar AI** (`AI_MAX_RUNS_PER_HOUR`) dan henti AI→AI selepas 3 hop.
* **Rahsia HTTP** disembunyikan (`***`) dalam API; SSRF diblok pada setiap lompatan redirect.
* **Tanya soalan tanpa cabang "tak sah":** kami minta semula (maks 3) sebelum keluar; respond.io hanya menamatkan.
* **Perbualan ditutup semasa menunggu jawapan:** mesej pelanggan membuka semula perbualan (respond.io tidak).
* **Media masuk:** imej/PDF disahkan dengan magic bytes dan dihantar kepada Claude sebagai blok sebenar (maks 5 terkini, tetingkap 20 mesej); audio perlu penyedia transkripsi luar kerana Claude tidak menerima audio; transkrip menjadi teks mesej supaya soalan workflow boleh dijawab dengan suara.
* **Tiada status online/offline pengguna:** "hanya assign kepada pengguna online" tidak disokong; ada "kurang daripada N perbualan terbuka".

## 7. Senarai semak sebelum guna sebenar

1. **Sahkan dengan sebenar:** hantar satu mesej WhatsApp ujian (nombor pembangun Meta), semak status penghantaran, butang interaktif,
   template, lampiran; jalankan satu perbualan dengan kunci Claude sebenar (sahkan pemanggilan tool dan `output_config.effort`).
2. **Keselamatan:** `NODE_ENV=production` mewajibkan `ADMIN_TOKEN`; letak di belakang HTTPS; simpan `WA_APP_SECRET`, token WABA dan kunci API
   sebagai secret; token URL webhook workflow ialah kelayakan — jangan kongsi.
3. **Pematuhan:** opt-in WhatsApp, template diluluskan, PDPA (persetujuan, penyimpanan, hak padam).
4. **Operasi:** sandaran fail SQLite (`DB_PATH`), satu instans sahaja (timer dalam proses), pantau tab Metrik (ralat AI, mesej gagal).
5. **Privasi media:** `TRANSCRIBE_URL` menghantar audio kepada penyedia pihak ketiga yang anda pilih (mati secara lalai; pilih yang sesuai dengan
   dasar privasi anda atau hos Whisper sendiri). Fail & transkrip dipadam selepas `MEDIA_RETENTION_DAYS` (lalai 30). Sahkan muat turun media dengan
   nombor sebenar (URL Meta tamat dalam ~5 minit).
6. **Privasi embedding:** `EMBED_URL` menghantar teks setiap bahagian knowledge DAN soalan pelanggan kepada penyedia embedding pilihan anda (mati secara lalai;
   Anthropic tiada API embedding, gunakan OpenAI/Voyage/Ollama dsb.). Jika penyedia gagal, carian jatuh balik ke kata kunci — balasan tidak terhenti.
   Vektor disimpan per model; tukar `EMBED_MODEL` dan jalankan **Indeks semula**. Carian vektor ialah brute-force dalam memori (sesuai sehingga ~100 ribu bahagian);
   tetapkan `EMBED_MIN_SCORE` untuk menapis padanan lemah (bergantung pada model). Hanya diuji dengan penyedia palsu, belum dengan API sebenar.
7. **Had diketahui:** video, pelekat dan dokumen bukan-PDF tidak dimuat turun; tiada panggilan suara, Google Sheets/CAPI; tiada penghuraian DOCX; satu workspace; satu `ADMIN_TOKEN`.

## 8. Peta jalan cadangan

Video/dokumen lain & OCR · indeks vektor ANN untuk korpus besar · multi-pengguna & peranan · multi-workspace ·
barisan kerja (BullMQ) + banyak instans · template disegerak daripada Graph API · kanvas workflow seret-lepas ·
log event webhook & ujian beban.
