import{test}from 'node:test';import assert from 'node:assert/strict';import{readFile}from 'node:fs/promises';import vm from 'node:vm';
test('PWA uses device language for generic push and ignores private payload fields',async()=>{
const handlers={},cache=new Map();let shown;
const self={registration:{scope:'https://customerjourney.example/',showNotification:async(title,data)=>{shown={title,...data};}},addEventListener:(type,handler)=>handlers[type]=handler};
vm.runInNewContext(await readFile('public/sw.js','utf8'),{self,caches:{open:async()=>({put:async(key,value)=>cache.set(key,value),match:async key=>cache.get(key)?.clone()})},Response,URL});
let work;handlers.message({data:{type:'CJ_LANGUAGE',language:'en'},waitUntil:p=>work=p});await work;
handlers.push({data:{json:()=>({body:'PRIVATE NRIC SHOULD NEVER APPEAR',tag:'test-1'})},waitUntil:p=>work=p});await work;
assert.equal(shown.body,'There is a new update. Open the app to check your progress.');assert.ok(!JSON.stringify(shown).includes('PRIVATE'));
handlers.message({data:{type:'CJ_LANGUAGE',language:'ms'},waitUntil:p=>work=p});await work;
handlers.push({data:null,waitUntil:p=>work=p});await work;assert.equal(shown.body,'Ada perkembangan baharu. Buka app untuk semak status.');
});
