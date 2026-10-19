/* Abang Recond Customer Journey PWA V5.8 — shell cache only; backend/network responses never cached */
const CACHE='ar-cj-v6.0.0-redesign';
const SHELL=['./','./index.html','./manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png','./typography.css','./redesign.css','./translations.js','./i18n.js',...['400','500','600','700'].map(w=>'./fonts/geist-'+w+'.woff2'),'./fonts/geist-mono-400.woff2'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ar-cj-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(/\/(api|functions|auth|storage)\//.test(url.pathname))return;
 if(req.mode==='navigate'){
   if(url.pathname.includes('/vso/'))return; // VSO PDFs rely on live generator; no offline promise
   event.respondWith(fetch(req).then(res=>res.ok?res:Promise.reject(new Error('offline'))).catch(()=>caches.match('./index.html').then(res=>res||caches.match('./offline.html'))));return;
 }
 if(!SHELL.some(entry=>new URL(entry,self.registration.scope).pathname===url.pathname))return;
 event.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
const LANGUAGE_URL=new URL('./language-preference',self.registration.scope).href;
self.addEventListener('message',event=>{if(event.data?.type==='CJ_LANGUAGE'&&['ms','en'].includes(event.data.language))event.waitUntil(caches.open(CACHE).then(c=>c.put(LANGUAGE_URL,Response.json({language:event.data.language}))));});
self.addEventListener('push',event=>{
let data={};try{data=event.data?event.data.json():{}}catch{};
const title='Abang Recond · Customer Journey';const url=new URL('./#tracker',self.registration.scope).href;
event.waitUntil((async()=>{let language='ms';try{const saved=await(await caches.open(CACHE)).match(LANGUAGE_URL);language=(await saved?.json())?.language||'ms';}catch{}const body=language==='en'?'There is a new update. Open the app to check your progress.':'Ada perkembangan baharu. Buka app untuk semak status.';
return self.registration.showNotification(title,{body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:String(data.tag||'ar-cj-progress').slice(0,100),data:{url}});})());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL('./#tracker',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
   for(const client of clients){if(client.url.startsWith(self.registration.scope)){await client.focus();try{await client.navigate(target)}catch{}return}}
   return self.clients.openWindow(target);
 }));
});
