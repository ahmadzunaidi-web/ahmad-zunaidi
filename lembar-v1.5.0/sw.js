/* LEMBAR PWA: cache public offline assets only, never journal/auth/API responses. */
const CACHE = 'lembar-public-v1.5.0-redesign';
const PUBLIC_ASSETS = ['/offline.html', '/assets/lembar.css', '/assets/pwa.js', '/assets/fonts/display-700.woff2', '/assets/fonts/display-800.woff2', '/assets/fonts/body-400.woff2', '/assets/fonts/body-600.woff2', '/assets/fonts/body-700.woff2', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS.map(url => new Request(url, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lembar-public-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
// Existing tabs update only after an explicit user action; no automatic reload of an editor.
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || req.headers.has('authorization')) return;
  // Auth callbacks, config and backend traffic always use the network; never cached or queued.
  if (/^\/(auth|api)(\/|$)/.test(url.pathname) || url.pathname === '/config.json') return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
    return;
  }
  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      // Network first keeps CSS and install controls in sync with new deployments.
      try { return await fetch(req); }
      catch { return (await caches.open(CACHE)).match(url.pathname); }
    })());
  }
});
