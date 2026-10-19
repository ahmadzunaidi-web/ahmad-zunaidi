import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {income2Docs,income2Keys,applicantKeys,validateApplicant,pick,requiredDocs} from '../server/domain.mjs';
const base={name:'A',ic:'900101123456',phone:'0111234567',mailAddress:'KL',category:'government'};
test('Second income doc lists and validation',()=>{
assert.deepEqual(income2Docs(''),[]);assert.deepEqual(income2Docs(undefined),[]);
assert.equal(income2Docs('government').length,3);assert.equal(income2Docs('private').length,12);assert.equal(income2Docs('business').length,7);assert.equal(income2Docs('other').length,6);
assert.throws(()=>income2Docs('bogus'));assert.equal(requiredDocs('private').length,17);
for(const k of income2Keys)assert.ok(applicantKeys.includes(k));
validateApplicant({...base});validateApplicant(pick({...base,income2Category:'private',inc2Employer:'X',inc2Income:'1500',id:'x'},applicantKeys));
assert.throws(()=>validateApplicant({...base,income2Category:'bogus'}),/income kedua/);});
test('Frontend, API regex and SQL agree on second income slots/keys',async()=>{
const html=await readFile('public/index.html','utf8'),api=await readFile('server/api.mjs','utf8'),sql=await readFile('supabase/migrations/20261015030000_customer_journey_second_income.sql','utf8');
const DOCS2=eval(html.match(/const DOCS2=(\(\(\)=>\{[\s\S]*?\}\)\(\));/)[1]);const re=new RegExp(api.match(/if\(!\/(\^\(icFront[^\n]*?\)\$)\/\.test\(slot/)[1]);
for(const k of ['government','private','business','other']){assert.deepEqual(DOCS2[k].filter(x=>!x[2]).map(x=>x[0]),income2Docs(k));for(const [slot] of DOCS2[k])assert.ok(re.test(slot),slot);}
for(const bad of ['inc2_payslip7','inc2_kwsp','inc3_payslip1','../x'])assert.ok(!re.test(bad),bad);
for(const k of income2Keys)assert.ok(sql.includes(`'${k}'`),k);});
