// Operator-only erasure after identity verification and retention/legal review.
import{createClient}from '@supabase/supabase-js';
const[id,confirmation]=process.argv.slice(2);if(!/^[0-9a-f-]{36}$/i.test(id||'')||confirmation!=='CONFIRM-VERIFIED-ERASURE')throw new Error('Pass CASE_UUID CONFIRM-VERIFIED-ERASURE after approved erasure request');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const docs=await db.from('cj_documents').select('path').eq('case_id',id);if(docs.error)throw docs.error;
if(docs.data.length){const removal=await db.storage.from('cj-documents').remove(docs.data.map(d=>d.path));if(removal.error)throw removal.error;}
const log=await db.from('cj_audit').insert({case_id:id,action:'verified_erasure_requested'});if(log.error)throw log.error;
const result=await db.from('cj_cases').delete().eq('id',id);if(result.error)throw result.error;
console.log('Case data and documents removed. Auth account, legal backups and audit retention must be handled separately.');
