# respond.io AI Agent — Blueprint Rebuild (A–Z)

> **Kaedah:** analisis tingkah laku produk daripada dokumentasi & blog awam respond.io (clean-room). Bukan decompile / bukan salin kod atau prompt proprietari.
> **Kemas kini 2026-10-19:** akses `respond.io` dah dibuka; 15 halaman help rasmi dibaca penuh (bukan lagi ringkasan carian). Bahagian **1A** di bawah ialah spesifikasi primer dan **mengatasi** angka/andaian [3P] dalam bahagian 1.
> Label: **[DOC]** = disahkan dokumentasi rasmi, **[3P]** = pihak ketiga (belum disahkan), **[REKA]** = reka bentuk cadangan saya untuk rebuild (bukan fakta tentang respond.io).
> Dibaca penuh juga: Advanced Settings, Review, Test, skill Assign/Close/Add comments/Handle Calls, Webhooks, Developer API (via help + SDK/MCP rasmi) — lihat **F2** dan **H**.
> Masih belum dibaca: rujukan API di `developers.respond.io` (skema respons & had kadar per endpoint) — host disekat oleh egress container.

---

## 0. Peta keseluruhan

```
WhatsApp user ──► Meta Cloud API ──webhook──► [1 Channel Gateway]
                                                   │
                                             [2 Inbox/Conversation Core] ◄── Agent manusia (UI)
                                                   │ (event: conversation_opened, message_in, ...)
                                             [3 Workflow Engine]  ◄── triggers
                                              │       │      │
                           Ask a Question / Branch / Wait / Assign To / Send Message / HTTP …
                                              │
                                      Step "Assign To → AI Agent"
                                              │
                                      [4 AI Agent Runtime]
                              instructions + knowledge (RAG) + skills (tools)
                                              │
                          skills: assign, close, update field/lifecycle/tag,
                                  trigger workflow, HTTP request  ──► [3] / CRM
                                              │
                                      reply ──► [1] ──► WhatsApp
```

Tiga blok utama [DOC]: **Workflows** (flow berstruktur), **AI Agents** (perbualan bebas, berpandu prompt), **Skills/Actions** (tangan AI). Sales flow = gabungan ketiga-tiganya.

---

## 1. Apa yang respond.io buat (fakta [DOC])

### 1.1 AI Agent
- Dicipta dari **template** (cth. Receptionist, Sales Agent) atau dari kosong.
- Konfigurasi: **Instructions** (tingkah laku, nada, matlamat), **Knowledge Sources**, **Skills/Actions**.
- Hanya knowledge source yang **dipilih per agent** digunakan untuk jawapan.
- Boleh diuji dalam **simulated conversation** sebelum publish; setiap jawapan tunjuk sumber rujukan.
- Agent **sentiasa guna skill sebelum menjana balasan**.
- Perlukan plan Growth ke atas [DOC] (sahkan harga semasa).
- Ada versi **voice** (Handle Calls) dengan transfer ke manusia & recovery greeting jika terlepas.

### 1.2 Struktur prompt yang disyorkan [DOC]
Templat respond.io (5 header):
1. **Context** – siapa syarikat, produk, audiens
2. **Roles and Communication Style** – persona, nada, bahasa
3. **Top-Level Flow** – langkah utama perbualan
4. **Sub-Level Flow** – cabang (objection, soalan harga, dll.)
5. **Boundaries** – apa yang tak boleh dibuat/dikata

Peraturan penting:
- Guna **nama kanonik** workspace (nama team, nama field, nama action tepat).
- Guna header + langkah berpoin.
- **Arahan trigger skill letak dalam Instructions, bukan dalam Knowledge Source** (campur → tingkah laku tak stabil).
- Fallback: eskalasi ke user tertentu bila niat tak jelas / maklumat tak cukup / input luar jangkaan.
- Komen eskalasi mesti ringkas: isu, apa dah cuba, kenapa eskalasi.
- Had aksara [3P, sahkan]: instructions ≤ 10,000; prompt per action ≤ 1,000.

### 1.3 Skills / Actions [DOC]
| Skill | Fungsi |
|---|---|
| Assign to user/team | handover ke manusia + nota |
| Close conversation | tutup perbualan |
| Update contact field | simpan data lead (budget, lokasi, …) |
| Update lifecycle stage | contoh: New → Qualified/Unqualified |
| Update tags | label contact |
| Trigger workflow | panggil workflow *published* dengan nama (`!NamaWorkflow`) |
| Make HTTP requests | panggil API luar (maks **10** per agent); AI tafsir JSON respons, tiada manual field mapping |
| Handle calls | voice |

Nasihat rasmi: **2–3 skill sahaja per langkah**, arahan jelas bila guna lifecycle (kalau kabur agent keliru). Skill seperti update field/lifecycle/close/assign boleh jadi **trigger workflow** — ini corak "AI buat keputusan → workflow buat kerja".

### 1.4 Knowledge Sources [DOC]
- Fail: pdf, txt, md, csv, docx, pptx, ppsx, imej; maks **100 fail** per workspace.
- Web crawl: kedalaman default **3**, boleh sampai **100**.
- Tip: tulis sebagai **prosa**, bukan jadual (AI baca naratif lebih tepat).

### 1.5 Workflow Engine [DOC]
- **Trigger** contoh: Conversation Opened, Lifecycle Updated, balasan broadcast, skill AI. (senarai penuh ada di *Workflow Triggers* – tak dapat dibaca)
- **Step**: Send a Message, **Ask a Question** (teks/nombor/pilihan; cawangan Success / Failure: Invalid / Timeout, default timeout 7 hari), **Branch** (syarat), **Wait**, **Assign To** (user/team/AI Agent/unassign; timeout 7 hari), HTTP, dsb.
- **Corak hibrid kunci** [DOC]: Conversation Opened → Ask a Question (menu Multiple Choice) → cawangan **Failure: Invalid** → Assign To **AI Agent** (teks bebas jatuh ke AI).
- AI Objective (step lama) = legacy, diganti AI Agent.

### 1.6 Developer API & Channel [DOC/3P]
- REST JSON, base `api.respond.io/v2`, bearer token. Contact create/update/merge/delete, Message API, space/channel list, template message.
- Webhook ke endpoint anda; balas **200 dalam ≤5s** [3P]. Event: message in/out, contact baru/kemas kini [3P].
- Custom Channel: respond.io terima Messages, Echoes, Receipts melalui webhook URL (sudah pindah ke `webhook.respond.io`; tarikh akhir 5 Ogos 2026 telah lepas).

### 1.7 Had diketahui
Ada halaman rasmi *AI Agents: Known Limitations and Workarounds* – belum dapat dibaca; baca sendiri sebelum bina.

---

## 1A. Spesifikasi disahkan (halaman rasmi dibaca penuh) [DOC]

### A. Konfigurasi AI Agent
- Medan: **emoji** (tiada upload avatar), **nama**, **description**, **Instructions**, **Knowledge sources**, **AI skills**.
- Status: mula **Inactive**; **Save** (simpan) vs **Publish**. Selepas publish, Save terus ubah versi live — **tiada draf** (jangan tiru ini; rebuild patut ada draf/versi).
- Template: **Receptionist** (greet → capture → route → close), **Sales Agent** (recommend, escalate, update lifecycle/field, close), **Support Agent** (jawab dari knowledge, eskalasi, close). Template Receptionist & Support hanya 2 skill pra-aktif; Sales 4.
- **Review**: semakan statik instructions + skills (rujukan tak sah, skill tak dikonfigur, arahan tak disokong/bercanggah) + **Apply fixes**. Auto-flag semasa save/publish.
- **Test AI Agent**: panel chat simulator, boleh reset, ubah contact field ujian, upload PDF/imej; tunjuk event tindakan; balasan tunjuk label "{#} sources". Tiada kesan ke pelanggan sebenar.
- **Optimize** (prompt optimizer) untuk instructions & skill prompt.
- Cara aktif: assign manual (dropdown Assignee), **default assignee**, atau step **Assign To** dalam workflow.
- **Takeover**: butang untuk manusia ambil alih serta-merta → AI berhenti balas sehingga di-assign semula ke AI. Tersembunyi jika ada sekatan (baki WABA tak cukup, contact disekat, tiada channel).
- Latensi: pemprosesan **10–15s**, kadang >20s (carian knowledge + LLM + beban provider). Ada tetapan **wait time** (tunggu contact habis menaip sebelum balas).
- Data **tidak digunakan untuk train model**.
- Plan: AI Agents = Growth+; HTTP skill = Advanced/Enterprise.

### B. Instructions (prompt)
- **Had 10,000 aksara** (disahkan). Arahan tingkah laku **mesti** dalam Instructions — Knowledge Source hanya untuk fakta (arahan dalam knowledge = tak stabil). Alat luar tak boleh tambah arahan.
- Elemen: **Context**, **Role & communication style**, **Flow** (Top-level + Scenarios/Sub-level), **Boundaries**, **Follow-up**.
- Pembolehubah dalam prompt: `@Nama` (team/user/AI agent lain), `$contact.field` (cth `$contact.firstname`, `$contact.lifecycle`). AI **hanya nampak nilai**, bukan label → rujuk "Email field" untuk *update*, jangan guna `$contact.email` sebagai sasaran kemas kini.
- Assign boleh nyatakan strategi: **round robin** / **least open conversations**; "anyone in the Workspace".
- Nama mesti **sepadan tepat** (stage, field, closing note, team, user) — jika tak, kemas kini **gagal**.
- Dua tempat arahan: kotak Instructions (skrip berurutan) dan tetapan skill (peraturan bila-bila-masa). Disyorkan tulis kedua-duanya; skill mesti **dihidupkan** walau disebut dalam instructions.
- **Follow-up**: dalam prompt, "jika tiada balasan selepas X" — setiap follow-up ≤ **24j** dari mesej sebelumnya, maks **5** per prompt; berhenti bila contact balas / unassigned / closed / AI nilai contact tak berminat atau objektif tercapai; tak boleh pilih antara dua urutan; luar tetingkap WhatsApp 24j mesej gagal tapi skill tetap jalan.
- **Konteks auto-prepend**: nama channel + channel ID; **Ads Context** (Meta/TikTok: platform, campaign, ad group, ad name) jika entri iklan dalam 20 mesej terakhir; **Assignment Event** (bila AI di-assign oleh manusia/workflow/AI lain); **Conversation Reopened Event**. Hanya **event terkini** dan hanya dalam tetingkap konteks.

### C. Had platform (peta terus kepada spesifikasi runtime)
| Perkara | Nilai |
|---|---|
| Tetingkap konteks | **20 mesej terkini**; tak nampak internal comment; tak nampak mesej yang di-*reply-to* |
| Temperature | tiada kawalan (kawal melalui prompt) |
| Silent mode | prompt "NO-REPLY POLICY" di atas sekali → balasan kosong, skill masih jalan; composer manusia dilumpuhkan bila AI assigned |
| Assign via API/n8n/Make | **tak** picu balasan AI (elak bulk-reply); AI balas bila contact hantar mesej |
| Unassign | AI biasanya hantar 1 balasan terakhir; jika AI unassign sendiri → sentiasa balas; workaround: arahan "kosongkan response" + workflow Send Message → Unassign |
| Attachment keluar | pdf/docx/pptx/jpg/jpeg/png; maks **5 per balasan**; URL mesti wujud dalam knowledge/instructions/respons API; perlu klausa "ATTACHMENT AUTHORIZATION"; tiada URL berlogin; video/voice/sticker tak disokong |
| Mesej masuk dibaca | teks; imej+PDF (hingga 5 fail terkini); audio (transkrip); lokasi; contact card; kad/quick reply/template WA/katalog/order/list reply; video/file/sticker = nama fail sahaja; reaksi, komen→DM, story mention, custom payload = `[Unsupported message]` |
| Skill sebelum balas | skill dilaksana **sebelum** teks balasan dijana |
| Status AI dalam workflow | sentiasa "Offline" (AI tetap balas 24/7) |
| Konflik | assign lalu unassign dalam satu giliran → mesej gagal; jangan duplikasi logik workflow & skill |

### D. Skills (9)
Close conversations (ringkasan auto; boleh matikan; closing note), Assign to agent/team (user, team, AI lain; round robin/least open), Update Lifecycle stage, Update Contact fields, Update tags, **Trigger Workflow**, **Add comments** (internal), Handle Calls, **Make HTTP requests**.
- **Trigger Workflow**: rujuk dengan `!nama_workflow`; workflow mesti *published*; nama sama tepat (case-sensitive); **tiada data dihantar** AI→workflow dan **tiada hasil balik** ke AI (fire-and-forget); duplikasi logik → mesej/kemas kini berganda.
- Skill (update field, close, assign, lifecycle) boleh jadi **trigger workflow** (Lifecycle Updated, Contact Field Updated, dll.).
- **Make HTTP requests**: maks **10 action/agent**; setiap action: nama, "bila & bagaimana", **input** (nama ≤30 aksara `a-z0-9_`, format Text/Number/Boolean/Date, deskripsi, array), kaedah, URL, query, header, JSON body. Pembolehubah `$agent.nama` & `$contact.field`. Had per action: **20 input, 50 param, 50 header**. AI tunggu respons & tafsir JSON (tiada pemetaan manual). Jika input tiada → AI tanya contact dulu. 2xx = berjaya. **Tiada OAuth 2.0** (hanya API key/token statik). Bug diketahui: field dikemas kini & digunakan dalam giliran sama → hantar nilai lama. Event pelaksanaan hanya dalam panel Test.

### E. Knowledge
- Fail: pdf, txt, md, csv, docx, pptx, ppsx; imej jpeg/png/bmp/webp/tiff. Web: URL awam sahaja (tiada Google Sheets → export CSV).
- Had: **100 fail/workspace**, **20MB** jumlah storan workspace, **20MB/fail** (trial 1MB), upload 5 serentak, **3 sumber** diproses selari, **50 tambah/edit per hari**.
- Crawler: depth default **3** (maks 100), tambah sitemap (default hidup), hingga **5 URL tambahan**, **include/exclude URL globs** (`*` satu segmen, `**` semua tahap), resync manual/berjadual, **View Logs** (URL dikunjungi, saiz kandungan), timeout ≤1 jam → *Partially Completed*.
- Status: Completed / In Progress / Error / Partially Completed (+Resync failed).
- Diindeks automatik (beberapa minit). Hanya sumber yang **dipilih per agent** digunakan; UI papar 4 dahulu.
- **Had carian**: AI tak boleh pilih/prioritikan dokumen dan **tak cari ikut tajuk dokumen** — hanya kata kunci dalam kandungan → instructions patut sebut kata kunci carian.

### F. Workflow (disahkan)
- **11 trigger**: Conversation Opened, Conversation Closed, Contact Tag Updated, Contact Field Updated, Shortcut (Inbox), **Incoming Webhook** (HTTP POST), Click-to-Chat Ads, Manual Trigger, TikTok Messaging Ads, Lifecycle Updated, Call Ended. **Satu trigger per workflow; tiada trigger berjadual/masa.**
- **17 step**: AI Objective (legacy), Send a Message, Ask a Question, Assign To, Branch, Update Contact Tag, Update Contact Field, Open Conversation, Close Conversation, Add Comment, Jump To, Wait, Trigger Another Workflow, Date & Time, HTTP Request, Add Google Sheets Row, Send Conversions API Event (Meta), Send TikTok Lower Funnel Event.
- Had: **100 step/workflow**, **150 workflow/workspace**. Status Draft / Published / Stopped; edit hanya bila Stopped; **stop → semua contact dikeluarkan dan tak didaftar semula**; ada **Test** (kod ujian, nilai trigger dummy), clone, Exit Conditions (mesej keluar/masuk/assign manual menghentikan workflow untuk contact tu).
- **Ask a Question**: jenis Text, Multiple Choice (≤**10** pilihan, ≤**20 aksara**), Number (min/max), Date (pelbagai format), Phone, Email, URL, Rating 1–5, Location. Simpan jawapan ke **Contact Field / Variable / Tag** (tag untuk MC sahaja). Timeout ≤7 hari (default 7); cawangan **Failure** untuk jawapan tak sah/tak sepadan. Hantar di **Last Interacted Channel**. Gagal jika tiada channel / timeout / mesej gagal (tetingkap tutup, API key tamat) → contact keluar workflow. Jika conversation ditutup semasa menunggu, balasan tak buka semula.
- **Assign To**: user/AI agent tertentu, user dalam team, user dalam workspace, unassign; logik round robin / least open; "online sahaja"; "kurang dari N open"; barisan menunggu hingga timeout (default 7 hari); gagal jika user dipadam/team kosong.
- Pola kunci: Ask a Question (MC) → Failure → Assign To AI Agent; Jump To untuk ulang soalan; Wait untuk follow-up berstruktur.

### F2. Baki halaman AI Agent (dibaca penuh) [DOC]
- **Advanced settings → Wait time** (per agent): 1s–300s (default **1s**); setiap mesej baru contact **reset timer**; hanya untuk mesej dari contact (bukan follow-up/skill/sistem); chat sahaja. Balasan = wait time + processing (10–15s, tak boleh dikonfigur). Advanced settings disimpan berasingan dari Configuration.
- **Review** (auto semasa Save/Publish): semak rujukan token **`$Field`**, **`!Workflow`**, **`@User/@Team`**, **`%Tag`** wujud; skill dirujuk tapi tak aktif / tiada arahan / destinasi tak sah (Add comment mention Team/AI = salah); arahan bercanggah; arahan tak disokong (baca tag sedia ada, baca internal comment, cari ikut tajuk dokumen, hantar video/voice/sticker); had follow-up (>5, >24j, bercabang) & rujuk >20 mesej; kejelasan (tiada matlamat/tiada exit condition). Cadangan pembetulan + **Apply fixes**; **Ignore** hanya untuk sesi semasa. Tidak baca kandungan knowledge, tidak semak workflow *published*.
- **Test**: simulator chat, **Reset Chat**, edit contact ujian, upload fail (20MB, 5 terkini diproses), rakam audio, ikon telefon (simulasi panggilan), wait time disimulasi. Paparan: label "{#} sources" → klik untuk nama + snippet digunakan; log skill & event ("Tag X added by …", "Workflow X Started", "executed {Action}", request cURL + response). **Tidak** laksana workflow sebenar; **follow-up tak boleh diuji**; assign dalam ujian = orang pertama dalam round robin/least open.
- **Assign to agent or team**: round robin (default, **dalam satu team sahaja**, bukan antara team) atau least open — mesti dinyatakan; "online sahaja" + fallback ("jika @user tak online → sesiapa online di @TeamA"); boleh assign ke AI lain atau "Unassign"; **tak boleh jadual masa depan**; arahan "Do not respond to the Contact when assigning…" supaya AI senyap; mesej handoff → guna workflow (trigger Assigned → Send Message).
- **Close conversations**: ringkasan & closing note auto (boleh dimatikan); hanya pilih closing note **sedia ada**; ringkasan **20 mesej terakhir**; AI tak boleh buka semula conversation.
- **Add comments**: nota dalaman ≤ **2,000 aksara**; boleh @mention **user sahaja** (bukan team/AI); dikesan dalam Reports sebagai komen AI.
- **Handle Calls (voice)**: Advanced+ untuk publish; WhatsApp, Messenger, Telnyx VoIP; **ElevenLabs Flash v2.5, 32 bahasa**, auto-detect bahasa pemanggil; 11 suara dipilih (cth. Afifah = wanita aksen Malaysia); greeting tersuai + persetujuan rakaman; transfer ke manusia (perlu nyatakan bila & kepada siapa; jika agen ada Contact restriction guna skill Assign); transfer terlepas → panggilan **kembali ke AI tanpa konteks**; struktur arahan panggilan: `# CALL CONTEXT`, `# AGENT ROLE`, …; respons HTTP **tidak** dipulangkan ke voice agent.

### H. Developer API, Webhook & Custom Channel [DOC + SDK rasmi]
Sumber: halaman help **Webhooks/Developer API/Custom Channel** + repo rasmi `respond-io/typescript-sdk` & `respond-io/mcp-server` (kod sebenar klien). Halaman rujukan `developers.respond.io` **disekat** oleh egress container → skema respons penuh & nombor rate-limit per endpoint **belum dibaca**.
- **Base URL** `https://api.respond.io/v2`, `Authorization: Bearer <token>` (token: Settings → Integrations → Developer API → Add Access Token; **Growth+**). Rate-limit melalui header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` (SDK retry ikut `Retry-After`). Paginasi: `limit`, `cursorId`; respons ada `next`/`previous`.
- **Pengecam contact**: `id:123` | `email:a@b.com` | `phone:+60…`.
- **Endpoint (dari SDK)**:
  - Contact: `GET/POST/PUT/DELETE /contact/{id}`, `POST /contact/create_or_update/{id}`, `POST /contact/merge`, `POST /contact/list` (filter `contactField|contactTag|lifecycle` + carian), `POST|DELETE /contact/{id}/tag`, `GET /contact/{id}/channels`, `POST /contact/{id}/lifecycle/update`
  - Messaging: `POST /contact/{id}/message`, `GET /contact/{id}/message/{messageId}`, `GET /contact/{id}/message/list`
  - Conversation: `POST /contact/{id}/conversation/assignee` (`assignee`: user id/email atau `null` = unassign), `POST /contact/{id}/conversation/status` (`status: open|close`, `category`=closing note, `summary`)
  - Comment: `POST /contact/{id}/comment` (boleh mention user)
  - Space: `GET /space/user[/{id}]`, `GET|POST /space/custom_field[/{id}]`, `GET /space/closing_notes`, `GET /space/channel`, `GET /space/channel/{channelId}/template`, `POST|PUT|DELETE /space/tag`
  - (README rasmi juga menyebut Workflows boleh dicetus melalui API — endpoint tepat belum disahkan.)
- **Jenis mesej keluar**: `text` (+`messageTag` Messenger), `attachment` (image|video|audio|file + url), `quick_reply` (title + replies[]), `custom_payload`, `email` (subject/cc/bcc/attachments), `whatsapp_template` (`name`, `languageCode`, `components` header/body/footer/buttons dengan parameter text/image/video/document/location; butang quick_reply/phone_number/url/catalog/mpm). Status mesej: `pending → sent → delivered → read | failed`. Arah: `incoming|outgoing`. Tanpa `channelId` → guna *last interacted channel*.
- **Webhook keluar** (Settings → Integrations → Webhooks; **Advanced+**): event **Conversation Closed/Opened, New Contact, New Outgoing/Incoming Message, Contact Updated, Contact Assignee Updated, Contact Tag Updated, New Comment, Call Ended** (rekod/transkrip/ringkasan jika dihidupkan). Mesti balas **200 dalam 5s**; >**30 ralat/30 min** (kuota dikongsi semua webhook) → auto-disable + emel; **retry 30s, 60s, 90s hingga 3 min** kemudian event digugurkan; event diproses **berurutan per endpoint**.
- **Custom Channel** (bina saluran sendiri, cth. WhatsApp tak rasmi): respond.io beri `Channel ID`, `API Token`, `Webhook URL` (`https://webhook.respond.io/custom/channel/webhook/`; lama `app.respond.io` tamat 5 Ogos 2026). ID contact: nombor telefon (E.164) atau custom ID (≤50 aksara, `A-Za-z0-9_=+/@`). Anda `POST` ke webhook mereka dengan `events[]` jenis **message / echo / receipt** (`mId`, `timestamp` ms, `message{type,text}`) + `contact{firstName,lastName,profilePic,countryCode,email,phone,language}`; mesej keluar mereka dihantar ke URL **anda**. Ini corak yang patut ditiru untuk lapisan Channel Gateway.
- **Webhook event (nilai sebenar dari node n8n rasmi)**: `newIncomingMessage`, `newOutgoingMessage`, `conversationOpened`, `conversationClosed`, `newContact`, `contactUpdated`, `contactAssigneeUpdated`, `contactTagUpdated`, `lifecycleUpdated`, `newComment`, `callEnded`. Boleh tapis ikut **sumber** (`source`): conversationClosed = user, workflow, api, zapier, bot, make, n8n, **ai_agent**, auto_close; conversationOpened = user, contact, workflow, api, zapier, make, ctc_ads, growth_widget; newOutgoingMessage = user, workflow, api, zapier, bot, echo, make, n8n, **ai_agent**. Filter jenis mesej juga disokong. Reka bentuk ini patut ditiru: setiap event membawa **asal tindakan** (manusia/workflow/AI/API) supaya elak gelung.
- **Status dokumen API**: `developers.respond.io` ialah Stoplight (projek `api`, "API v2 Documentation"); halaman dirender di pelayar dengan data dari `stoplight.io` yang **masih disekat** → skema JSON respons/payload webhook & had kadar per endpoint belum boleh dibaca. Senarai endpoint/jenis dalam bahagian ini diambil dari kod SDK/MCP/n8n rasmi (lebih dipercayai daripada blog).
- **MCP server rasmi** (`respond-io/mcp-server`, stdio/HTTP `/mcp`, `/health`): 25 tool — contact (get/create/update/delete/list/upsert/merge/tags/channels/lifecycle), `send_message/get_message/list_messages`, `assign_conversation`, `update_conversation_status`, `create_comment`, workspace (users, custom fields, channels, closing notes, templates, tags).

### G. Implikasi terus kepada rebuild
1. Konteks AI = **20 mesej** + blok auto (channel, ads, events) + nilai contact → simpan fakta penting di **contact field/lifecycle**, bukan sejarah.
2. Skill = **tool** yang dilaksana sebelum balasan; nama parameter mesti padan tepat (validasi + ralat jelas).
3. Workflow ↔ AI **longgar** (Trigger Workflow tanpa data). Dalam rebuild boleh lebih baik: benarkan hantar argumen dan terima hasil.
4. Pisahkan **Instructions** (tingkah laku) dan **Knowledge** (fakta); amaran UI jika arahan dikesan dalam knowledge.
5. Bina **Review** (linter prompt), **Test** (simulator + trace), **Takeover**, **versi draf/publish** sejak awal.
6. Follow-up = penjadual per conversation (≤24j, ≤5), dibatalkan bila contact balas.
7. Elak "bulk reply" bila assign via API (ikut rekaan respond.io) atau jadikan pilihan.

---

## 2. Reka bentuk rebuild [REKA]

### 2.1 Stack cadangan (mudah, boleh hidup solo)
| Lapisan | Pilihan |
|---|---|
| API/Webhook | Node.js + Fastify (TypeScript) |
| DB | PostgreSQL + `pgvector` |
| Queue | BullMQ (Redis) |
| LLM | Claude API (tool use) — model terkini, lihat skill `claude-api` |
| UI inbox | Next.js |
| WhatsApp | Meta WhatsApp Cloud API (rasmi) |
| Hosting | Fly.io / Railway / VPS |

### 2.2 Model data
```
workspace(id, name, plan)
channel(id, workspace_id, type='whatsapp', waba_id, phone_number_id, token_enc, verify_token)
contact(id, workspace_id, wa_id, name, lifecycle_stage, tags[], custom_fields jsonb, assignee_id, ai_agent_id null)
conversation(id, contact_id, channel_id, status[open|closed], opened_at, last_inbound_at, handler[ai|human|workflow])
message(id, conversation_id, direction, type, body jsonb, wa_message_id, status, created_at)
ai_agent(id, workspace_id, emoji, name, description, instructions text(<=10000), model, knowledge_ids[], wait_seconds, status[inactive|active], live_version_id)
ai_agent_version(id, agent_id, instructions, skills jsonb, created_by, created_at)   -- draf/publish (lebih baik drpd respond.io)
followup_job(id, conversation_id, agent_id, run_at, step jsonb, cancelled bool)         -- maks 5, <=24j, batal bila contact balas
conversation_event(id, conversation_id, type[assigned|reopened|ad_entry], payload, created_at)  -- disuntik ke konteks AI
ai_skill(id, agent_id, type, name, config jsonb, prompt text)   -- type: assign|close|set_field|set_lifecycle|tag|trigger_workflow|http
knowledge_source(id, workspace_id, type[file|url], uri, status)
knowledge_chunk(id, source_id, text, embedding vector(1024), meta jsonb)
workflow(id, workspace_id, name, published, trigger jsonb, graph jsonb)
workflow_run(id, workflow_id, contact_id, current_step, state jsonb, waiting_until, status)
agent_run(id, conversation_id, agent_id, input, tool_calls jsonb, output, tokens, latency_ms)   -- audit/debug
```

### 2.3 Pipeline mesej masuk
1. `POST /webhook/whatsapp` → sahkan `X-Hub-Signature-256` → simpan `message` (idempotent ikut `wa_message_id`) → balas 200 segera → enqueue.
2. Worker: upsert contact/conversation → keluarkan event `message_in` / `conversation_opened`.
3. **Router** [REKA]: jika conversation `handler=ai` → AI Runtime; jika `workflow` → sambung `workflow_run` yang menunggu (Ask a Question); jika `human` → hanya push ke inbox UI.
4. Hantar balasan ikut peraturan Meta: **tetingkap 24 jam** (teks bebas) selepas mesej terakhir pelanggan; di luar itu mesti **template message** diluluskan.

### 2.4 AI Agent Runtime (teras)
```
buildContext():
  system = agent.instructions
           + "Nama team sah: …; Field sah: …; Lifecycle sah: …"      // nama kanonik
           + ringkasan contact (field, lifecycle, tags)
  history = 20 mesej terakhir sahaja (seperti respond.io); abaikan internal comment
  + blok auto: channel name/ID, Ads Context, event terkini (assigned/reopened)
  + debounce wait_seconds sebelum jana balasan (tunggu contact habis menaip)
  tools   = skills → tool definitions (nama, deskripsi=prompt skill, JSON schema parameter)
  + tool khas: search_knowledge(query)   // RAG

loop (maks 6 iterasi):
  resp = LLM(system, history, tools)
  jika tool_use: validate args → execute skill → hasil kembali ke LLM
  jika teks: hantar ke WhatsApp (pecah mesej panjang, tunjuk "typing")
log agent_run
```
Pelaksanaan skill:
- `assign` → set `assignee`/team, `handler=human`, simpan **nota handover** (ringkasan isu / dah cuba / sebab).
- `close` → status closed.
- `set_field` / `set_lifecycle` / `tag` → kemas kini + **emit event** (supaya workflow boleh trigger).
- `trigger_workflow` → cipta `workflow_run` (hanya yang published).
- `http` → panggil URL dikonfigur (allowlist domain, timeout 10s, saiz respons dihad), hasil JSON diberi terus ke LLM. Maks 10 per agent.
- Peraturan: skill dipanggil **sebelum** balasan akhir; hadkan 2–3 skill aktif per konteks.

### 2.5 RAG (Knowledge)
1. Ingest: fail → ekstrak teks (pdf/docx/…); URL → crawler (depth default 3, hormat robots.txt, domain sama).
2. Chunk ~500–800 token, overlap 80, simpan `meta` (sumber, tajuk).
3. Embed → `pgvector`; carian hybrid (vector + BM25/`tsvector`), ambil top-5, hanya daripada sumber yang dipilih agent.
4. Jawapan wajib berpandukan petikan; jika tiada padanan → ikut Boundaries (jangan reka; eskalasi).
5. Uji: mod simulator tunjuk chunk/sumber yang digunakan.

### 2.6 Workflow Engine
- Graph JSON: `nodes[{id,type,config}]`, `edges[{from,to,port}]` (port: `success|invalid|timeout|branchN`).
- Interpreter berasaskan state (`workflow_run`): step segerak jalan terus; step menunggu (Ask a Question, Wait, Assign To) simpan `waiting_until` dan sambung bila event/timeout (cron + BullMQ delayed job).
- Node minimum (MVP): `send_message`, `ask_question` (text|number|choice, validate, timeout), `branch`, `wait`, `assign_to` (user|team|ai_agent), `update_field`, `http_request`, `end`.
- Trigger MVP: `conversation_opened`, `lifecycle_updated`, `field_updated`, `tag_added`, `ai_skill_called`, `manual`.
- Guardrail: had langkah per run, anti-loop, satu run aktif per contact per workflow.

### 2.7 "Sistem yang benarkan user beri input" (builder & konfigurasi)
| Input pengguna | UI | Disimpan di |
|---|---|---|
| Instructions agent | editor 5 seksyen (Context/Role/Top flow/Sub flow/Boundaries) + kiraan aksara + pemeriksa nama kanonik | `ai_agent.instructions` |
| Knowledge | upload fail / masuk URL + depth | `knowledge_source` |
| Skills | senarai toggle + borang prompt & parameter per skill | `ai_skill` |
| Handover | pilih team/user fallback | `ai_agent.handover_team_id` |
| Workflow | kanvas drag-drop nod (React Flow) | `workflow.graph` |
| Menu/pilihan | konfigurasi Ask a Question | node config |
| Ujian | chat simulator dengan trace tool call & sumber | `agent_run` |
| Publish | draft vs published (versi) | `published` |

### 2.8 Sales flow rujukan (boleh terus guna)
**Workflow "Sales Intake"**
1. Trigger: Conversation Opened
2. Ask a Question (menu): 1) Tengok produk 2) Harga 3) Cakap dengan orang
3. Cabang `3` → Assign To team Sales. Cabang `1/2` → Assign To AI Agent "Sales Agent". **Failure: Invalid** → Assign To AI Agent (teks bebas).
4. Timeout 24j tanpa balas → Send template follow-up.

**Prompt AI Agent "Sales Agent"** (kerangka)
```
# Context
Kami <syarikat>, jual <produk>. Audiens: <siapa>.
# Roles and Communication Style
Pembantu jualan mesra, BM santai, ringkas (maks 3 ayat/mesej), 1 soalan sekali.
# Top-Level Flow
1. Sapa & fahamkan keperluan.
2. Tanya HANYA: bajet, lokasi.
3. Jika bajet ≥ <X> dan lokasi dalam <kawasan> → set_lifecycle "Qualified", assign ke team "Sales", nota ringkas.
4. Jika tidak → set_lifecycle "Unqualified", terangkan pilihan lain, close.
# Sub-Level Flow
- Soalan harga → search_knowledge; jika tiada → eskalasi.
- Bantahan "mahal" → nyatakan nilai, tawar demo.
- Minta orang sebenar → assign ke team "Sales".
# Boundaries
Jangan reka harga/diskaun. Jangan janji tarikh penghantaran. Isu aduan → assign "Support".
```

### 2.9 Keselamatan & pematuhan
- Simpan token WABA terenkripsi; sahkan signature webhook; RBAC per workspace.
- **Prompt injection**: data pelanggan & knowledge = data, bukan arahan; skill HTTP hanya ke allowlist; validasi semua argumen tool.
- Had kadar & kos (token budget per conversation, circuit breaker).
- WhatsApp: opt-in, template diluluskan, polisi Meta Business.
- PDPA (Malaysia): consent, retention, hak padam data.

### 2.10 Pemerhatian & kualiti
- Log `agent_run` (tool calls, token, latency), papan pemuka: kadar handover, kadar kelayakan lead, masa balas.
- Set ujian regresi: 30–50 perbualan emas dijalankan setiap kali prompt berubah.

---

## 3. Pelan bina (mudah, langkah kecil) + penjejak kemajuan

| # | Milestone | Hasil boleh dilihat | Anggaran | Status |
|---|---|---|---|---|
| 1 | Webhook WhatsApp + simpan mesej + balas "echo" | Mesej masuk muncul, bot balas | 1–2 hari | ☐ |
| 2 | Inbox UI mudah + handover manual | Boleh balas sebagai manusia | 2–3 hari | ☐ |
| 3 | AI Agent asas (instructions sahaja) | Bot balas ikut persona | 1–2 hari | ☐ |
| 4 | Skills: assign, close, set_field, set_lifecycle | Lead dikelaskan automatik | 2–3 hari | ☐ |
| 5 | Knowledge + RAG | Jawab daripada dokumen + tunjuk sumber | 3–4 hari | ☐ |
| 6 | Workflow engine MVP (ask/branch/wait/assign) | Menu + cabang AI fallback | 4–6 hari | ☐ |
| 7 | Builder UI (prompt editor, workflow canvas, simulator) | Pengguna bukan-coder boleh konfigurasi | 5–8 hari | ☐ |
| 8 | HTTP skill, template & 24h window, metrik | Siap produksi | 3–4 hari | ☐ |

Raikan setiap tanda ✔ (log kemajuan dalam file ini).

## 4. Semakan 4 Hukum
1. **Jelas** – Satu rajah, jadual milestone dengan status nampak, nama kanonik dalam prompt.
2. **Menarik** – Hasil visual awal (echo bot → AI bot di WhatsApp sendiri) sebelum bina builder.
3. **Mudah** – 8 langkah kecil; MVP workflow hanya 8 nod; mula guna Cloud API rasmi, bukan reverse protokol.
4. **Memuaskan** – Simulator dengan trace sumber/tool, penjejak milestone, metrik lead qualified.

## 5. Sumber (awam)
- Getting Started with AI Agents — https://respond.io/help/ai-agents/getting-started-with-ai-agents
- How to Write Effective AI Agent Prompts — https://respond.io/help/ai-agents/how-to-write-effective-ai-agent-prompts
- Managing AI Knowledge Sources — https://respond.io/help/ai-agents/managing-ai-knowledge-sources
- Using AI Skills — https://respond.io/help/ai-skills/using-ai-skills
- AI Skill: Make HTTP requests — https://respond.io/help/ai-skills/ai-skill-make-http-requests
- AI Skill: Trigger Workflow — https://respond.io/help/ai-skills/ai-skill-trigger-workflow
- Workflow Steps Overview — https://respond.io/help/workflows/workflow-steps
- Step: Ask a Question — https://respond.io/help/workflows/step-ask-a-question
- Step: Assign To — https://respond.io/help/workflows/step-assign-to
- Workflow Triggers — https://respond.io/help/workflows/workflow-triggers
- How to Use AI Agent with Workflow Menu Options — https://respond.io/help/ai-agent-guides/how-to-use-ai-agent-with-workflow-menu-options
- AI Agents: Known Limitations — https://respond.io/help/ai-agents/ai-agents-known-limitations-and-workarounds
- Developer API — https://docs.respond.io/
