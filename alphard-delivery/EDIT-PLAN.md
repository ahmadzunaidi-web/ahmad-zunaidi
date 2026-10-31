# Alphard SC Delivery: Ir Faizal (Putrajaya)

**Format:** 1080×1920 (9:16), 30 fps, **33.5 s**. Tiada suara asal, tiada muzik, hanya SFX.
**Status:** PREVIEW (draf). Final belum dirender.

---

## 1. Transcript (Whisper `small`, BM)

Audio asal cuma bunyi ambien dan arahan jurugambar. Tiada dialog yang perlu dikekalkan, jadi **semua audio asal dibuang**.

| Klip | Masa | Apa yang didengar | Keputusan |
|---|---|---|---|
| c01 family-wave | 2.5–4.1 | "Lama-lama sikit, lama sikit…" (arahan jurugambar) | Buang audio, guna 2.6–5.4 (bahagian melambai) |
| c02 dad-daughter | 0.0–2.3 | "Okay, lambai lambai… Bye" | Buang audio, guna 0.8–2.8 |
| c03 family-wide | 0.0–2.0 | "Selamat tinggal ×2" | **Buang terus kerana berulang** (sama dengan c01/c02) |
| c04 mum-kids-bow | 0.0–6.0 | "Hei! … Terima kasih" | Buang 0–4 s (wide shot goyang), guna 4.0–6.4 |
| c05–c09 | — | Ambien sahaja (ayat lain ialah halusinasi Whisper) | — |
| c10 bouquet-bow | 0–12.7 | Ambien, isteri ambil gambar lama | **Buang 10 s** yang berulang, guna 5.0–7.0 sahaja |
| c11 photographer | — | Senyap | **Buang** (orang lain ambil gambar, tiada nilai cerita) |
| c12 grille-drl | 0.0–5.1 | "Boleh, boleh…" | Buang 0–3.4 (wide statik), guna close-up 3.4–5.8 |
| c13 drive-off | 2.1–13.6 | "Helo, selamat tinggal, terima kasih banyak…" | Buang audio, pecah jadi 3 shot |

**Bahan asal:** ~89 s. **Hasil edit:** 33.5 s (lebih kurang 62% jeda janggal dan ulangan dibuang).

---

## 2. Hook (0–2 s)

Mula dengan **lampu depan Alphard menyala** (c08) bersama teks besar **"ALPHARD SC / Kini milik Ir Faizal"** yang sudah kelihatan pada frame 0 (jadi thumbnail), disertai **bass impact**. Penonton nampak hasilnya dulu, kemudian baru cerita.

---

## 3. Shot list / EDL

| # | Masa | Klip (offset) | Visual | Grafik | SFX |
|---|---|---|---|---|---|
| S1 | 0.0–2.0 | c08 (0.3) | Lampu depan flare | **HOOK**: ALPHARD SC + "Kini milik Ir Faizal" | impact-bass @0.0 |
| S2 | 2.0–4.4 | c12 (3.4) | Grille + DRL dekat | Pil "TOYOTA Alphard SC" | whoosh-short @1.94, pop @2.32 |
| S3 | 4.4–6.4 | c09 (0.4) | Lampu belakang | Flash putih masuk | whoosh @4.34 |
| S4 | 6.4–9.2 | c01 (2.6) | Keluarga melambai | Kad 📍 "Serahan ke Putrajaya" | pop @6.62 |
| S5 | 9.2–11.2 | c02 (0.8) | Ayah + anak | — | — |
| S6 | 11.2–13.6 | c04 (4.0) | Ibu + anak, reben merah | "Impian keluarga, **jadi nyata.**" | sparkle @11.42 |
| S7 | 13.6–15.6 | c10 (5.0) | Pelanggan + bunga | (tagline sambung) | — |
| S8 | 15.6–18.4 | Gambar keluarga | Polaroid + flash kamera | "Kenangan · 31.10.2026" | click (shutter) @15.56, sparkle @15.85 |
| S9 | 18.4–20.6 | c05 (0.2) | Buka pintu | — | whoosh-short @18.34 |
| S10 | 20.6–22.4 | c06 (1.4) | Tinjau kabin | — | — |
| S11 | 22.4–24.8 | c07 (0.3) | Anak-anak dalam kabin | Kad emas "KABIN VIP · Penumpang pertama!" | pop @22.62 |
| S12 | 24.8–27.6 | c13 (0.3) | Tracking kereta keluar | — | whoosh @24.74 |
| S13 | 27.6–29.2 | c13 (8.0) | Lambai dari tingkap | "Jom, balik!" | riser mula @26.53 |
| S14 | 29.2–33.5 | c13 (11.7) @0.72× slow-mo | Pandu pergi ke malam | **END CARD** @30.0: TAHNIAH IR FAIZAL | impact-bass @29.96, sparkle @30.38 |

Setiap shot ada **slow push-in / pull-back** (1.00→1.08) supaya tidak statik.

---

## 4. SFX: prinsip

- Sebab setiap bunyi ada di skrin: whoosh hanya pada cut, pop pada kad yang muncul, shutter pada gambar, dan riser→impact **sekali sahaja** pada end card.
- Whoosh diselang-seli (`whoosh` / `whoosh-short`) supaya tidak berulang.
- Puncak setiap fail diukur dengan `npx hyperframes audio`, dan klip diletak supaya puncak jatuh ≤1 frame selepas visual.
- Sumber: pustaka bawaan HyperFrames (Pixabay Content License, tidak perlu kredit). Lihat `assets/sfx/CREDITS.md`.

---

## 5. Semakan 4 Hukum (Atomic Habits)

| Hukum | Dalam video ini |
|---|---|
| **Jelas** | Hook pada frame 0 terus beritahu *apa* (Alphard SC) dan *siapa* (Ir Faizal). Semua teks berada dalam zon selamat 168–1330 px. |
| **Menarik** | Lampu menyala, flash kamera, slow-mo pandu pergi ke malam. Emosi keluarga diutamakan. |
| **Mudah** | 33 s sahaja, satu idea setiap shot, teks ≤5 perkataan setiap baris. Nama/model/lokasi/tarikh ialah *variables* yang boleh ditukar untuk delivery seterusnya tanpa sentuh kod. |
| **Memuaskan** | Riser → impact → "TAHNIAH IR FAIZAL" sebagai ganjaran di hujung. |

---

## 6. Guna semula untuk delivery lain

```bash
./scripts/prep-media.sh            # muat turun + tukar footage (edit senarai ID Drive di dalamnya)
npx hyperframes preview            # Studio: tukar nama/model/lokasi di panel Variables
npx hyperframes render -q draft -o preview/preview.mp4                   # preview
npx hyperframes render -q delivery -o out/alphard-delivery-FINAL.mp4     # FINAL (selepas lulus)
npx hyperframes render --variables '{"client":"Encik Ali","city":"Shah Alam"}' -o out/x.mp4
```
