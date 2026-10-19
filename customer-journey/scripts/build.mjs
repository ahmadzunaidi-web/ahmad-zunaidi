import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
// Root copy keeps old arcustomerjourney.netlify.app links working; /journey copy is what abangrecond.com/journey proxies to.
await cp('public','dist',{recursive:true});await cp('public','dist/journey',{recursive:true});
console.log('Built public-only dist (root + /journey); server, SQL, tests and secrets excluded.');
