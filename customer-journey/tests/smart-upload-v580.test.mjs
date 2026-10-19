import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {uploadPostCommit} from '../server/upload-postcommit.mjs';

const html=readFileSync('public/index.html','utf8');

test('Upload completion remains successful when previous Storage object delete fails', async()=>{
 const calls=[];
 await uploadPostCommit({oldPath:'old',newPath:'new',removeOld:async()=>{calls.push('delete');throw new Error('network');},auditWrite:async()=>calls.push('audit'),log:()=>calls.push('warn')});
 assert.deepEqual(calls,['delete','warn','audit']);
});
test('Upload completion remains successful when audit is temporarily unavailable', async()=>{
 const calls=[];
 await uploadPostCommit({oldPath:null,newPath:'new',removeOld:async()=>calls.push('delete'),auditWrite:async()=>{calls.push('audit');throw new Error('offline');},log:()=>calls.push('warn')});
 assert.deepEqual(calls,['audit','warn']);
});
test('Upload keeps file contents untouched when PDF or browser cannot decode image',async()=>{
 const code=html.slice(html.indexOf('async function prepareDoc'),html.indexOf('async function setWake'));
 const ctx=vm.createContext({File,Blob,console,Math,Uint8Array,Error});vm.runInContext(code+';this.prepareDoc=prepareDoc',ctx);
 const pdf=new File([new Uint8Array(6*1024*1024)],'bank.pdf',{type:'application/pdf'});
 assert.equal(await ctx.prepareDoc(pdf),pdf);
 const heic=new File([new Uint8Array(5*1024*1024)],'image.heic',{type:'image/heic'});
 assert.equal(await ctx.prepareDoc(heic),heic);
});
test('Large browser-readable photo is compressed when output is significantly smaller',async()=>{
 const code=html.slice(html.indexOf('async function prepareDoc'),html.indexOf('async function setWake'));
 const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},drawImage(){}}),toBlob(cb){cb(new Blob([new Uint8Array(600000)],{type:'image/jpeg'}));}};
 const ctx=vm.createContext({File,Blob,console,Math,Uint8Array,Error,document:{createElement:()=>canvas},createImageBitmap:async()=>({width:4000,height:3000,close(){}})});
 vm.runInContext(code+';this.prepareDoc=prepareDoc',ctx);
 const input=new File([new Uint8Array(4*1024*1024)],'ic.png',{type:'image/png'});
 const out=await ctx.prepareDoc(input);
 assert.equal(out.name,'ic.jpg');assert.equal(out.type,'image/jpeg');assert.equal(out.size,600000);
});
test('Upload queue limits concurrent requests to two without losing queued slots',async()=>{
 const code=html.slice(html.indexOf('function startQueue'),html.indexOf('async function runUpload'));
 const ctx=vm.createContext({Promise,setTimeout,console});
 vm.runInContext(`const uploadQueue=[];let uploadActive=0;const MAX_PARALLEL_UPLOADS=2;let inflight=0,max=0;const done=[];function setWake(){};
 function runUpload(slot){inflight++;max=Math.max(max,inflight);return new Promise(resolve=>setTimeout(()=>{done.push(slot);inflight--;resolve();},15));}
 ${code};this.startQueue=startQueue;this.stats=()=>({max,done});`,ctx);
 ['a','b','c','d','e'].forEach(slot=>ctx.startQueue(slot));
 await new Promise(resolve=>setTimeout(resolve,125));
 const stats=ctx.stats();assert.equal(stats.max,2);assert.deepEqual([...stats.done],['a','b','c','d','e']);
});
