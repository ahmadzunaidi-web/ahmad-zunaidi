# Kerja Sendiri — eksport source untuk redesign UI

Eksport baca/salin sahaja pada 1 November 2026. Tiada deploy, perubahan Worker, assets, DNS atau Supabase dilakukan semasa eksport ini.

Production: https://kerjasendiri.my  
Worker: `kerjasendiri`  
Versi aktif: `3e6d5fad-0a07-4394-8fec-7c23076c91f9`  
SHA-256 Worker: `c3b594b1f8b85c1444ff5b8f36c523b01e8034ec8d23fa056ff691d0a8ff336e`

## Buka fail yang betul

- `worker/worker.mjs`: kod production penuh dan tepat, termasuk semua string asal. Fail ini ialah baseline; jangan edit untuk redesign.
- `worker/ui/`: string besar telah dipecahkan dan base64/gzip telah didekod menjadi HTML/CSS/JS yang boleh dibaca. Semua literal string sekurang-kurangnya 250 aksara dalam Worker telah diekstrak. Fragmen yang lebih kecil kekal penuh dalam baseline.
- `worker/ui-map.json`: kedudukan literal, nombor baris, rujukan, encoding, saiz dan hash setiap fail pecahan.
- `worker/worker.generated.mjs`: hasil `node build-worker.mjs`; tanpa suntingan, byte-for-byte sama dengan baseline production.
- `public/`: 39 fail static/build configuration, termasuk semua asset yang ditemui dalam inventori repo dan semua rujukan static UI.
- `worker/served/`: 6 respons JS/CSS live untuk perbandingan; bukan fail yang perlu diedit atau diupload ke public.
- `wrangler.toml`: konfigurasi berkesan production yang dibina semula daripada Cloudflare API GET. Bukan fail TOML asal yang dimuat turun. Ia memetakan routes, ASSETS, compatibility, observability dan sasaran staging/preview.
- `metadata/`: provenance, pemeriksaan assets, snapshot versi dan skop yang tidak dapat dibuktikan.
- `SHA256SUMS.txt`: hash semua fail lain dalam pakej.

## Kelengkapan dan batas eksport

Kod Worker disahkan tepat terhadap SHA-256 yang dikira daripada kod production yang dibaca semula melalui Cloudflare. Tiada pemotongan, pemendekan atau pembinaan semula logik Worker.

API baca Cloudflare yang tersedia tidak memberikan inventori/muat turun pukal objek Workers Assets. Senarai fail diambil daripada keseluruhan `public/` dalam repo `ahmadzunaidi-web/kerjasendiri-infra`, commit `1f02bca96da8d8cb23e9fedb77b9d5a24481f978`, kemudian setiap laluan dibaca di production. Semua rujukan asset setempat dalam source yang dieksport sudah dipadankan; tiada rujukan JS/CSS/ikon/font/manifest setempat yang tertinggal.

`public/index.html` ialah byte HTML asal ASSETS, diperoleh melalui SPA fallback GET, bukan output landing `/` yang baharu. Apabila diproses oleh Worker eksport ini, output `/masuk` sepadan tepat dengan respons live. Repo mempunyai HTML yang sudah ditambah injection; versi repo itu sengaja tidak menggantikan HTML asal production.

`public/rc4.js` dipulihkan daripada repo. Diproses melalui pipeline Worker, outputnya sepadan tepat dengan `/rc4.js` live. Ini mengesahkan pembinaan semula tingkah laku frontend.

Lima fail asal ASSETS yang ditindih Worker—`dashboard-unified-theme.css`, `infra-chat-v12.js`, `infra-nav-v113.js`, `infrastructure.js`, `infrastructure.css`—dipulihkan daripada repo; byte asas ASSETS yang tersembunyi di belakang override tidak dapat disahkan secara langsung. Versi yang benar-benar digunakan production tersedia penuh dalam `worker/ui/`, Worker asal, dan `worker/served/`. Jangan keliru antara salinan repo dan override live.

`public/_headers` dipulihkan daripada repo dan sepadan dengan `raw_headers` pada versi production. Fail ujian repo `repair-fixture.mjs` tiada di production (laluan memulangkan SPA fallback), maka tidak dimasukkan sebagai asset production.

Inventori Cloudflare yang autoritatif tidak tersedia, jadi kewujudan fail orphan/tidak dirujuk yang tiada dalam repo tidak dapat dinafikan. Pakej ini tidak mendakwa mempunyai objek sedemikian. Backend Supabase (source Edge Functions, SQL/database, rekod pelanggan, Storage dinamik) tidak disalin: ia ialah dependency backend dan di luar source website Worker/ASSETS. Imej Unsplash/URL luar kekal sebagai URL rujukan; ia bukan objek ASSETS dan tidak dimuat turun.

Konfigurasi staging/preview dalam TOML ialah sasaran untuk pakej production ini, bukan eksport source atau tetapan tepat dua Worker berasingan itu. Fail authoring production TOML asal tidak tersedia dalam deployment API; konfigurasi berkesan dan metadata lengkap yang boleh dibaca disertakan.

## Peta route dan halaman

Urutan sebenar: `export default.fetch` → `existingV6Worker.fetch` → `productionBaseline.fetch` → `app.fetch` → `env.ASSETS.fetch`, mengikut route. Wrapper paling luar mengurus landing awam dan alias login. `_headers`/security wrapper kekal aktif.

| Laluan | Source yang serve / tingkah laku |
| --- | --- |
| `GET/HEAD /`, `/index.html` | `worker/ui/PUBLIC_DAWN_HTML.html` — SVG subuh, nama, butang login; tiada injection V6. Sesi/query diperiksa oleh skrip klien. |
| `GET/HEAD /masuk` | Alias internal kepada root ASSETS `public/index.html`, melalui semua patch dashboard dan injection V6; borang login asal dibuka untuk pelawat tanpa sesi. |
| `/masuk/`, `/masuk.html` | Redirect 302 ke `/masuk`, query dikekalkan. |
| `/masuk?ws=recond&page=...`, `/masuk?ws=proton&page=...` | `public/index.html`, `public/rc4.js`, `platform.js` dan controller marketing, dengan patch Worker. |
| `/?ws=...&page=...`, `/?ks=...` | Landing memindahkan query/hash ke `/masuk`; deep link lama dikekalkan. |
| `/masuk?ks=workspaces`, `infra`, `seo`, `knowledge`, `settings` | `worker/ui/V6_JS.js` mengaktifkan controller/menu sedia ada. |
| `/takaful-keluarga`, `/takaful-keluarga/` | `worker/ui/KS_TAKAFUL_HTML.html` + injection V6. |
| `/takaful-keluarga?module=dashboard/crm/inbox/agent/followup/knowledge/magic/cmo/settings` | Modul dalam HTML Takaful yang sama; controller menggunakan query `module`. |
| `/ai-persona` | Redirect ke `/takaful-keluarga/ai-persona`. |
| `/takaful-keluarga/ai-persona` | `worker/ui/KS_PERSONA_HTML.html` + V6. |
| `/takaful-keluarga/seo`, `/takaful-keluarga/seo/` | `worker/ui/LINDUNG_SEO_HTML.html` + V6. Tab `overview`, `keywords`, `competitors`, `posts`, `gsc`, `links`, `report`. |
| `/ai-sales-v1`, `/ai-sales-command-center` | `worker/ui/AI_SALES_V1_HTML.html` + V6. Query `workspace`, `tab`; tabs `today`, `leads`, `inbox`, `fu`, `agents`, `night`, `route`. |
| `/healthz` | JSON tetap daripada `app.fetch`; label environment/revision berasal daripada source, bukan nama env Wrangler. |
| `/ks-v6.css` | `worker/ui/V6_CSS.css`. |
| `/ks-v6.js` | `worker/ui/V6_JS.js`, kemudian wrapper menambah pengenalan pathname `/masuk`. |
| `/ks-session-sync.js` | `worker/ui/KS_SESSION_SYNC_V1.js`. |
| `/dashboard-unified-theme.css` | `worker/ui/UNIFIED_DASHBOARD_THEME_V1.css`, menindih public dengan nama sama. |
| `/seo-intelligence.js` | `worker/ui/SEO_INTELLIGENCE_GZ_B64.js`, gzip+base64 dalam baseline. |
| `/infra-chat-v12.js` | `worker/ui/INFRA_CHAT_V12_B64.js`, gzip+base64 dalam baseline. |
| `/infra-nav-v113.js` | `worker/ui/INFRA_NAV_V113.js`, gzip+base64 dalam baseline. |
| `/infra-picker-fix.js` | `worker/ui/INFRA_PICKER_PATCH_JS.js`. |
| `/infrastructure.js`, `/infrastructure.css` | `worker/ui/INFRA_JS_GZ.js`, `INFRA_CSS_GZ.css`; sebenarnya base64 biasa walaupun nama GZ. |
| `/rc4.js` | `public/rc4.js` + patch nav AI/Takaful + session restore/deep-link patches daripada Worker. Salinan respons akhir dalam `worker/served/rc4.js`. |
| `/api/supabase/auth/v1/token`, `/user`, `/logout`, `/settings` | Proxy auth; hanya empat path penuh `/auth/v1/...` dalam `AUTH_PATHS`. Token endpoint menggunakan query `grant_type=password/refresh_token`. |
| `/api/supabase/functions/v1/<nama>` | Proxy hanya untuk nama dalam allowlist di bawah; semakan Bearer, Origin, method dan upstream kekal. |
| `/api/*` lain, auth/functions di luar allowlist | 404; jangan tambah route hanya untuk redesign. |
| `/migrations`, `/backend`, `/audit` dan subpath | 404 yang disengajakan. |
| Path static selebihnya | `env.ASSETS` → fail pada jadual di bawah. Tiada html-handling automatik. |
| Path lain yang tidak wujud | ASSETS SPA fallback ke `public/index.html`; HTTP 200 tidak membuktikan fail dengan nama itu wujud. |
| HTTP biasa | Redirect HTTPS oleh `productionBaseline`; kekalkan polisi ini. |

Workspace Recond/Proton menyokong page `dashboard`, `leads`, `inbox`, `agents`, `followup`, `knowledge`, `settings`; Recond turut mempunyai `magic`, `cmo`. Page/controller legacy lain kekal penuh dalam JS dan tidak dibuang.

### Proxy function allowlist

Semua di bawah ialah `/api/supabase/functions/v1/<nama>`:

- `ks-ilindung-persona`
- `prospect-dashboard`
- `whatsapp-dashboard`
- `ar-platform-inbox`
- `ar-platform-push`
- `ar-knowledge-v3`
- `marketing-api`
- `marketing-v53-stage`
- `infrastructure-control`
- `infrastructure-chat`
- `infrastructure-chat-staging`
- `ks-seo-intelligence`

Method proxy yang diterima: `GET`, `HEAD`, `POST`, `OPTIONS`. Upstream tetap `https://ldrvvpmxnhapsupdgjee.supabase.co`; header yang dibenarkan sahaja diteruskan. RPC Takaful/AI Sales tertentu juga pergi terus ke Supabase melalui URL yang sudah ada dalam HTML. Ini tidak menjadikan `/api/supabase/rest/v1/*` route yang dibenarkan.

### Semua fail public

| Fail | Laluan | Kegunaan |
| --- | --- | --- |
| `public/404.html` | `/404.html` | Fail statik 404 asal; SPA fallback sebenar ditetapkan dalam config. |
| `public/_headers` | `/_headers` (konfigurasi sahaja) | Konfigurasi upload security headers, bukan URL fail awam. |
| `public/dashboard-unified-theme.css` | `/dashboard-unified-theme.css` | Salinan asal repo; laluan live ditindih UNIFIED_DASHBOARD_THEME_V1. |
| `public/fonts/geist-400.ttf` | `/fonts/geist-400.ttf` | Font Geist setempat; binary penuh daripada production. |
| `public/fonts/geist-500.ttf` | `/fonts/geist-500.ttf` | Font Geist setempat; binary penuh daripada production. |
| `public/fonts/geist-600.ttf` | `/fonts/geist-600.ttf` | Font Geist setempat; binary penuh daripada production. |
| `public/fonts/geist-700.ttf` | `/fonts/geist-700.ttf` | Font Geist setempat; binary penuh daripada production. |
| `public/fonts/geist-800.ttf` | `/fonts/geist-800.ttf` | Font Geist setempat; binary penuh daripada production. |
| `public/i18n.js` | `/i18n.js` | Terjemahan dan pilihan bahasa. |
| `public/icon-192.png` | `/icon-192.png` | Ikon PWA setempat; binary penuh daripada production. |
| `public/icon-512-maskable.png` | `/icon-512-maskable.png` | Ikon PWA setempat; binary penuh daripada production. |
| `public/icon-512.png` | `/icon-512.png` | Ikon PWA setempat; binary penuh daripada production. |
| `public/index.html` | `/index.html` | HTML asal login/dashboard; Worker mempatch dan memaparkannya di /masuk. Bukan landing awam baharu. |
| `public/infra-chat-v12.js` | `/infra-chat-v12.js` | Salinan repo; laluan live ditindih INFRA_CHAT_V12_B64. |
| `public/infra-nav-v113.js` | `/infra-nav-v113.js` | Salinan repo; laluan live ditindih INFRA_NAV_V113. |
| `public/infrastructure.css` | `/infrastructure.css` | Salinan repo; laluan live ditindih INFRA_CSS_GZ. |
| `public/infrastructure.js` | `/infrastructure.js` | Salinan repo; laluan live ditindih INFRA_JS_GZ. |
| `public/kc-v3.css` | `/kc-v3.css` | Knowledge Center presentation. |
| `public/kc-v3.js` | `/kc-v3.js` | Knowledge Center controller dan integrasi. |
| `public/landing.css` | `/landing.css` | Gaya landing lama, bukan landing subuh aktif. |
| `public/landing.part.html` | `/landing.part.html` | Fragmen landing lama; disimpan sebagai asset asal. |
| `public/manifest.webmanifest` | `/manifest.webmanifest` | Nama PWA, ikon, start_url=/ dan scope. |
| `public/marketing.css` | `/marketing.css` | Marketing presentation. |
| `public/marketing.js` | `/marketing.js` | Marketing/Magic Ads controller. |
| `public/platform.js` | `/platform.js` | API/data/controller platform dan knowledge. |
| `public/rc4.css` | `/rc4.css` | Gaya dashboard/workspace lama. |
| `public/rc4.js` | `/rc4.js` | Controller workspace, navigasi, restore sesi, CRM; respons live dipatch Worker. |
| `public/sw.js` | `/sw.js` | Service Worker network-only dan push notifications. |
| `public/v5.css` | `/v5.css` | Gaya V5. |
| `public/v5.js` | `/v5.js` | UI controller V5. |
| `public/v53.css` | `/v53.css` | Gaya marketing V5.3. |
| `public/v53.js` | `/v53.js` | Marketing V5.3 controller. |
| `public/v54.css` | `/v54.css` | Gaya V5.4. |
| `public/v54.js` | `/v54.js` | UI controller V5.4. |
| `public/vendor/JSZIP-LICENSE` | `/vendor/JSZIP-LICENSE` | Library pihak ketiga atau lesen; salinan penuh production, bukan untuk redesign. |
| `public/vendor/PDFJS-LICENSE` | `/vendor/PDFJS-LICENSE` | Library pihak ketiga atau lesen; salinan penuh production, bukan untuk redesign. |
| `public/vendor/jszip.min.js` | `/vendor/jszip.min.js` | Library pihak ketiga atau lesen; salinan penuh production, bukan untuk redesign. |
| `public/vendor/pdf.min.mjs` | `/vendor/pdf.min.mjs` | Library pihak ketiga atau lesen; salinan penuh production, bukan untuk redesign. |
| `public/vendor/pdf.worker.min.mjs` | `/vendor/pdf.worker.min.mjs` | Library pihak ketiga atau lesen; salinan penuh production, bukan untuk redesign. |

### Peta string pecahan → Worker asal

Nombor baris merujuk `worker/worker.mjs`. `ui-map.json` turut menyimpan offset literal dan hash. Fail FRAGMENT ialah snippet/patch dan mungkin bukan program standalone; jangan jalankan terus. String dalam fungsi `__ks_browser_syntax_only` ialah salinan bantuan dalam baseline; jangan anggapnya controller UI tambahan yang aktif.

| Fail pecahan | Nama dalam Worker | Baris definisi | Baris rujukan | Encoding dalam baseline |
| --- | --- | ---: | --- | --- |
| `worker/ui/LINDUNG_SEO_HTML.html` | `LINDUNG_SEO_HTML` | 1 | 1, 100 | text |
| `worker/ui/KS_SESSION_SYNC_V1.js` | `KS_SESSION_SYNC_V1` | 3 | 3, 29 | text |
| `worker/ui/UNIFIED_DASHBOARD_THEME_V1.css` | `UNIFIED_DASHBOARD_THEME_V1` | 4 | 4, 30 | text |
| `worker/ui/SEO_INTELLIGENCE_GZ_B64.js` | `SEO_INTELLIGENCE_GZ_B64` | 5 | 5, 31 | gzip-base64 |
| `worker/ui/AI_SALES_V1_HTML.html` | `AI_SALES_V1_HTML` | 7 | 7, 104 | text |
| `worker/ui/INFRA_CHAT_V12_B64.js` | `INFRA_CHAT_V12_B64` | 8 | 8, 32 | gzip-base64 |
| `worker/ui/INFRA_NAV_V113.js` | `INFRA_NAV_V113` | 9 | 9, 33 | gzip-base64 |
| `worker/ui/INFRA_PICKER_PATCH_JS.js` | `INFRA_PICKER_PATCH_JS` | 10 | 10, 34 | text |
| `worker/ui/INFRA_JS_GZ.js` | `INFRA_JS_GZ` | 11 | 11, 35 | base64 |
| `worker/ui/INFRA_CSS_GZ.css` | `INFRA_CSS_GZ` | 12 | 12, 36 | base64 |
| `worker/ui/KS_PERSONA_HTML.html` | `KS_PERSONA_HTML` | 21 | 21, 103 | text |
| `worker/ui/KS_TAKAFUL_HTML.html` | `KS_TAKAFUL_HTML` | 22 | 22, 101 | text |
| `worker/ui/KS_TAKAFUL_NAV_CSS.css` | `KS_TAKAFUL_NAV_CSS` | 23 | 23, 57 | text |
| `worker/ui/FRAGMENT_01_topCard.html` | `topCard` | 43 | 43 | text |
| `worker/ui/FRAGMENT_02_extra.html` | `extra` | 46 | 46 | text |
| `worker/ui/FRAGMENT_03_fragment.html` | `fragment` | 125 | 125 | text |
| `worker/ui/FRAGMENT_04_fragment.html` | `fragment` | 128 | 128 | text |
| `worker/ui/FRAGMENT_05_fragment.html` | `fragment` | 134 | 134 | text |
| `worker/ui/FRAGMENT_06_fragment.html` | `fragment` | 138 | 138 | text |
| `worker/ui/V6_CSS.css` | `V6_CSS` | 144 | 144, 173 | text |
| `worker/ui/V6_JS.js` | `V6_JS` | 145 | 145, 173 | text |
| `worker/ui/FRAGMENT_07_fixed.js` | `fixed` | 156 | 156 | text |
| `worker/ui/PUBLIC_DAWN_HTML.html` | `PUBLIC_DAWN_HTML` | 191 | 191, 201 | text |

## Aliran log masuk dan sesi

1. `/` tanpa sesi menunjukkan landing. Skrip memeriksa `sessionStorage['rc4.sess']`. Jika ada `r` bukan kosong, ia mengalih ke `/masuk`; query lama juga diteruskan. Ini pemeriksaan navigasi sahaja, bukan pengesahan backend.
2. `/masuk` menggunakan `loginDialog` dan `loginForm` asal dalam `public/index.html`. E-mel/kata laluan dihantar ke Supabase token endpoint melalui proxy same-origin. Kata laluan tidak disimpan.
3. `state.session` menyimpan access token dalam memori. `public/rc4.js` mengekalkan refresh token dalam `sessionStorage['rc4.sess']` sebagai JSON `{r: <refresh_token>}`. `rc4.ws` menyimpan workspace dipilih.
4. Reload halaman menggunakan refresh token untuk memulihkan sesi; token berputar setiap refresh. Akses data masih disemak backend (owner/admin), bukan daripada kewujudan storage key.
5. `KS_SESSION_SYNC_V1.js` menggunakan `BroadcastChannel('ks-session-v1')` untuk token rotation/logout antara tab yang sudah ada sesi. Sebelum refresh, dashboard mengambil token terkini daripada sessionStorage. Tab yang sudah signed out tidak memperoleh sesi daripada broadcast.
6. `patchRootSession`, `patchRestoreFailure` dan `patchWorkspaceRestore` menangani bfcache, gangguan sambungan, dan deep link. Kekalkan ketiga-tiganya. Respons auth 400/401/403 membersihkan sesi; gangguan bukan auth memberi peluang cuba semula.
7. Logout membersihkan state dan `rc4.sess`/`rc4.ws`, menghantar logout sync dan cuba membatalkan sesi server dengan `scope=local`. Menutup tab menamatkan sessionStorage; jangan tukar kepada localStorage untuk "memanjangkan" sesi semasa redesign.

| Storage | Kunci | Kegunaan |
| --- | --- | --- |
| sessionStorage | `rc4.sess` | Refresh token sesi; dilindungi secara logik oleh auth backend. |
| sessionStorage | `rc4.ws` | Pilihan workspace Recond/Proton. |
| sessionStorage | `ks.v6.theme` | Tema light/dark. |
| sessionStorage | `ksInfraSelectedProject` | Projek Infrastructure yang dipilih. |
| sessionStorage | `ksInfraLastThread` | ID thread Infrastructure terakhir. |
| localStorage | `ks-ui-language` | Pilihan bahasa BM/EN; bukan token. |

Tiada localStorage auth token ditemui dalam source yang dieksport. Service Worker menggunakan network-only; kodnya tidak cache token atau rekod pelanggan. Jangan masukkan data sesi sebenar ke dalam pakej redesign.

## Fail yang boleh diubah untuk UI

Utamakan `worker/ui/PUBLIC_DAWN_HTML.html`, `V6_CSS.css`, `UNIFIED_DASHBOARD_THEME_V1.css`, `KS_TAKAFUL_NAV_CSS.css`, dan CSS dalam `public/`. Untuk Takaful/Persona/AI Sales/SEO, markup dan `<style>` berada dalam fail HTML pecahan masing-masing. Ubah bahagian presentation sambil mengekalkan ID/selector, handler, payload API, token dan semakan owner.

`V6_JS.js`, JS Infrastructure, `public/rc4.js`, `platform.js`, marketing/knowledge JS mengandungi campuran UI dan controller. Ubah renderer/navigasi yang perlu sahaja; kekalkan contract serta state flow. Mengubah `public/index.html` tidak mengubah landing subuh; landing aktif berada dalam `PUBLIC_DAWN_HTML.html`.

Jangan edit salinan dalam `worker/served/` untuk membina laman. Untuk route override, edit `worker/ui/` yang berkaitan. Untuk asset biasa, edit `public/`. `node build-worker.mjs` menyisipkan semula fail pecahan ke dalam salinan Worker; string yang tidak berubah mengekalkan literal asal tepat, termasuk gzip asal. Ia tidak deploy atau menghubungi mana-mana perkhidmatan.

## Bahagian yang jangan disentuh untuk redesign

- `worker/worker.mjs` sebagai baseline penuh; `UPSTREAM`, `FUNCTIONS`, `AUTH_PATHS`, `ORIGINS`, method/Bearer checks dan blok `/api/supabase/*`.
- Header HTTPS/HSTS, no-store/noindex, X-Frame-Options, nosniff, Referrer/Permissions Policy dan `public/_headers`.
- `KS_SESSION_SYNC_V1.js`, token refresh, owner/admin checks, logout, sessionStorage key/format, dan lifecycle patch.
- Schema/payload/nama Edge Function, RPC, polisi WhatsApp/AI dan tindakan bisnes. Eksport ini tidak mengubahnya.
- `public/vendor/` dan lesen; perubahan vendor bukan kerja presentation.

## Bina dan uji setempat

Perlukan Node.js moden dan Wrangler v4 yang dipasang sendiri melalui npm. Tiada `node_modules`, nilai `.env`, atau credential dibundel.

```sh
cd kerjasendiri-source
node build-worker.mjs
node --check worker/worker.generated.mjs
npx wrangler dev --env staging
```

Build tanpa suntingan mesti melaporkan `baseline_identical: true` dan hash production di atas. Preview setempat sesuai untuk markup; backend asal masih memerlukan origin yang dibenarkan dan sesi owner. Jangan longgarkan auth/Origin checks untuk memudahkan preview.

## Deploy ke staging (panduan sahaja; belum dilaksanakan)

Pilih akaun Cloudflare yang betul melalui kaedah credential private sendiri; jangan commit credential.

```sh
cd kerjasendiri-source
node build-worker.mjs
npx wrangler deploy --env staging --dry-run --outdir /tmp/kerjasendiri-staging-dry-run
npx wrangler deploy --env staging
```

Sasaran: `kerjasendiri-staging`; `routes=[]` memastikan domain production tidak dipasang pada staging. URL: https://kerjasendiri-staging.zunaidi-ahmad.workers.dev

Semak `/`, `/masuk`, `/healthz`, Recond/Proton, Takaful, AI Sales, SEO, Infrastructure dan sesi back/reload pada telefon serta desktop. Staging menggunakan backend Supabase sama dalam source ini; deploy frontend bukan salinan database. Ujian redesign perlu mengelakkan mutasi data bisnes yang tidak diminta.

Preview alternatif: `npx wrangler deploy --env preview` menyasarkan `kerjasendiri-v6-preview`, tanpa routes production. Baseline proxy hanya membenarkan origin production/staging yang sedia ada; origin preview berasingan tidak berada dalam allowlist. Ini ciri baseline, bukan ralat eksport; jangan ubah allowlist tanpa skop kerja auth yang jelas.

## Rollback (panduan sahaja; belum dilaksanakan)

Sebelum sebarang deployment pada masa depan, rekod versi aktif Worker sasaran dan simpan assets/source lama. Cloudflare Dashboard → Workers & Pages → Worker sasaran → Deployments → pilih versi lama → deploy 100%.

Versi sebelum kerja redesign pada production ialah `3e6d5fad-0a07-4394-8fec-7c23076c91f9`. Untuk mengembalikan production selepas deployment masa depan:

```sh
npx wrangler rollback 3e6d5fad-0a07-4394-8fec-7c23076c91f9 --name kerjasendiri
```

Untuk staging, gunakan ID versi staging yang direkod sebelum deploy; jangan gunakan ID production pada Worker lain. Versi staging yang dibaca pada eksport: `513a649e-b551-41f2-a534-e1b28e2fcaf2`; preview: `f6d594bc-2c8a-4f6c-89cc-a72688751a5d`. Semak sekali lagi pada masa deployment kerana ini snapshot.

## Rahsia dan sumber luar

Tiada nilai `.env`, API provider key, service-role key, token pengguna, kata laluan atau private key dieksport. Supabase publishable/anon key yang memang menjadi sebahagian UI dikekalkan seperti dibenarkan. ID akaun/project/route/version bukan credential. Pemeriksaan literal/JWT dan bentuk key rahsia dilakukan pada Worker, fail yang didekod, assets teks dan metadata; laporan dalam `metadata/secret-scan.json`. Tiada redaksi diperlukan pada source yang dieksport, jadi hash Worker asal masih tepat.

URL imej luar kekal dalam source; tiada data pelanggan atau sesi aktif diambil. Source asal projek sebelum bundle, file authoring production TOML, source backend Supabase, dan fail orphan yang tidak disenaraikan adalah batas yang dinyatakan di atas.

Rujukan Cloudflare: https://developers.cloudflare.com/workers/static-assets/ dan https://developers.cloudflare.com/workers/wrangler/configuration/
