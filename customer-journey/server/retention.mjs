import {clients} from './api.mjs';
async function check(p){const r=await p;if(r.error)throw r.error;return r.data;}
export async function purgeExpiredDocuments(db=clients().admin(),now=Date.now()){
 const cutoff=new Date(now-21*86400000).toISOString();
 const rows=await check(db.from('cj_documents').select('id,path,case_id,created_at').lt('created_at',cutoff).order('created_at').limit(30));let deleted=0;
 for(const d of rows){
  // Delete bytes first. Keep the row if Storage fails so the next run retries.
  await check(db.storage.from('cj-documents').remove([d.path]));
  await check(db.from('cj_documents').delete().eq('id',d.id).eq('path',d.path).lt('created_at',cutoff));deleted++;
 }
 const orphans=await check(db.rpc('cj_expired_orphan_documents'));
 if(orphans.length)await check(db.storage.from('cj-documents').remove(orphans.map(x=>x.path)));
 return {deleted,orphans:orphans.length};
}
