# Alphard SC Delivery: Ir Faizal

Video car delivery (9:16, 33.5 s, senyap + SFX) dibina dengan [HyperFrames](https://hyperframes.heygen.com).

- **Pelan edit, transcript, EDL dan SFX map:** [`EDIT-PLAN.md`](EDIT-PLAN.md)
- **Komposisi:** [`index.html`](index.html)

```bash
npm install
npm run prep      # muat turun footage dari Google Drive dan tukar ke 1080x1920 tanpa audio
npm run check     # lint + runtime + layout + contrast
npm run preview   # render draf → preview/
npm run render    # render FINAL → out/  (hanya selepas preview diluluskan)
```

Footage, preview dan output tidak di-commit (lihat `.gitignore`). `npm run prep` menjana semula semuanya.
