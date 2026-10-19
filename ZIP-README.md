# WA Agent — pakej lengkap (spesifikasi + kod + panduan rebuild)

Hasil reverse engineering sistem AI chatbot WhatsApp gaya respond.io (clean-room, daripada dokumentasi awam), dan
pelaksanaan penuhnya. **Mula di sini:**

1. `docs/REBUILD-GUIDE.md` — cara menjalankan, seni bina, urutan rebuild 8 fasa, prompt untuk ejen pengekodan, senarai semak go-live.
2. `docs/respondio-ai-agent-rebuild-blueprint.md` — spesifikasi: apa respond.io buat (disahkan), had & nombor tepat, dan reka bentuk rebuild.
3. `wa-agent/` — kod (`npm ci && npm test && npm run dev`). Lihat `wa-agent/README.md`.

```bash
cd wa-agent && npm ci && npm test && npm run dev      # Node >= 22.13 ; http://localhost:3000
```

Status jujur: 138 ujian automatik lulus + ujian pelayar; **belum diuji dengan WhatsApp/Claude sebenar**.
Docs help respond.io tidak disertakan (hak cipta); sumber disenaraikan dalam blueprint §5.
