# Redesign UI kerjasendiri.my: arahan deploy

Dibuat atas baseline production `3e6d5fad-0a07-4394-8fec-7c23076c91f9` (Worker SHA-256 `c3b594b1…336e`).
Hanya lapisan paparan diubah. Auth, proksi Supabase, laluan API, header keselamatan, sesi (`KS_SESSION_SYNC_V1`,
`patchRootSession`, `patchRestoreFailure`, `patchWorkspaceRestore`) tidak disentuh. `build-worker.mjs` menolak build
jika fail sesi yang dilindungi berubah.

## Apa yang berubah (3 fail UI + 1 asset)

| Fail | Perubahan |
| --- | --- |
| `worker/ui/V6_CSS.css` | Ditulis semula. Token warna neutral gaya Apple, mod cerah/gelap ikut sistem, satu susunan font sistem (SF/Roboto/Segoe), butang 44px, tab terapung, tab modul bentuk kapsul, menu sebagai sheet. Sidebar dan bar atas dibuang. |
| `worker/ui/V6_JS.js` | Shell baharu: tab terapung (atas-tengah pada desktop, bawah pada telefon, 5 item tanpa skrol), butang kembali terapung, ikon SVG, menu berkumpulan dengan carian, tema dalam menu. Landing dalam-halaman pra-login hanya "Kerja Sendiri" dan satu butang. |
| `worker/ui/UNIFIED_DASHBOARD_THEME_V1.css` | Palet cerah AI Sales tak lagi menindih token V6 (punca teks kelabu dan pautan biru pudar pada latar gelap). Font diseragamkan. |
| `public/index.html` | Dialog log masuk dibersihkan: buang sebutan "Supabase" dan teks sistem. ID dan handler tak diubah. |

Halaman awam `/` (landing subuh) tidak diubah.

## Prompt untuk ChatGPT

> Lampiran ialah folder/zip `kerjasendiri-source` yang sudah siap diubah. Tugas, ikut urutan:
> 1. `cd kerjasendiri-source && node build-worker.mjs`. Ia mesti laporkan 3 fail berubah dan `baseline_identical: false`.
>    Jalankan `node --check worker/worker.generated.mjs`.
> 2. Rekod versi aktif semasa `kerjasendiri` dan `kerjasendiri-staging` untuk rollback.
> 3. `npx wrangler deploy --env staging --dry-run --outdir /tmp/ks-dry`, kemudian `npx wrangler deploy --env staging`.
> 4. Uji https://kerjasendiri-staging.zunaidi-ahmad.workers.dev pada telefon (iOS Safari, Android Chrome) dan desktop:
>    - `/` landing subuh, butang ke `/masuk`.
>    - `/masuk` dialog log masuk jelas, tiada teks sistem, log masuk owner berfungsi.
>    - Selepas log masuk: tab terapung (atas pada desktop, bawah pada telefon), butang kembali, Menu + carian, tukar tema.
>    - `/takaful-keluarga?module=dashboard`, `/ai-sales-command-center`, `/?ws=recond&page=dashboard`,
>      `/?ks=infra`, `/?ks=seo` semua terbuka dan boleh dibaca. `/healthz` masih `ok`.
>    - Refresh dan butang back tak menghilangkan sesi (patch sesi masih aktif).
> 5. Laporkan hasil kepada saya. Hanya selepas saya setuju: `npx wrangler deploy` (production).
>    Rollback: `npx wrangler rollback <versi_sebelum> --name kerjasendiri`.
> Jangan ubah `worker/worker.mjs`, auth, proksi `/api/supabase/*` atau `_headers`.

## Semakan lulus

- [ ] Tiada skrol mendatar pada 360px, 390px, 768px, 1440px
- [ ] Sasaran sentuh 44px ke atas, kontras teks 4.5:1 ke atas dalam cerah dan gelap
- [ ] Tab terapung mengikut safe-area iPhone dan tak menutup kandungan
- [ ] Log masuk, log keluar, refresh, dan deep link `?ws=`/`?ks=`/`?tab=` berfungsi seperti sebelum ini
