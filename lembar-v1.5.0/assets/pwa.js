/* Shared install/update controls. No diary or token access. */
(() => {
  const installButton = document.querySelector('[data-pwa-install]');
  const updateButton = document.querySelector('[data-pwa-update]');
  const status = document.querySelector('[data-pwa-status]');
  const dialog = document.querySelector('#pwa-help');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installEvent = null, registration = null, updating = false;
  const showStatus = text => { if (status) status.textContent = text; };
  const sync = () => { if (installButton) installButton.hidden = standalone(); };
  sync();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; sync(); });
  window.addEventListener('appinstalled', () => { installEvent = null; if (installButton) installButton.hidden = true; showStatus('LEMBAR sudah dipasang.'); });
  installButton?.addEventListener('click', async () => {
    if (installEvent) {
      const prompt = installEvent; installEvent = null;
      try { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === 'accepted') installButton.hidden = true; }
      catch { showStatus('Buka menu pelayar untuk pasang LEMBAR.'); }
    } else if (dialog?.showModal) dialog.showModal();
    else showStatus('Android: menu pelayar → Pasang aplikasi / Tambah ke skrin utama. iPhone: Kongsi → Tambah ke Skrin Utama.');
  });
  document.querySelector('[data-pwa-close]')?.addEventListener('click', () => dialog?.close());
  const online = () => { showStatus(navigator.onLine ? '' : 'Tiada internet. Membuka dan menyimpan catatan memerlukan sambungan.'); };
  window.addEventListener('online', online); window.addEventListener('offline', online); online();
  const updateAvailable = () => { if (registration?.waiting && navigator.serviceWorker.controller && updateButton) updateButton.hidden = false; };
  updateButton?.addEventListener('click', () => {
    if (!registration?.waiting) return;
    if (!window.confirm('Simpan catatan dahulu. Muat semula LEMBAR untuk menggunakan versi baharu?')) return;
    updating = true; registration.waiting.postMessage({type: 'ACTIVATE_UPDATE'});
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
    navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).then(reg => {
      registration = reg; updateAvailable();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') updateAvailable(); });
      });
      // Best effort update check on returning to an open app, at most once per minute.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 60000) { lastCheck = Date.now(); reg.update().catch(() => {}); } });
    }).catch(() => showStatus('Persediaan offline belum selesai. Cuba buka semula apabila internet stabil.'));
  }
})();
