self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Network only: no customer messages, tokens, documents or API responses cached.

// Web Push (RC4). Payload: {title, body, url, tag}. The server decides what text is included (hide_preview).
self.addEventListener('push',e=>{
 let d={};try{d=e.data?e.data.json():{}}catch{}
 const title=String(d.title||'KERJA SENDIRI').slice(0,80);
 e.waitUntil(self.registration.showNotification(title,{
  body:String(d.body||'').slice(0,200),
  tag:d.tag||'ks',renotify:true,
  icon:'/icon-192.png',badge:'/icon-192.png',
  data:{url:typeof d.url==='string'&&d.url.startsWith('/')?d.url:'/'}
 }));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const url=(e.notification.data&&e.notification.data.url)||'/';
 e.waitUntil((async()=>{
  const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const c of all){
   if(new URL(c.url).origin===self.location.origin){
    try{await c.focus()}catch{}
    c.postMessage({type:'open',url});return;
   }
  }
  await self.clients.openWindow(url);
 })());
});
