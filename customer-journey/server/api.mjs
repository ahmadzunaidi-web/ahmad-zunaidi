import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {uploadPostCommit} from './upload-postcommit.mjs';
import {pick,applicantKeys,progressKeys,vsoKeys,validateApplicant,validateProgress,validateFile,validateSubscription,publicProgress,stripJpegMetadata} from './domain.mjs';
const env=k=>globalThis.Netlify?.env.get(k)??process.env[k];
const json=(x,status=200,extra={})=>Response.json(x,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
const cookieName='__Host-cj';
export function sessionCookie(token,name=cookieName){if(!token)return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;const payload=Buffer.from(JSON.stringify({token,expires:Date.now()+1800000})).toString('base64url');return `${name}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`;}
function sign(payload){const key=env('SESSION_SECRET');if(!key||key.length<32)throw Object.assign(new Error('SESSION_SECRET belum dikonfigurasi'),{status:503});return createHmac('sha256',key).update(payload).digest('base64url');}
export function readSession(value){if(!value)return null;const [payload,signature]=value.split('.');if(!payload||!signature)return null;const expected=sign(payload);if(expected.length!==signature.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;try{const s=JSON.parse(Buffer.from(payload,'base64url').toString());return s.expires>Date.now()?s.token:null;}catch{return null;}}
// Customer Journey is served at https://abangrecond.com/journey (proxied from this site) and still at APP_ORIGIN.
export const publicUrl=()=>String(env('APP_PUBLIC_URL')||'https://abangrecond.com/journey').replace(/\/+$/,'');
export function allowedOrigins(){const list=[env('APP_ORIGIN'),new URL(publicUrl()).origin,...String(env('APP_ALLOWED_ORIGINS')||'').split(',')].map(x=>String(x||'').trim().replace(/\/+$/,'')).filter(Boolean);return new Set(list);}
export function csrf(req){const allowed=allowedOrigins();if(!env('APP_ORIGIN')||!allowed.has(new URL(req.url).origin))throw Object.assign(new Error('Origin configuration mismatch'),{status:503});if(req.method==='GET')return;const site=req.headers.get('sec-fetch-site'),origin=req.headers.get('origin');if(site==='cross-site'||site==='same-site')throw Object.assign(new Error('Forbidden origin'),{status:403});if(origin?!allowed.has(origin):site!=='same-origin')throw Object.assign(new Error('Forbidden origin'),{status:403});}
export function clients(token){const url=env('SUPABASE_URL'),key=env('SUPABASE_PUBLISHABLE_KEY');if(!url||!key)throw Object.assign(new Error('Backend belum dikonfigurasi'),{status:503});return {db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}}),admin:()=>{const secret=env('SUPABASE_SERVICE_ROLE_KEY');if(!secret)throw Object.assign(new Error('Server configuration missing'),{status:503});return createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});}};}
async function checked(p){const r=await p;if(r.error){const msg=r.error.message||'Backend error';throw Object.assign(new Error(msg),{status:/Conflict/.test(msg)?409:/Forbidden|permission denied/.test(msg)?403:400});}return r.data;}
async function body(req){const raw=await req.text();if(raw.length>200000)throw Object.assign(new Error('Request too large'),{status:413});return JSON.parse(raw||'{}');}
async function staff(db){return Boolean((await checked(db.from('cj_staff').select('active')))?.some(x=>x.active));}
async function readableCase(db,id){const rows=await checked(db.from('cj_cases').select('*').eq('id',id));if(!rows.length)throw Object.assign(new Error('Kes tidak dijumpai'),{status:404});return rows[0];}
async function audit(admin,user,caseId,action){await checked(admin.from('cj_audit').insert({actor_id:user,case_id:caseId,action}));}
// Readable download name, e.g. AIMI-BINTI-MOHAMAD_icFront.jpg (stored objects have no extension).
export function documentFileName(name,slot,mime,caseId){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif','application/pdf':'pdf'}[mime]||'bin';const who=String(name||'').normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).toUpperCase()||String(caseId||'kes').slice(0,8);const part=String(slot||'dokumen').replace(/[^A-Za-z0-9]/g,'').slice(0,30)||'dokumen';return `${who}_${part}.${ext}`;}
export async function handler(req,context={}){
try{
const path=new URL(req.url).pathname.replace(/^(?:\/journey)?\/api\/cj\/?/,'');
if(path==='config'&&req.method==='GET')return json({configured:!!(env('SUPABASE_URL')&&env('SUPABASE_PUBLISHABLE_KEY')&&env('SUPABASE_SERVICE_ROLE_KEY')&&env('APP_ORIGIN')&&env('SESSION_SECRET')?.length>=32&&env('TRACKER_LOOKUP_SECRET')?.length>=32),vapid:env('VAPID_PUBLIC_KEY')||'',pushEnabled:env('PUSH_ENABLED')==='true'});
csrf(req);
const token=readSession((req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1));
const {db,admin}=clients(token);
if(path==='public-reviews'&&req.method==='GET'){
if(env('PUBLIC_REVIEWS_ENABLED')!=='true')return json({reviews:[]});
const a=admin();const rows=await checked(a.from('cj_public_reviews').select('rating,review,vehicle_model,display_name,reviewed_at,photo_path').order('reviewed_at',{ascending:false}).limit(50));
const paths=rows.map(r=>r.photo_path).filter(Boolean);let signed=[];if(paths.length){const r=await a.storage.from('cj-documents').createSignedUrls(paths,21600);signed=r.data||[];}
const urlFor=p=>signed.find(x=>x.path===p&&!x.error)?.signedUrl||null;
return json({reviews:rows.map(({photo_path,...r})=>({...r,photo_url:photo_path?urlFor(photo_path):null}))},200,{'Cache-Control':'no-store'});
}
if(req.method!=='GET'){
const ipHash=createHash('sha256').update([context.ip||'unknown',req.headers.get('x-nf-client-connection-ip')||''].join('|')).digest('hex');
const allowed=await checked(admin().rpc('cj_take_limit',{key:`${['login','redeem','progress','tracker-subscribe'].includes(path)?'auth':'api'}:${ipHash}`,max_count:['login','redeem','progress','tracker-subscribe'].includes(path)?8:90}));
if(!allowed)return json({error:'Terlalu banyak cubaan. Cuba semula dalam satu minit.'},429);
}
if(path==='progress'&&req.method==='POST'){
const b=await body(req),ic=String(b.ic||'').replace(/[- ]/g,'');if(!/^\d{12}$/.test(ic))throw new Error('Masukkan IC 12 digit');
const lookupKey=env('TRACKER_LOOKUP_SECRET');if(!lookupKey||lookupKey.length<32)throw Object.assign(new Error('Tracker belum dikonfigurasi'),{status:503});
const digest=createHmac('sha256',lookupKey).update(ic).digest('hex');const a=admin();const row=(await checked(a.from('cj_tracker_index').select('case_id').eq('ic_hmac',digest).order('created_at',{ascending:false}).limit(1)))[0];
if(!row)return json({error:'Tiada progress yang boleh dipaparkan. Semak dengan SA.'},404);
const c=(await checked(a.from('cj_cases').select('progress').eq('id',row.case_id)))[0];if(!c||!c.progress.submitted)return json({error:'Tiada progress yang boleh dipaparkan.'},404);
return json(publicProgress(c),200,{'Set-Cookie':sessionCookie('tracker:'+row.case_id,'__Host-cj-tracker')});
}
if(path==='tracker-subscribe'&&req.method==='POST'){
const cap=readSession((req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-cj-tracker='))?.slice('__Host-cj-tracker='.length));
if(!cap?.startsWith('tracker:'))return json({error:'Semak IC semula sebelum aktifkan push.'},401);
if(env('PUSH_ENABLED')!=='true')throw new Error('Push belum diaktifkan');const b=await body(req);validateSubscription(b.subscription);const a=admin();const c=(await checked(a.from('cj_cases').select('customer_id').eq('id',cap.slice(8))))[0];if(!c)return json({error:'Kes tidak ditemui'},404);
await checked(a.from('cj_push_subscriptions').upsert({user_id:c.customer_id,endpoint:b.subscription.endpoint,keys:b.subscription.keys,active:true},{onConflict:'endpoint'}));return json({ok:true});
}
if(path==='login'&&req.method==='POST'){
const b=await body(req);const r=await db.auth.signInWithPassword({email:b.email,password:b.password});if(r.error||!r.data.user?.email_confirmed_at)return json({error:'Email atau kata laluan tidak sah.'},401);
return json({ok:true},200,{'Set-Cookie':sessionCookie(r.data.session.access_token)});
}
if(path==='redeem'&&req.method==='POST'){
const b=await body(req);if(typeof b.token!=='string'||!b.token)throw new Error('Pautan akses tidak sah');
const tokenHash=createHash('sha256').update(b.token).digest('hex');const a=admin();
const entry=(await checked(a.from('cj_invites').select('type,customer_id').eq('token_hash',tokenHash).is('used_at',null).gt('expires_at',new Date().toISOString())))[0];
if(!entry)return json({error:'Pautan tidak sah atau telah dibatalkan. Hubungi salesman.'},401);
let r;
if(entry.type==='access'){
 const cases=await checked(a.from('cj_cases').select('id').eq('customer_id',entry.customer_id).limit(1));if(!cases.length)return json({error:'Pautan tidak sah atau telah dibatalkan. Hubungi salesman.'},401);
 const owner=await a.auth.admin.getUserById(entry.customer_id);if(owner.error||!owner.data.user?.email)return json({error:'Pautan tidak sah atau telah dibatalkan. Hubungi salesman.'},401);
 // Renew a provider OTP server-side on every access. The shared capability is never consumed.
 const link=await a.auth.admin.generateLink({type:'recovery',email:owner.data.user.email});
 if(link.error||link.data.user?.id!==entry.customer_id||!link.data.properties?.hashed_token)throw Object.assign(new Error('Akses belum tersedia. Cuba semula.'),{status:503});
 r=await db.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'recovery'});
}else{
 const claimed=await checked(a.from('cj_invites').update({used_at:new Date().toISOString()}).eq('token_hash',tokenHash).is('used_at',null).gt('expires_at',new Date().toISOString()).select('type'));if(!claimed.length)return json({error:'Pautan tidak sah atau telah dibatalkan. Hubungi salesman.'},401);
 r=await db.auth.verifyOtp({token_hash:b.token,type:entry.type});
}
if(r.error||!r.data.session||r.data.user?.id!==entry.customer_id)return json({error:'Akses belum tersedia. Cuba semula.'},503);
return json({ok:true},200,{'Set-Cookie':sessionCookie(r.data.session.access_token)});
}
if(!token)return json({error:'Sila log masuk.'},401);
const userResult=await db.auth.getUser(token);const user=userResult.data.user;
if(userResult.error||!user||!user.email_confirmed_at)return json({error:'Sesi tamat. Sila log masuk semula.'},401,{'Set-Cookie':sessionCookie('')});
const isStaff=await staff(db);
if(path==='logout'&&req.method==='POST'){const result=await admin().auth.admin.signOut(token,'local');if(result.error)return json({error:'Log keluar tidak berjaya. Cuba semula.'},503,{'Set-Cookie':sessionCookie('')});return json({ok:true},200,{'Set-Cookie':sessionCookie('')});}
if(path==='me'&&req.method==='GET')return json({id:user.id,role:isStaff?'admin':'customer',needsMfa:false});
if(path==='cases'&&req.method==='GET'){
const page=Number(new URL(req.url).searchParams.get('page')||0);if(!Number.isSafeInteger(page)||page<0||page>100)throw Object.assign(new Error('Invalid page'),{status:400});
const rows=await checked(db.from('cj_cases').select('*').order('created_at',{ascending:false}).range(page*100,page*100+99));
if(!rows.length)return json({records:[],hasMore:false});const ids=rows.map(c=>c.id);
const [apps,docs,reviews,vsos,banks]=await Promise.all([
checked(db.from('cj_applications').select('case_id,data').in('case_id',ids)),
checked(db.from('cj_documents').select('case_id,id,slot,scan_status,size,mime,created_at').in('case_id',ids)),
checked(db.from('cj_reviews').select('*').in('case_id',ids)),
isStaff?checked(db.from('cj_vso').select('case_id,data').in('case_id',ids)):Promise.resolve([]),
isStaff?checked(db.from('cj_banks').select('case_id,data').in('case_id',ids)):Promise.resolve([])]);
const records=rows.map(c=>{const app=apps.find(a=>a.case_id===c.id)?.data||{},documents=docs.filter(d=>d.case_id===c.id),review=reviews.find(r=>r.case_id===c.id);
const canDeleteEmpty=isStaff&&!apps.some(a=>a.case_id===c.id)&&!documents.length&&!review&&!vsos.some(v=>v.case_id===c.id)&&!banks.some(b=>b.case_id===c.id)&&JSON.stringify(Object.keys(c.progress).sort())===JSON.stringify(['decision','route'])&&c.progress.decision==='pending'&&c.progress.route==='ready';
return {canDeleteEmpty,...app,name:app.name||'Pelanggan · Belum lengkap',...c.progress,id:c.id,created:c.created_at.slice(0,10),version:c.version,vso:isStaff?vsos.find(v=>v.case_id===c.id)?.data||{}:{ready:!!c.progress.vsoReady},banks:isStaff?banks.find(b=>b.case_id===c.id)?.data||[]:(c.progress.bankSubmitted?[{status:'submitted'}]:[]),docs:Object.fromEntries(documents.filter(d=>['uploaded','clean','pending','error'].includes(d.scan_status)).map(d=>[d.slot,'Dokumen diterima'])),documents,review:review?{rating:review.rating,review:review.review,feedback:review.feedback,publicConsent:review.public_consent,approved:review.approved,created_at:review.created_at,hasPhoto:!!review.photo_path}:undefined};});
return json({records,hasMore:rows.length===100});
}
if(path==='delete-empty'&&req.method==='POST'){
if(!isStaff)return json({error:'Forbidden'},403);const b=await body(req);
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.caseId||'')||!Number.isInteger(b.version)||b.version<1)return json({error:'Rekod tidak sah.'},400);
await checked(db.rpc('cj_delete_empty_case',{cid:b.caseId,expected:b.version}));return json({ok:true});
}
if(path==='invite'&&req.method==='POST'){
if(!isStaff)return json({error:'Forbidden'},403);const b=await body(req);let existingCase;if(b.caseId){existingCase=await readableCase(db,b.caseId);const owner=await admin().auth.admin.getUserById(existingCase.customer_id);if(owner.error||!owner.data.user?.email)throw new Error('Akaun pelanggan tidak tersedia');b.email=owner.data.user.email;}b.email=b.email||randomUUID()+'@customer-journey.invalid';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||''))throw new Error('Email sah diperlukan');
const a=admin();let type=existingCase?'recovery':'invite';let r=await a.auth.admin.generateLink({type,email:b.email,options:{redirectTo:publicUrl()+'/'}});if(r.error){type='recovery';r=await a.auth.admin.generateLink({type,email:b.email,options:{redirectTo:publicUrl()+'/'}});}if(r.error)throw new Error('Jemputan tidak dapat dicipta. Semak akaun atau email pelanggan.');
const uid=r.data.user.id;if(existingCase&&uid!==existingCase.customer_id)throw new Error('Customer identity mismatch');let c=existingCase||(await checked(a.from('cj_cases').select('id').eq('customer_id',uid).limit(1)))[0];
if(!c)c=(await checked(a.from('cj_cases').insert({customer_id:uid}).select('id')))[0];
const accessToken=randomBytes(32).toString('base64url');
await checked(a.from('cj_invites').insert({token_hash:createHash('sha256').update(accessToken).digest('hex'),customer_id:uid,type:'access',expires_at:'infinity'}));await audit(a,user.id,c.id,'invite_created');
return json({caseId:c.id,url:`${publicUrl()}/#invite=${encodeURIComponent(accessToken)}`});
}
if(path==='save'&&req.method==='POST'){
if(!isStaff)return json({error:'Forbidden'},403);const b=await body(req);const p=pick(b.record,progressKeys);p.vsoReady=!!b.record.vso?.ready;p.bankSubmitted=!!b.record.banks?.length;validateProgress(p);
const banks=b.record.banks||[];if(banks.length>20||banks.some(x=>!x.name||!x.date||Object.values(x).some(v=>typeof v!=='string'||v.length>400)))throw new Error('Submission bank tidak sah');
await checked(db.rpc('cj_save',{cid:b.record.id,expected:b.record.version,p,v:pick(b.record.vso,vsoKeys),b:banks}));return json({ok:true});
}
if(path==='vso-bridge'&&req.method==='GET'){
if(!isStaff)return json({error:'Forbidden'},403);const id=new URL(req.url).searchParams.get('caseId');await readableCase(db,id);
const app=(await checked(db.from('cj_applications').select('data').eq('case_id',id)))[0]?.data||{};
const v=(await checked(db.from('cj_vso').select('data').eq('case_id',id)))[0]?.data||{};
return json({caseId:id,dealer:v.dealer,customer:{name:app.name,ic:app.ic,address:app.mailAddress||app.currentAddress||''},salesman:pick(v,vsoKeys)});
}
if(path==='export-own'&&req.method==='GET'){
const id=new URL(req.url).searchParams.get('caseId');const c=await readableCase(db,id);
if(c.customer_id!==user.id)return json({error:'Forbidden'},403);
const app=(await checked(db.from('cj_applications').select('data,notice_version,consent_at').eq('case_id',id)))[0];
const review=(await checked(db.from('cj_reviews').select('rating,review,feedback,public_consent,consent_version,consent_at,created_at').eq('case_id',id)))[0];
return json({application:app,progress:c.progress,review});}
if(path==='draft'&&req.method==='POST'){const b=await body(req);await checked(db.rpc('cj_draft',{cid:b.caseId,a:pick(b.application,applicantKeys)}));return json({ok:true});}
if(path==='apply'&&req.method==='POST'){
const b=await body(req),c=await readableCase(db,b.caseId);if(c.customer_id!==user.id)return json({error:'Forbidden'},403);
if(!env('TRACKER_LOOKUP_SECRET')||env('TRACKER_LOOKUP_SECRET').length<32)throw Object.assign(new Error('Tracker belum dikonfigurasi'),{status:503});
if(!c.progress.submitted){if(b.noticeVersion!=='privacy-v1')throw new Error('Sila baca dan setuju notis privasi dahulu.');const a=pick(b.application,applicantKeys);validateApplicant(a);await checked(db.rpc('cj_apply',{cid:b.caseId,a,notice:b.noticeVersion}));}
const stored=(await checked(db.from('cj_applications').select('data').eq('case_id',b.caseId)))[0];await indexCase(admin(),b.caseId,stored.data.ic);return json({ok:true});
}
if(path==='review-photo'&&req.method==='POST'){
const data=await req.formData();const id=String(data.get('caseId')||''),file=data.get('file');const c=await readableCase(db,id);
if(c.customer_id!==user.id)return json({error:'Hanya pelanggan boleh memuat naik gambar review.'},403);
if(!c.progress.delivered)throw new Error('Gambar review dibuka selepas kereta diserahkan.');
const existing=(await checked(db.from('cj_reviews').select('photo_path').eq('case_id',id)))[0];if(!existing)throw new Error('Hantar review dahulu sebelum gambar.');
if(!file||typeof file.arrayBuffer!=='function'||file.size>4194304)throw new Error('Had gambar 4MB');
const bytes=stripJpegMetadata(Buffer.from(await file.arrayBuffer()));validateFile(bytes,'image/jpeg');
const a=admin(),photo=`reviews/${id}/${randomUUID()}.jpg`;
await checked(a.storage.from('cj-documents').upload(photo,bytes,{contentType:'image/jpeg',upsert:false}));
try{await checked(a.from('cj_reviews').update({photo_path:photo}).eq('case_id',id));}catch(e){await a.storage.from('cj-documents').remove([photo]);throw e;}
if(existing.photo_path)await a.storage.from('cj-documents').remove([existing.photo_path]);
await audit(a,user.id,id,'review_photo_uploaded');return json({ok:true});
}
if(path==='review-photo-url'&&req.method==='GET'){
const id=new URL(req.url).searchParams.get('caseId');const c=await readableCase(db,id);if(!isStaff&&c.customer_id!==user.id)return json({error:'Forbidden'},403);
const r=(await checked(db.from('cj_reviews').select('photo_path').eq('case_id',id)))[0];if(!r?.photo_path)return json({error:'Tiada gambar.'},404);
const signed=await checked(admin().storage.from('cj-documents').createSignedUrl(r.photo_path,600));return json({url:signed.signedUrl});
}
if(path==='review'&&req.method==='POST'){
const b=await body(req);await checked(db.rpc('cj_review',{cid:b.caseId,stars:b.rating,txt:b.review,private_feedback:b.feedback||'',consent:b.publicConsent===true}));return json({ok:true});
}
if(path==='moderate'&&req.method==='POST'){const b=await body(req);await checked(db.rpc('cj_moderate',{cid:b.caseId,approve:b.approved===true}));return json({ok:true});}
if(path==='withdraw'&&req.method==='POST'){const b=await body(req);await checked(db.rpc('cj_withdraw',{cid:b.caseId}));return json({ok:true});}
if(path==='subscribe'&&req.method==='POST'){const b=await body(req);if(b.enabled===false){await checked(db.rpc('cj_subscribe',{ep:'',k:{},enabled:false}));return json({ok:true});}if(env('PUSH_ENABLED')!=='true')throw new Error('Push belum diaktifkan untuk staging ini');validateSubscription(b.subscription);await checked(db.rpc('cj_subscribe',{ep:b.subscription.endpoint,k:b.subscription.keys,enabled:true}));return json({ok:true});}
if(['document-init','document-complete'].includes(path)&&req.method==='POST'){
const b=await body(req),c=await readableCase(db,b.caseId);
if(!isStaff&&c.progress.submitted)throw new Error('Dokumen terkunci selepas submission. Hubungi SA untuk pembetulan.');
const slot=String(b.slot||'');
if(!/^(icFront|icBack|licenseFront|licenseBack|payslip[1-6]|bankstmt[1-6]|bizbank[1-6]|kwsp|ssm|taxDeclaration|taxReceipt|inc2_(payslip[1-6]|bankstmt[1-6]|bizbank[1-6]|ssm|proof))$/.test(slot))throw new Error('Kategori dokumen tidak sah');
const a=admin();
if(path==='document-init'){
if(!Number.isSafeInteger(b.size)||b.size<=0||!['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(b.mime))throw new Error('Pilih gambar atau PDF yang sah.');
const objectPath=`${b.caseId}/${randomUUID()}`;
const signed=await checked(a.storage.from('cj-documents').createSignedUploadUrl(objectPath));
const payload=Buffer.from(JSON.stringify({user:user.id,caseId:b.caseId,slot,path:objectPath,mime:b.mime,size:b.size,expires:Date.now()+7200000})).toString('base64url');
return json({ok:true,path:objectPath,token:signed.token,ticket:payload+'.'+sign(payload),endpoint:env('SUPABASE_URL').replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable/sign'});
}
const [payload,signature]=String(b.ticket||'').split('.');
if(!payload||!signature||sign(payload)!==signature)throw new Error('Pengesahan upload tidak sah.');
const t=JSON.parse(Buffer.from(payload,'base64url').toString());
if(t.user!==user.id||t.caseId!==b.caseId||t.slot!==slot||t.expires<Date.now())throw new Error('Pengesahan upload tamat. Pilih fail semula.');
const old=(await checked(a.from('cj_documents').select('path').eq('case_id',b.caseId).eq('slot',slot)))[0];
if(old?.path===t.path)return json({ok:true,status:'uploaded'});
let info;try{info=await checked(a.storage.from('cj-documents').info(t.path));}catch{throw Object.assign(new Error('Fail belum ditemui dalam Storage. Mencuba lagi.'),{status:503});}
if(Number(info.size)!==t.size||info.contentType!==t.mime)throw Object.assign(new Error('Fail belum lengkap. Menyemak semula status upload.'),{status:503});
let head;try{const signed=await checked(a.storage.from('cj-documents').createSignedUrl(t.path,60));head=await fetch(signed.signedUrl,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(new Error('Sambungan Storage terganggu. Menyambung semula pengesahan upload.'),{status:503});}
if(!head.ok)throw Object.assign(new Error('Fail belum boleh dibaca. Menyemak semula status upload.'),{status:503});
const reader=head.body.getReader();const first=await reader.read();await reader.cancel();
validateFile(Buffer.from(first.value||[]).subarray(0,32),t.mime);
await checked(a.from('cj_documents').upsert({case_id:b.caseId,slot,path:t.path,mime:t.mime,size:t.size,created_at:new Date().toISOString(),scan_status:'uploaded',scan_attempts:0,scan_available_at:new Date().toISOString(),scan_lease_until:null},{onConflict:'case_id,slot'}));
await uploadPostCommit({oldPath:old?.path,newPath:t.path,removeOld:p=>checked(a.storage.from('cj-documents').remove([p])),auditWrite:()=>audit(a,user.id,b.caseId,'document_uploaded')});
return json({ok:true,status:'uploaded'});
}
if(path==='document'&&req.method==='POST'){
const data=await req.formData();const id=data.get('caseId'),slot=data.get('slot'),file=data.get('file');
const c=await readableCase(db,id);if(!isStaff&&c.progress.submitted)throw new Error('Dokumen terkunci selepas submission. Hubungi SA untuk pembetulan.');
if(!/^(icFront|icBack|licenseFront|licenseBack|payslip[1-6]|bankstmt[1-6]|bizbank[1-6]|kwsp|ssm|taxDeclaration|taxReceipt|inc2_(payslip[1-6]|bankstmt[1-6]|bizbank[1-6]|ssm|proof))$/.test(slot||''))throw new Error('Kategori dokumen tidak sah');
if(!file||!file.size||typeof file.arrayBuffer!=='function')throw new Error('Pilih gambar atau PDF.');const bytes=Buffer.from(await file.arrayBuffer());validateFile(bytes,file.type);
const a=admin(),path=`${id}/${randomUUID()}`;
await checked(a.storage.from('cj-documents').upload(path,bytes,{contentType:file.type,upsert:false}));
const old=(await checked(a.from('cj_documents').select('path').eq('case_id',id).eq('slot',slot)))[0];
try{await checked(a.from('cj_documents').upsert({case_id:id,slot,path,mime:file.type,size:file.size,created_at:new Date().toISOString(),scan_status:'uploaded',scan_attempts:0,scan_available_at:new Date().toISOString(),scan_lease_until:null},{onConflict:'case_id,slot'}));}catch(e){await a.storage.from('cj-documents').remove([path]);throw e;}
await uploadPostCommit({oldPath:old?.path,newPath:path,removeOld:p=>checked(a.storage.from('cj-documents').remove([p])),auditWrite:()=>audit(a,user.id,id,'document_uploaded')});
return json({ok:true,status:'uploaded'});
}
if(path==='document-url'&&req.method==='POST'){
if(!isStaff)return json({error:'Dokumen hanya boleh dibuka oleh SA.'},403);const b=await body(req);await readableCase(db,b.caseId);
const d=(await checked(db.from('cj_documents').select('path,scan_status,slot,mime').eq('id',b.documentId).eq('case_id',b.caseId)))[0];if(!d||d.scan_status==='infected')throw new Error('Dokumen tidak tersedia. Muat naik fail baharu.');
const app=(await checked(db.from('cj_applications').select('data').eq('case_id',b.caseId)))[0];
const a=admin();const signed=await checked(a.storage.from('cj-documents').createSignedUrl(d.path,60,{download:documentFileName(app?.data?.name,d.slot,d.mime,b.caseId)}));await audit(a,user.id,b.caseId,'document_opened');return json({url:signed.signedUrl});
}
if(path==='export-reviews'&&req.method==='GET'){if(!isStaff)return json({error:'Forbidden'},403);return json({reviews:await checked(admin().from('cj_public_reviews').select('rating,review,vehicle_model,display_name,reviewed_at').order('reviewed_at',{ascending:false}).limit(500))});}
if(path==='audit'&&req.method==='GET'){if(!isStaff)return json({error:'Forbidden'},403);return json({events:await checked(db.from('cj_audit').select('action,case_id,actor_id,created_at').order('created_at',{ascending:false}).limit(100))});}
return json({error:'Endpoint tidak dijumpai'},404);
}catch(e){return json({error:e.status===503?e.message:(e.status||400)<500?String(e.message).slice(0,240):'Ralat server. Cuba semula.'},e.status||400);}}
export default handler;

export async function indexCase(admin,caseId,ic){const key=env('TRACKER_LOOKUP_SECRET');if(!key||key.length<32)throw Object.assign(new Error('Tracker secret missing; run index backfill'),{status:503});await checked(admin.from('cj_tracker_index').upsert({case_id:caseId,ic_hmac:createHmac('sha256',key).update(ic).digest('hex')},{onConflict:'case_id'}));}
