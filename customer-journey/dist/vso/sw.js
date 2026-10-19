// Static template assets only. Never cache authenticated responses or signed documents.
const CACHE='cj-v5.7-upload-21days';
// Paths are relative to this worker so the app works at / and at /journey/.
const ASSETS=['./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','../typography.css','../translations.js','../i18n.js',...['400','500','600','700'].map(w=>'../fonts/schibsted-grotesk-'+w+'.woff2'),'../fonts/ibm-plex-mono-400.woff2'].map(a=>new URL(a,self.location).pathname);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('vso-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.includes(u.pathname))return;e.respondWith(fetch(e.request).catch(()=>caches.match(u.pathname)));});
