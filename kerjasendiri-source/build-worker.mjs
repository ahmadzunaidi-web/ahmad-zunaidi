// Local-only build. Does not contact Cloudflare, Supabase or any other service.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(root,'worker/worker.mjs'),'utf8');
const entries=JSON.parse(fs.readFileSync(path.join(root,'worker/ui-map.json'),'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const expected='c3b594b1f8b85c1444ff5b8f36c523b01e8034ec8d23fa056ff691d0a8ff336e';
if(hash(source)!==expected)throw Error('worker/worker.mjs must remain the exact production baseline. Edit worker/ui files instead.');
let output=source,changed=[];
for(const e of [...entries].sort((a,b)=>b.literal_start-a.literal_start)){
 const bytes=fs.readFileSync(path.join(root,e.file));
 if(hash(bytes)===e.sha256)continue;
 if(e.source_name==='KS_SESSION_SYNC_V1'||e.source_name==='fixed')throw Error('Protected session lifecycle file changed: '+e.file);
 let value;
 if(e.encoding==='gzip-base64')value=zlib.gzipSync(bytes).toString('base64');
 else if(e.encoding==='base64')value=bytes.toString('base64');
 else value=bytes.toString('utf8');
 output=output.slice(0,e.literal_start)+JSON.stringify(value)+output.slice(e.literal_end);changed.push(e.file);
}
fs.writeFileSync(path.join(root,'worker/worker.generated.mjs'),output);
console.log(JSON.stringify({changed,sha256:hash(output),baseline_identical:output===source},null,2));
