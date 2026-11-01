# Deploy: halaman pra-log-masuk kerjasendiri.my

Kod penuh `index.html` ada di bahagian akhir fail ini. Simpan sebagai `index.html` tanpa ubah apa-apa kecuali `LOGIN_URL` jika perlu.
Keputusan reka bentuk: pemandangan subuh (SVG), nama sahaja, satu butang Log masuk,
tab terapung (bawah pada telefon, atas-tengah pada desktop), tiada info sistem.

## Arahan untuk ChatGPT (salin semua di bawah)

> Saya ada Cloudflare Worker bernama `kerjasendiri` (production), `kerjasendiri-staging`
> (staging) dan domain kerjasendiri.my. Worker ni ada Workers Assets (binding `env.ASSETS`),
> backend Supabase dan sistem log masuk. Saya lampirkan `index.html` baru (halaman pra-log-masuk).
>
> Tugas, ikut urutan, dan berhenti serta tanya saya kalau ada yang tak jelas:
> 1. Muat turun source worker semasa (`wrangler` atau dashboard) dan folder assets. Jangan ubah
>    logik Supabase, `/api/supabase/*`, `rc4.js`, `/takaful-keluarga`, `/ai-sales-v1` atau
>    header keselamatan.
> 2. Pada assets semasa, namakan semula `index.html` lama kepada `masuk.html`. Ini ialah skrin
>    log masuk dan dashboard sebenar. Pastikan ia masih berfungsi di `/masuk`
>    (`html_handling` / `not_found_handling` pada konfigurasi assets, atau route khas dalam worker).
>    Jika `masuk.html` merujuk laluan relatif, betulkan supaya tak rosak.
> 3. Letak `index.html` baru (lampiran) sebagai halaman `/`.
> 4. Dalam worker, untuk `GET /` sahaja: jika pelawat sudah ada sesi aktif (guna kunci sesi yang
>    sedia ada dalam `masuk.html`, lihat fungsi `clearSession`/`sessionStorage` dan `ks-session-sync.js`),
>    hantar `masuk.html`. Jika tiada sesi, hantar halaman baru. Jika sukar tentukan di sisi worker
>    (sesi di sisi klien), biar `/` sentiasa hantar halaman baru dan ubah `LOGIN_URL` dalam
>    skrip hujung `index.html` kepada laluan yang betul; pengguna yang sudah log masuk terus
>    dihantar ke `/masuk` oleh skrip kecil yang awak tambah di `index.html` selepas semak kunci sesi.
> 5. Kekalkan `patchRootSession` dan penyuntikan `ks-v6.css/js` untuk `masuk.html`
>    (tukar `u.pathname==='/'` kepada `'/masuk'` dalam senarai laluan yang dipatch).
>    Jangan suntik V6 ke halaman baru.
> 6. Deploy ke `kerjasendiri-staging` dahulu. Semak di telefon (iOS Safari, Android Chrome) dan
>    desktop: `/` tunjuk pemandangan dan butang Log masuk sahaja; butang bawa ke `/masuk`;
>    log masuk berfungsi; `/healthz` masih `ok`; `/takaful-keluarga` dan `/ai-sales-v1`
>    masih buka. Tunjuk saya hasilnya.
> 7. Hanya selepas saya setuju, deploy ke `kerjasendiri` (production). Sediakan arahan rollback
>    (versi sebelum deploy).

## Pilihan LOGIN_URL

Skrip di hujung `index.html` ada `var LOGIN_URL = "/masuk";`. Tukar kalau laluan log masuk lain.
Kedua-dua butang (tengah dan tab terapung) ikut nilai ni.

## Semakan lulus

- [ ] `/` tiada teks atau info tentang sistem, hanya "Kerja Sendiri" dan Log masuk
- [ ] Tab terapung di bawah pada telefon (ikut safe-area iPhone), di atas-tengah pada desktop
- [ ] Sasaran sentuh 44px ke atas, kontras teks putih di atas langit gelap
- [ ] Tiada skrol mendatar pada 360px, 390px, 1440px
- [ ] Log masuk dan dashboard sedia ada tak berubah fungsi

---

## KOD index.html (salin tepat)

````html
<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#16243a">
<meta name="robots" content="noindex,nofollow">
<title>Kerja Sendiri</title>
<style>
/* Layout: satu skrin penuh, pemandangan di belakang, nama di tengah, tab terapung untuk navigasi.
   Mudah ubah: LOGIN_URL di hujung fail. */
:root{
  --ink:#ffffff;
  --ink-soft:rgba(255,255,255,.78);
  --night:#16243a;
  --glass:rgba(22,36,58,.52);
  --glass-line:rgba(255,255,255,.22);
  --pill:#ffffff;
  --pill-ink:#10192a;
  --focus:#9cc9ff;
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --tab-h:52px;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{
  background:var(--night);color:var(--ink);font-family:var(--font);
  -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;
  overflow:hidden;
}
.scene{position:fixed;inset:0;display:block;width:100%;height:100%}
.scrim{position:fixed;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(10,18,32,.55) 0%,rgba(10,18,32,.18) 38%,rgba(10,18,32,0) 62%)}
main{
  position:relative;z-index:1;height:100%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
  padding-block:max(24px,env(safe-area-inset-top,0px)) calc(var(--tab-h) + 64px + env(safe-area-inset-bottom,0px));
  padding-left:max(24px,env(safe-area-inset-left,0px));
  padding-right:max(24px,env(safe-area-inset-right,0px));
  text-align:center;
  transform:translateY(-6vh);
}
h1{
  margin:0;font-weight:600;letter-spacing:-.035em;line-height:1.02;
  font-size:clamp(44px,9vw,96px);text-wrap:balance;
  text-shadow:0 2px 28px rgba(8,14,26,.35);
}
.cta{
  display:inline-flex;align-items:center;justify-content:center;
  min-height:48px;padding:0 28px;border-radius:999px;
  background:var(--pill);color:var(--pill-ink);
  font:500 17px/1 var(--font);letter-spacing:-.01em;text-decoration:none;
  transition:transform .18s ease,background .18s ease;
}
.cta:hover{background:#eef3fa}
.cta:active{transform:scale(.97)}

/* Tab terapung: bawah pada telefon, atas-tengah pada desktop */
.tabs{
  position:fixed;z-index:5;left:50%;transform:translateX(-50%);
  bottom:calc(16px + env(safe-area-inset-bottom,0px));
  display:flex;gap:4px;padding:4px;border-radius:999px;
  background:var(--glass);border:1px solid var(--glass-line);
  box-shadow:0 10px 30px rgba(6,12,24,.28);
}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .tabs{-webkit-backdrop-filter:saturate(180%) blur(22px);backdrop-filter:saturate(180%) blur(22px)}
}
.tabs a{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:96px;height:44px;padding:0 20px;white-space:nowrap;border-radius:999px;
  color:var(--ink);text-decoration:none;font:500 15px/1 var(--font);letter-spacing:-.01em;
  transition:background .18s ease,color .18s ease;
}
.tabs a[aria-current="page"]{background:rgba(255,255,255,.2)}
.tabs a.login{background:var(--pill);color:var(--pill-ink)}
.tabs a:not(.login):hover{background:rgba(255,255,255,.14)}
a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}

@media (min-width:900px){
  .tabs{bottom:auto;top:calc(20px + env(safe-area-inset-top,0px))}
  main{transform:translateY(0);padding-block:max(24px,env(safe-area-inset-top,0px));}
}
@media (max-width:380px){.tabs a{min-width:80px;padding:0 16px}}

@media (prefers-reduced-motion:no-preference){
  main{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
  .tabs{animation:fade 1s .25s ease both}
  .far{animation:drift 60s ease-in-out infinite alternate}
}
@keyframes rise{from{opacity:0;translate:0 14px}to{opacity:1;translate:0 0}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes drift{from{transform:translateX(-12px)}to{transform:translateX(12px)}}
</style>
</head>
<body>

<!-- Pemandangan: subuh di kawasan tinggi. SVG sendiri, tiada imej luar. -->
<svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Pemandangan pergunungan ketika subuh">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14213a"/>
      <stop offset=".45" stop-color="#3a4f7a"/>
      <stop offset=".72" stop-color="#d98f6e"/>
      <stop offset="1" stop-color="#f6c58f"/>
    </linearGradient>
    <radialGradient id="sun" cx="1080" cy="560" r="380" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff1d0" stop-opacity=".95"/>
      <stop offset=".35" stop-color="#ffd9a6" stop-opacity=".45"/>
      <stop offset="1" stop-color="#ffd9a6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="r1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8fb0"/><stop offset="1" stop-color="#d6a98f"/></linearGradient>
    <linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f6690"/><stop offset="1" stop-color="#a98a97"/></linearGradient>
    <linearGradient id="r3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f4870"/><stop offset="1" stop-color="#6b6384"/></linearGradient>
    <linearGradient id="r4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26304f"/><stop offset="1" stop-color="#3a3d5c"/></linearGradient>
    <linearGradient id="r5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151c33"/><stop offset="1" stop-color="#1b2138"/></linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope=".05"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="900" fill="url(#sun)"/>
  <g class="far">
    <path fill="url(#r1)" d="M-40 640 L120 560 C200 520 250 520 330 570 L470 470 C520 436 560 440 610 480 L760 590 C820 560 880 520 940 540 L1100 610 C1170 560 1230 470 1300 450 C1350 438 1400 470 1440 510 L1660 640 L1660 900 L-40 900Z"/>
  </g>
  <path fill="url(#r2)" d="M-40 700 L90 640 C170 600 230 560 310 600 L420 660 C500 590 560 520 640 500 C700 486 740 520 790 570 L900 660 C980 620 1060 590 1140 620 L1280 560 C1340 536 1400 560 1460 600 L1660 700 L1660 900 L-40 900Z"/>
  <path fill="url(#r3)" d="M-40 760 L140 690 C220 660 300 690 380 730 L520 700 C600 670 660 640 740 670 L880 740 C960 700 1040 680 1120 700 L1300 660 C1380 640 1460 680 1520 720 L1660 760 L1660 900 L-40 900Z"/>
  <path fill="url(#r4)" d="M-40 810 C100 770 220 760 340 790 C460 820 560 790 680 770 C800 750 900 790 1020 800 C1160 812 1260 770 1380 770 C1480 770 1560 790 1660 810 L1660 900 L-40 900Z"/>
  <path fill="url(#r5)" d="M-40 860 C120 836 260 832 400 852 C540 872 640 850 780 842 C920 834 1040 862 1180 862 C1320 862 1460 836 1660 850 L1660 900 L-40 900Z"/>
  <rect width="1600" height="900" filter="url(#grain)"/>
</svg>
<div class="scrim" aria-hidden="true"></div>

<main>
  <h1>Kerja Sendiri</h1>
  <a class="cta" href="/masuk" data-login>Log masuk</a>
</main>

<nav class="tabs" aria-label="Navigasi utama">
  <a href="/" aria-current="page">Utama</a>
  <a href="/masuk" class="login" data-login>Log masuk</a>
</nav>

<script>
/* Tukar sekali di sini jika laluan log masuk lain. Lihat DEPLOY.md. */
var LOGIN_URL = "/masuk";
document.querySelectorAll("[data-login]").forEach(function(a){a.setAttribute("href",LOGIN_URL)});
</script>
</body>
</html>
````
