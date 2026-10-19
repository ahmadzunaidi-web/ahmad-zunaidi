// Once a document metadata row is committed, client success must not depend on
// replacing the previous object's cleanup or the noncritical audit call.
// Retention's orphan cleanup retries any orphaned object removal separately.
export async function uploadPostCommit({oldPath,newPath,removeOld,auditWrite,log=console.warn}){
  if(oldPath&&oldPath!==newPath){
    try{await removeOld(oldPath);}catch(error){log('CJ previous-object cleanup deferred:',error?.name||'storage-error');}
  }
  try{await auditWrite();}catch(error){log('CJ upload audit unavailable after commit:',error?.name||'audit-error');}
}
