# Voxy SZ — recut menegak (Hyperframes)

Edit semula video walkaround Toyota Voxy SZ daripada `VID_20260924_090006592.mp4`.

**3m 10.1s → 2m 05.4s** (dipotong 64.8s / 34%)

## Keputusan edit

### Hook dipindah ke depan
Ayat terkuat video asal berada pada **0:37** — terkubur 37 saat di belakang
salam dan nasihat loan. Ia kini saat 0:00:

> *"Jangan tengok pada tahun saja, jangan tengok pada mileage saja,
> jangan tengok pada grade saja."*

Tiga ulangan berirama yang mencipta curiosity gap. Dia mengulang ayat sama
pada 2:25 dalam video asal, jadi struktur bookend terbentuk sendiri —
hook di depan, payoff di belakang (segmen RECAP).

### Bahagian nasihat loan dibuang
0:00–0:33 asal (dokumen, gaji, CCRIS, komitmen) ialah topik berlainan.
Dibuang sepenuhnya atas keputusan pemilik video.

### Nomboran dibetulkan secara visual
Penutur cuba membuat senarai bernombor tetapi tersasar — dia menyebut
"nombor tiga, nombor empat" dua kali, melangkau nombor, dan tiga item
terakhir tidak bernombor langsung. Sebenarnya ada **9 item**.

Counter chip `N/9` di penjuru membetulkan kiraan tanpa dia perlu rakam semula.

| # | Item | Unit ini |
|---|------|----------|
| 1 | Power boot | — |
| 2 | Blind spot monitor | — |
| 3 | Side step | ✗ tiada |
| 4 | Leg rest + seat heater | ✗ tiada |
| 5 | Digital inner mirror | ✓ aftermarket |
| 6 | 360° camera | ✗ tiada |
| 7 | Infrared camera | — |
| 8 | Head-up display | — |
| 9 | Lampu LED | ✗ tiada |

Tanda ✓/✗ hanya dipaparkan di mana penutur menyatakan dengan jelas
sama ada unit ini memilikinya.

### Pengulangan yang dibuang

| Masa asal | Dibuang |
|---|---|
| 0:25 | "nak minta saya tolong check" diulang penuh (tersasul) |
| 0:52–0:53 | "nombor satu, nombor dua" — nomboran rosak, diganti chip |
| 1:05–1:06 | "Dia tak nak yang ni" — mengulang "owner dia kata tak nak" |
| 1:10–1:12 | "ada unit yang ada side step, ada yang tak ada" |
| 1:35–1:37 | "Okey nombor tiga, nombor empat" — false start, nombor salah |
| 1:54–1:57 | "Sebab apa-apa dah saya pun dah lupa dah" |
| 1:57–2:00 | "apa yang tak ada, apa yang ada, apa yang tak ada" (×3) |
| 2:20–2:25 | "Ada pun tak apa / tak menjadi hal / tak turn off" — 4 cara sebut benda sama |

Setiap sempadan potongan disahkan **tidak mengerat tengah perkataan**
(audit automatik terhadap timestamp word-level: 0 pelanggaran), dan setiap
segmen berakhir sebagai ayat lengkap.

### Pembetulan caption
Transkripsi ASR dibetulkan: `powerboat` → **power boot**, `Vauxy`/`VW SZ`/`VW C`
→ **Voxy SZ**, `sekris` → **CCRIS**, `add up display` → **head-up display**,
`staring` → **stereng**, `one to work kita` → **orang tua kita**.

## Struktur teknikal

- Kanvas **1080×1920** (rotasi −90 asal dibakar masuk, bukan metadata)
- 17 klip `<video>` dari satu sumber, dipilih dengan `data-media-start`
- Caption word-level karaoke, dibina daripada transkrip whisper `medium`
- SFX disintesis dengan ffmpeg (offline, deterministik, bebas lesen)
- Satu timeline GSAP dijeda, didaftar pada `window.__timelines["main"]`

## Jana semula

```bash
npm run dev      # preview Studio
npm run check    # lint + runtime + layout + kontras
npm run render   # MP4 (belum dijalankan)
```

Video sumber tidak disimpan dalam git (320MB). Letakkan semula di
`assets/media/voxy-portrait.mp4`.
