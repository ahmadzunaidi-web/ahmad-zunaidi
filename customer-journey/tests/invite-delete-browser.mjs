import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const bundle=(await import(process.env.CJ_CHROMIUM_BUNDLE)).default;
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'text/html');res.end(await readFile(join(process.cwd(),'public',path==='/'?'index.html':path)));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CJ_CHROMIUM_PATH||await bundle.executablePath(),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']});
const origin=`http://127.0.0.1:${server.address().port}`;const errors=[];
const record={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Pelanggan · Belum lengkap',created:'2026-10-13',version:1,decision:'pending',route:'ready',canDeleteEmpty:true,docs:{},banks:[],vso:{}};
try{
 await mkdir('docs/qa',{recursive:true});
 for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});const page=await context.newPage();let role='admin',rows=[structuredClone(record)],invites=0,deleted=0,redeemed=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/api/cj/**',async route=>{const path=new URL(route.request().url()).pathname.split('/').pop();let status=200,out={ok:true};if(path==='config')out={pushEnabled:false,vapid:'',scannerConfigured:false};if(path==='me')out={role,id:'test'};if(path==='cases')out={records:rows,hasMore:false};if(path==='invite'){invites++;out={caseId:record.id,url:origin+'/#invite=synthetic'};}if(path==='document'){rows[0].documents=[{id:'test-doc',slot:'icFront',scan_status:'uploaded',size:120,mime:'image/png'}];out={ok:true,status:'uploaded'};}if(path==='delete-empty'){deleted++;rows=[];}if(path==='redeem'){redeemed++;role='customer';rows=[structuredClone(record)];}await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});});
  await page.goto(origin+'/#admin');await page.locator('[data-go="invite"]:visible').click();
  assert.equal(invites,0,'opening tab must not create a case');
  await page.locator('[data-action="generateInvite"]').click();await page.locator('#inviteLink').waitFor();assert.equal(invites,1);
  await page.locator('[data-go="cases"]:visible').click();await page.locator('[data-go="invite"]:visible').click();await page.locator('#inviteLink').waitFor();assert.equal(invites,1,'reopening tab reuses link');
  for(const lang of ['ms','en']){await page.locator(`[data-language="${lang}"]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.screenshot({path:`docs/qa/v534-invite-${width}.png`,fullPage:true});
  await page.locator('[data-go="cases"]:visible').click();await page.locator('[data-action^="deleteEmpty:"]').click();await page.waitForFunction(()=>document.querySelector('.empty'));assert.equal(deleted,1);
  await page.goto(origin+'/#invite=synthetic');await page.locator('#startApplication').waitFor();assert.equal(await page.locator('#guestIc').count(),0);
  assert.equal(redeemed,0,'invitation token must not be consumed by a page preview');
  await page.screenshot({path:`docs/qa/v534-customer-entry-${width}.png`,fullPage:true});
  await page.locator('#startApplication').click();await page.locator('[data-draft="name"]').waitFor();assert.equal(redeemed,1);assert.equal(await page.locator('[data-draft="name"]').inputValue(),'');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`docs/qa/v534-form-${width}.png`,fullPage:true});await page.goto(origin+'/#invite=synthetic');await page.locator('#startApplication').click();await page.locator('[data-draft="name"]').waitFor();assert.equal(redeemed,2,'same link can be opened again');
  await page.locator('[data-draft="name"]').fill('QA Test Customer');await page.locator('[data-draft="ic"]').fill('900101123456');await page.locator('[data-draft="phone"]').fill('01112345678');await page.locator('[data-action="step:1"]').first().click();
  await page.locator('[data-datepart="year"]').selectOption('1980');await page.locator('[data-datepart="month"]').selectOption('2');await page.locator('[data-datepart="day"]').selectOption('29');
  assert.equal(await page.locator('[data-draft="startDate"]').inputValue(),'1980-02-29');
  await page.locator('[data-datepart="year"]').selectOption('1981');assert.equal(await page.locator('[data-draft="startDate"]').inputValue(),'');
  await page.locator('[data-datepart="day"]').selectOption('28');assert.equal(await page.locator('[data-draft="startDate"]').inputValue(),'1981-02-28');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`docs/qa/v536-date-${width}.png`,fullPage:true});
  await page.locator('[data-action="step:2"]').first().click();
  await page.locator('[data-doc="icFront"]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
  await page.locator('.file').filter({hasText:'Uploaded successfully'}).waitFor();
  assert.ok((await page.locator('#app').innerText()).includes('1 / 7 uploaded'));
  assert.equal((await page.locator('#app').innerText()).includes('passed inspection'),false);
  assert.equal((await page.locator('#app').innerText()).includes('Awaiting inspection'),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`docs/qa/v536-upload-${width}.png`,fullPage:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 4 widths, BM/EN, no invite on navigation, reuse link, delete action, direct customer form, blank name, no overflow or JS errors.');
}finally{await browser.close();server.close();}
