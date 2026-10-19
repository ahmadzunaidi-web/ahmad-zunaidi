import{readFileSync}from'node:fs';import{createClient}from'@supabase/supabase-js';import{randomUUID}from'node:crypto';import{handler,sessionCookie}from'../server/api.mjs';
if(!process.argv[2])throw new Error('Supply private environment JSON path');Object.assign(process.env,JSON.parse(readFileSync(process.argv[2])));
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const check=r=>{if(r.error)throw r.error;return r.data;};let uid,cid,path;
try{
const email='cj-upload-qa-'+randomUUID()+'@example.invalid',password=randomUUID()+'Aa!';uid=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
cid=check(await admin.from('cj_cases').insert({customer_id:uid,progress:{route:'ready',decision:'pending'}}).select('id'))[0].id;
const session=check(await client.auth.signInWithPassword({email,password})).session;
const api=async(route,b)=>{const r=await handler(new Request(process.env.APP_ORIGIN+'/api/cj/'+route,{method:'POST',headers:{origin:process.env.APP_ORIGIN,cookie:sessionCookie(session.access_token).split(';')[0],'content-type':'application/json'},body:JSON.stringify(b)}),{ip:'192.0.2.99'});const out=await r.json();if(!r.ok)throw new Error(route+': '+JSON.stringify(out));return out;};
const bytes=Buffer.alloc(13*1024*1024,32);bytes.write('%PDF-1.7\n% synthetic upload test\n');
const init=await api('document-init',{caseId:cid,slot:'bankstmt1',size:bytes.length,mime:'application/pdf'});path=init.path;
const headers={'Tus-Resumable':'1.0.0','x-signature':init.token},meta={bucketName:'cj-documents',objectName:path,contentType:'application/pdf',cacheControl:'3600'};
let r=await fetch(init.endpoint,{method:'POST',headers:{...headers,'Upload-Length':String(bytes.length),'Upload-Metadata':Object.entries(meta).map(([k,v])=>k+' '+Buffer.from(v).toString('base64')).join(',')}});if(!r.ok)throw new Error('TUS init '+r.status+' '+await r.text());
const url=new URL(r.headers.get('location'),init.endpoint);let offset=0;
while(offset<bytes.length){if(offset){const h=await fetch(url,{method:'HEAD',headers});if(Number(h.headers.get('upload-offset'))!==offset)throw new Error('Resume offset mismatch');}
const end=Math.min(offset+6*1024*1024,bytes.length);r=await fetch(url,{method:'PATCH',headers:{...headers,'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:bytes.subarray(offset,end)});if(!r.ok)throw new Error('TUS chunk '+r.status+' '+await r.text());offset=Number(r.headers.get('upload-offset'));}
await api('document-complete',{caseId:cid,slot:'bankstmt1',ticket:init.ticket});await api('document-complete',{caseId:cid,slot:'bankstmt1',ticket:init.ticket});
const row=check(await admin.from('cj_documents').select('size,mime,scan_status').eq('case_id',cid))[0];if(Number(row.size)!==bytes.length||row.scan_status!=='uploaded')throw new Error('Metadata mismatch');console.log('PASS: live 13MB PDF, signed TUS upload, HEAD resume, authenticated finalization, idempotent completion.');
}finally{if(path)check(await admin.storage.from('cj-documents').remove([path]));if(cid)check(await admin.from('cj_cases').delete().eq('id',cid));if(uid)check(await admin.auth.admin.deleteUser(uid));console.log('Synthetic test files, case and account cleaned up.');}
