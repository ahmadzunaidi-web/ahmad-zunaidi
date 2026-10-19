// Server-only operator task after migration / rotating TRACKER_LOOKUP_SECRET.
// Reads NRIC in memory; logs only indexed case count, never IC or hash.
import{clients,indexCase}from '../server/api.mjs';
const db=clients().admin();let count=0,page=0;
while(true){const r=await db.from('cj_applications').select('case_id,data').range(page*100,page*100+99);if(r.error)throw r.error;for(const a of r.data){if(/^\d{12}$/.test(a.data.ic||'')){await indexCase(db,a.case_id,a.data.ic);count++;}}if(r.data.length<100)break;page++;}
console.log(`Indexed ${count} cases. Unsubmitted cases remain hidden from public progress.`);
