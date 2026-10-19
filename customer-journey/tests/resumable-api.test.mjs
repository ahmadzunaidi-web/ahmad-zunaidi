import{test}from'node:test';import assert from'node:assert/strict';import{handler,sessionCookie}from'../server/api.mjs';
test('Signed upload authorization, finalization and idempotent completion',async()=>{
Object.assign(process.env,{APP_ORIGIN:'https://cj.example',SUPABASE_URL:'https://db.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'secret',SESSION_SECRET:'s'.repeat(64)});
const original=globalThis.fetch,uid='11111111-1111-4111-8111-111111111111',cid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let current=null,stored=null,allowed=true,writes=[];
globalThis.fetch=async(input,opts={})=>{const u=new URL(String(input)),p=u.pathname,m=opts.method||'GET';
if(p==='/auth/v1/user')return Response.json({id:uid,email_confirmed_at:'2026-01-01'});
if(p.endsWith('cj_take_limit'))return Response.json(true);
if(p.endsWith('cj_staff'))return Response.json([]);
if(p.endsWith('cj_cases'))return Response.json(allowed?[{id:cid,customer_id:uid,progress:{}}]:[]);
if(p.includes('/object/upload/sign/'))return Response.json({url:'/object/upload/sign/test?token=upload-token'});
if(p.endsWith('cj_documents')){if(m==='POST'){stored=JSON.parse(opts.body);current={path:stored.path};writes.push(stored);return Response.json([]);}return Response.json(current?[current]:[]);}
if(p.includes('/object/info/'))return Response.json({size:13*1024*1024,content_type:'application/pdf'});
if(p.includes('/object/sign/')&&m==='POST')return Response.json({signedURL:'/object/sign/test?token=read-token'});
if(p.includes('/object/sign/'))return new Response('%PDF-1.7\n synthetic',{status:206});
if(p.endsWith('cj_audit'))return Response.json([]);
throw new Error('Unexpected '+m+' '+p);};
async function req(route,b){return handler(new Request('https://cj.example/api/cj/'+route,{method:'POST',headers:{origin:'https://cj.example',cookie:sessionCookie('user-token').split(';')[0],'content-type':'application/json'},body:JSON.stringify(b)}));}
try{const b={caseId:cid,slot:'bankstmt1',size:13*1024*1024,mime:'application/pdf'};let r=await req('document-init',b);assert.equal(r.status,200,await r.clone().text());const init=await r.json();assert.equal(init.token,'upload-token');assert.equal(init.endpoint,'https://db.storage.supabase.co/storage/v1/upload/resumable/sign');assert.ok(init.path.startsWith(cid+'/'));
assert.equal((await req('document-complete',{...b,ticket:init.ticket+'tampered'})).status,400);
r=await req('document-complete',{...b,ticket:init.ticket});assert.equal(r.status,200,await r.clone().text());assert.equal(stored.size,b.size);assert.equal(stored.scan_status,'uploaded');assert.equal((await req('document-complete',{...b,ticket:init.ticket})).status,200);assert.equal(writes.length,1);
allowed=false;assert.equal((await req('document-init',b)).status,404);allowed=true;assert.equal((await req('document-init',{...b,slot:'other'})).status,400);assert.equal((await req('document-init',{...b,mime:'text/html'})).status,400);
}finally{globalThis.fetch=original;}
});
