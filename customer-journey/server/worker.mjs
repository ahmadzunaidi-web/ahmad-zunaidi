import webpush from 'web-push';
import {clients} from './api.mjs';
import {validateSubscription,validateFile} from './domain.mjs';
const env=k=>globalThis.Netlify?.env.get(k)??process.env[k];
async function check(p){const r=await p;if(r.error)throw r.error;return r.data;}
export async function runWorker({scan=false,push=true}={}){
if(!(scan&&env('MALWARE_SCAN_URL')&&env('MALWARE_SCAN_TOKEN'))&&!(push&&env('PUSH_ENABLED')==='true'))return {sent:0,scanned:0};
const deadline=Date.now()+23000;
const db=clients().admin();let sent=0,scanned=0;
if(scan&&env('MALWARE_SCAN_URL')&&env('MALWARE_SCAN_TOKEN')){
const url=new URL(env('MALWARE_SCAN_URL'));if(url.protocol!=='https:')throw new Error('Scanner must use HTTPS');
const docs=await check(db.rpc('cj_claim_documents',{batch:3}));
for(const d of docs){if(Date.now()>deadline)break;try{const blob=await check(db.storage.from('cj-documents').download(d.path));const bytes=Buffer.from(await blob.arrayBuffer());validateFile(bytes,d.mime);
const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${env('MALWARE_SCAN_TOKEN')}`,'Content-Type':d.mime,'X-Document-ID':d.id},body:bytes,signal:AbortSignal.timeout(5000),redirect:'error'});
if(!res.ok)throw new Error('Scanner unavailable');const result=await res.json();if(!['clean','infected'].includes(result.status))throw new Error('Invalid scanner response');
await check(db.from('cj_documents').update({scan_status:result.status,scan_lease_until:null}).eq('id',d.id).eq('path',d.path));scanned++;
if(result.status==='infected')await check(db.storage.from('cj-documents').remove([d.path]));
}catch{await check(db.from('cj_documents').update({scan_status:d.scan_attempts>=6?'error':'pending',scan_lease_until:null,scan_available_at:new Date(Date.now()+Math.min(3600000,30000*2**(d.scan_attempts||1))).toISOString()}).eq('id',d.id).eq('path',d.path)); /* Keep quarantined; retry fairly without releasing on failure. */ }}
}
if(push&&env('PUSH_ENABLED')==='true'){
webpush.setVapidDetails(env('VAPID_SUBJECT'),env('VAPID_PUBLIC_KEY'),env('VAPID_PRIVATE_KEY'));
const jobs=await check(db.rpc('cj_claim_push',{batch:3}));
for(const job of jobs){if(Date.now()>deadline)break;const sub=(await check(db.from('cj_push_subscriptions').select('*').eq('id',job.subscription_id)))[0];
if(!sub?.active){await check(db.from('cj_push_queue').update({status:'dead',lease_until:null}).eq('id',job.id));continue;}
try{validateSubscription(sub);await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title:'Abang Recond · Customer Journey',body:'Ada perkembangan baharu. Buka app untuk semak status.',tag:`cj-${job.case_id}-${job.version}`}),{TTL:3600,timeout:5000});
await check(db.from('cj_push_queue').update({status:'sent',lease_until:null}).eq('id',job.id));sent++;
}catch(e){const invalid=[404,410].includes(e.statusCode);if(invalid)await check(db.from('cj_push_subscriptions').update({active:false}).eq('id',sub.id));
await check(db.from('cj_push_queue').update({status:invalid||job.attempts>=6?'dead':'pending',lease_until:null,available_at:new Date(Date.now()+Math.min(3600000,30000*2**job.attempts)).toISOString()}).eq('id',job.id));}
}
}
return {sent,scanned};}
export default async()=>{await runWorker({scan:false});return new Response(null,{status:204});};
