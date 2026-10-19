import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handler,sessionCookie} from '../server/api.mjs';
const uid='11111111-1111-4111-8111-111111111111',cid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('BFF contract audit with synthetic Supabase responses (not live)',async t=>{
Object.assign(process.env,{APP_ORIGIN:'https://cj.example',SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SESSION_SECRET:'s'.repeat(64),TRACKER_LOOKUP_SECRET:'t'.repeat(64)});
const original=globalThis.fetch;let staff=true,aal='aal2',calls=[],revoked=false;
const user={id:uid,email:'customer@customer-journey.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated'};
globalThis.fetch=async(input,opts={})=>{const u=new URL(String(input));const path=u.pathname;let body;try{body=JSON.parse(opts.body)}catch{}calls.push({path,method:opts.method||'GET',body,query:u.search,headers:opts.headers});
if(path==='/auth/v1/user'||path==='/auth/v1/admin/users/'+uid)return Response.json(user);
if(path==='/auth/v1/logout')return new Response(null,{status:204});
if(path==='/auth/v1/admin/generate_link')return Response.json({...user,hashed_token:'synthetic-hash',verification_type:'recovery',action_link:'https://example.invalid'});
if(path.endsWith('/cj_take_limit'))return Response.json(true);
if(path.endsWith('/cj_staff'))return Response.json(staff?[{active:true}]:[]);
if(path.endsWith('/cj_cases'))return Response.json([{id:cid,customer_id:uid,progress:{decision:'pending',route:'ready'},version:1,created_at:'2026-10-12T00:00:00Z'}]);
if(path.endsWith('/cj_invites')&&(!opts.method||opts.method==='GET'))return Response.json(revoked?[]:[{type:'access',customer_id:uid}]);
if(path.endsWith('/cj_invites')||path.endsWith('/cj_audit'))return Response.json([]);
if(path==='/auth/v1/verify')return Response.json({access_token:'new-session',token_type:'bearer',expires_in:3600,refresh_token:'refresh',user});
if(path.endsWith('/cj_applications'))return Response.json([{data:{name:'Test Customer'}}]);
if(path.endsWith('/cj_documents'))return Response.json(opts.method==='POST'?[]:[{path:'qa/test.pdf',scan_status:'uploaded'}]);
if(path.startsWith('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/cj-documents/qa/test.pdf?token=synthetic'});
if(path.startsWith('/storage/v1/object/'))return Response.json({Key:'cj-documents/qa/test.pdf',Id:'test-doc'});
if(path.endsWith('/cj_delete_empty_case'))return new Response(null,{status:204});
if(path.endsWith('/cj_draft'))return new Response(null,{status:204});
throw new Error('Unexpected synthetic request '+path);
};
const jwt=()=>['e30',Buffer.from(JSON.stringify({sub:uid,aal,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
async function req(path,body,auth=true){const headers={origin:process.env.APP_ORIGIN};if(auth)headers.cookie=sessionCookie(jwt()).split(';')[0];if(body!==undefined)headers['content-type']='application/json';return handler(new Request(process.env.APP_ORIGIN+'/api/cj/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),{ip:'192.0.2.10'});}
try{
await t.test('Unauthenticated private route fails closed',async()=>{assert.equal((await req('cases',undefined,false)).status,401)});
await t.test('Staff password session does not require MFA and can issue customer links',async()=>{aal='aal1';const me=await req('me');assert.equal(me.status,200);assert.equal((await me.json()).needsMfa,false);assert.equal((await req('invite',{caseId:cid})).status,200);aal='aal2';});
await t.test('Existing-case invite uses same Auth user and no duplicate case',async()=>{calls=[];const r=await req('invite',{caseId:cid});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).caseId,cid);const link=calls.find(x=>x.path.includes('generate_link'));assert.equal(link.body.type,'recovery');assert.equal(link.body.email,user.email);assert.equal(calls.some(x=>x.path.endsWith('cj_cases')&&x.method==='POST'),false);assert.equal(calls.some(x=>x.path.endsWith('cj_invites')&&x.method==='PATCH'),false);const invite=calls.find(x=>x.path.endsWith('cj_invites')&&x.method==='POST');assert.equal(invite.body.type,'access');assert.equal(invite.body.expires_at,'infinity');});
await t.test('Reusable customer link renews sessions repeatedly without consuming the shared token',async()=>{calls=[];for(let i=0;i<2;i++){const r=await req('redeem',{token:'shared-long-lived-capability'},false);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.match(r.headers.get('set-cookie'),/Max-Age=1800/);}assert.equal(calls.filter(x=>x.path==='/auth/v1/verify').length,2);assert.equal(calls.filter(x=>x.path.endsWith('cj_invites')&&x.method==='PATCH').length,0);assert.ok(calls.filter(x=>x.path==='/auth/v1/verify').every(x=>x.body.token_hash==='synthetic-hash'));});
await t.test('Revoked persistent link cannot create a customer session',async()=>{calls=[];revoked=true;assert.equal((await req('redeem',{token:'revoked-link'},false)).status,401);assert.equal(calls.some(x=>x.path==='/auth/v1/verify'||x.path==='/auth/v1/admin/generate_link'),false);revoked=false;});
await t.test('Staff delete routes through the atomic guarded RPC',async()=>{calls=[];staff=true;assert.equal((await req('delete-empty',{caseId:cid,version:1})).status,200);const call=calls.find(c=>c.path.endsWith('/cj_delete_empty_case'));assert.deepEqual(call.body,{cid,expected:1});assert.equal(calls.some(c=>c.method==='DELETE'),false);});
await t.test('Delete rejects unauthenticated users, customers and invalid versions',async()=>{assert.equal((await req('delete-empty',{caseId:cid,version:1},false)).status,401);staff=false;assert.equal((await req('delete-empty',{caseId:cid,version:1})).status,403);staff=true;assert.equal((await req('delete-empty',{caseId:cid,version:null})).status,400);});
await t.test('Staff can immediately open uploaded documents; customers cannot request download links',async()=>{staff=true;assert.equal((await req('document-url',{caseId:cid,documentId:'test-doc'})).status,200);staff=false;assert.equal((await req('document-url',{caseId:cid,documentId:'test-doc'})).status,403);});
await t.test('Uploads are stored as received without entering a scanner queue',async()=>{calls=[];staff=false;const fd=new FormData();fd.set('caseId',cid);fd.set('slot','icFront');fd.set('file',new File([Buffer.from('89504e470d0a1a0a','hex')],'qa.png',{type:'image/png'}));const r=await handler(new Request(process.env.APP_ORIGIN+'/api/cj/document',{method:'POST',headers:{origin:process.env.APP_ORIGIN,cookie:sessionCookie(jwt()).split(';')[0]},body:fd}),{ip:'192.0.2.10'});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).status,'uploaded');assert.equal(calls.find(c=>c.path.endsWith('cj_documents')&&c.method==='POST').body.scan_status,'uploaded');});
await t.test('Customer cannot generate links',async()=>{staff=false;assert.equal((await req('invite',{caseId:cid})).status,403);});
await t.test('Draft includes vehicle preference and excludes forged keys',async()=>{calls=[];assert.equal((await req('draft',{caseId:cid,application:{name:'Test',model:'Voxy',colour:'Putih',year:'2023',isAdmin:true}})).status,200);assert.deepEqual(calls.find(x=>x.path.endsWith('cj_draft')).body.a,{model:'Voxy',year:'2023',colour:'Putih',name:'Test'});});
await t.test('Missing privacy version fails before submission',async()=>{calls=[];assert.equal((await req('apply',{caseId:cid,application:{}})).status,400);assert.equal(calls.some(x=>x.path.endsWith('cj_apply')),false);});
await t.test('Invalid pagination is rejected, never silently repeats last page',async()=>{for(const p of ['101','-1','0.5','NaN'])assert.equal((await req('cases?page='+p)).status,400);});
await t.test('Logout calls server Auth logout and clears signed cookie',async()=>{calls=[];const r=await req('logout',{});assert.equal(r.status,200);assert.ok(calls.some(x=>x.path==='/auth/v1/logout'&&x.query.includes('scope=local')));assert.match(r.headers.get('set-cookie'),/Max-Age=0/);});
}finally{globalThis.fetch=original;}
});
