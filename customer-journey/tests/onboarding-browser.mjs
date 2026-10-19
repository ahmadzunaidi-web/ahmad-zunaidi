import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const bundle=require(process.env.CJ_CHROMIUM_BUNDLE);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'text/html');res.end(await readFile(join(process.cwd(),'public',path==='/'?'index.html':path)));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process')});
const origin=`http://127.0.0.1:${server.address().port}`;const errors=[];
try{
 await mkdir('docs/qa',{recursive:true});
 for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  const page=await context.newPage();let subscriptions=0,permissions=0,fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.permissionRequests=0;window.Notification={permission:'default',requestPermission:async()=>{window.permissionRequests++;window.Notification.permission='granted';return 'granted';}};
   window.PushManager=class{};
   Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({}),ready:Promise.resolve({active:{postMessage(){}},pushManager:{getSubscription:async()=>({toJSON:()=>({endpoint:'https://push.example.test/sub',keys:{p256dh:'test',auth:'test'}})})}})}});
  });
  await page.route('**/api/cj/**',async route=>{const path=new URL(route.request().url()).pathname.split('/').pop();let status=200,out={ok:true};if(path==='config')out={pushEnabled:true,vapid:'AQ'};if(path==='me'){status=401;out={error:'Sila log masuk.'};}if(path==='progress')out={message:'Progress tersedia',steps:[{label:'Permohonan pembiayaan',complete:true}]};if(path==='tracker-subscribe'){subscriptions++;if(fail){status=503;out={error:'Sila cuba lagi.'};}}await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});});
  await page.goto(origin);await page.locator('#install-heading').waitFor();
  assert.equal(await page.locator('#landingInstall').isVisible(),false);
  assert.equal(await page.locator('.install-device').count(),2);
  for(const lang of ['ms','en']){
   await page.locator(`[data-language="${lang}"]`).click();
   assert.ok((await page.locator('#install-heading').innerText()).includes(lang==='ms'?'Pasang':'Install'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow: ${width} ${lang}`);
  }
  await page.locator('[data-language="ms"]').click();
  await page.locator('[data-action="landingNotify"]').click();
  await page.locator('#landingNotifyStatus').filter({hasText:'Semak nombor IC dahulu'}).waitFor();
  assert.equal(await page.evaluate(()=>permissionRequests),0);assert.equal(subscriptions,0);
  await page.locator('#guestIc').fill('900101123456');
  await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);});
  assert.equal(await page.locator('#guestIc').inputValue(),'900101123456');assert.equal(await page.locator('#landingInstall').isVisible(),true);
  await page.locator('#guestForm button').click();await page.locator('#guestNotify').waitFor();
  fail=true;await page.locator('#guestNotify').click();await page.locator('#landingNotifyStatus').filter({hasText:'Notifikasi belum diaktifkan.'}).waitFor();assert.equal(subscriptions,1);
  fail=false;await page.locator('#guestNotify').click();await page.locator('#landingNotifyStatus').filter({hasText:'telah diaktifkan'}).waitFor();assert.equal(subscriptions,2);
  if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/qa/customer-install-landing-390.png',fullPage:true});}
  await context.close();
 }
 // iPhone browser must instruct Home Screen installation without requesting permission.
 const c=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',serviceWorkers:'block'});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/cj/**',r=>{const path=new URL(r.request().url()).pathname.split('/').pop();return r.fulfill({status:path==='me'?401:200,contentType:'application/json',body:JSON.stringify(path==='config'?{pushEnabled:true,vapid:'AQ'}:path==='progress'?{message:'Progress tersedia',steps:[]}:{error:'Sila log masuk.'})});});await p.goto(origin);await p.locator('#guestIc').fill('900101123456');await p.locator('#guestForm button').click();await p.locator('#guestNotify').click();await p.locator('#landingNotifyStatus').filter({hasText:'pasang melalui Safari'}).waitFor();await c.close();
 assert.deepEqual(errors,[]);console.log('PASS: BM/EN landing at 320/390/768/1280px, install event preserves IC, permission guard, failed/successful subscription, iPhone Home Screen guidance. Synthetic API and push; no real-device delivery test.');
}finally{await browser.close();server.close();}
