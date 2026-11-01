# Deploy: halaman pra-log-masuk kerjasendiri.my

Fail: `index.html` (satu fail, tiada imej atau skrip luar, ~9 KB).
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
