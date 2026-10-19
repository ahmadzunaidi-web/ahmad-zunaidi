// Optional browser smoke test.
//   1. start the app on a throw-away DB:   PORT=3055 DB_PATH=/tmp/ui.db npm run start   (inside wa-agent/)
//   2. seed an agent:                       node scripts/seed-demo.mjs
//   3. run:                                 npm i -D playwright && npx playwright install chromium && node scripts/ui-smoke.mjs
import { chromium } from 'playwright';
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('dialog', async (d) => {
  const m = d.message();
  if (d.type() === 'prompt') d.accept(m.startsWith('Templat?') ? 'Menu → AI fallback' : m.startsWith('Nama workflow') ? 'Menu utama' : m.startsWith('Nombor') ? '60123456789' : '');
  else d.accept();
});
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };
await p.goto('http://localhost:3055/'); await p.waitForSelector('#chips .chip');

await step('create workflow from template', async () => {
  await p.click('[data-v=workflows]'); await p.click('#wf-new');
  await p.waitForSelector('.wf-step', { timeout: 8000 });
  const n = await p.locator('.wf-step').count(); if (n < 5) throw new Error('expected >=5 steps, got ' + n);
  await p.waitForSelector('#wf-issues .issue', { timeout: 8000 });
});
await step('edit the ask-question step', async () => {
  await p.locator('.wf-step', { hasText: 'Tanya soalan' }).click();
  await p.fill('#f-text', 'Apa yang boleh kami bantu hari ini?');
  await p.click('#st-apply'); await p.waitForTimeout(300);
  if (!(await p.locator('.wf-step', { hasText: 'Apa yang boleh kami bantu hari ini?' }).count())) throw new Error('summary not updated');
});
await step('add a wait step via +', async () => {
  await p.locator('.wf-plus').first().click(); await p.click('[data-pick=wait]');
  await p.waitForSelector('#f-minutes'); await p.fill('#f-minutes', '5'); await p.click('#st-apply');
});
await step('delete that step again', async () => { p.removeAllListeners('dialog'); p.on('dialog', (d) => d.accept()); await p.click('#st-del'); await p.waitForTimeout(300); });
await step('save draft', async () => { await p.click('#wf-save'); await p.waitForFunction(() => !document.querySelector('#wf-canvas')?.textContent.includes('belum disimpan')); });
await step('validate shows ok', async () => { await p.waitForFunction(() => document.querySelector('#wf-issues')?.textContent.includes('sedia untuk publish'), null, { timeout: 8000 }); });
await p.screenshot({ path: (process.env.SHOT_DIR ?? '.') + '/6-workflow.png' });
await step('publish', async () => { await p.click('#wf-pub'); await p.waitForSelector('#wf-stop', { timeout: 8000 }); });

await step('customer flows through the menu', async () => {
  await p.click('[data-v=inbox]'); await p.fill('#sim-from', '60199990000'); await p.fill('#sim-name', 'Budi'); await p.fill('#sim-text', 'hai');
  await p.click('#sim-send');
  await p.waitForFunction(() => document.querySelector('#msgs')?.textContent.includes('Apa yang boleh kami bantu hari ini?'), null, { timeout: 12000 });
  await p.fill('#sim-text', 'Cakap dengan orang'); await p.click('#sim-send');
  await p.waitForFunction(() => document.querySelector('#side')?.textContent.includes('Sales Team'), null, { timeout: 12000 });
});
await p.screenshot({ path: (process.env.SHOT_DIR ?? '.') + '/7-inbox-workflow.png' });
await step('contact editor saves tag + lifecycle', async () => {
  await p.selectOption('#ct-life', 'Hot Lead'); await p.check('.ct-tag[value=VIP]'); await p.click('#ct-save');
  await p.waitForFunction(() => document.querySelector('#side')?.textContent.includes('Hot Lead'), null, { timeout: 8000 });
});

await step('agent editor: http skill + review', async () => {
  await p.click('[data-v=agents]'); await p.waitForSelector('#agent-list .item'); await p.click('#agent-list .item'); await p.waitForSelector('#e-ins');
  await p.check('.e-s[data-k=http]'); await p.click('#e-http-add');
  await p.fill('.http [data-f=name]', 'Semak pesanan'); await p.fill('.http [data-f=url]', 'https://api.contoh.com/orders/$agent.order_id');
  await p.click('[data-addi="0"]'); await p.fill('.http [data-g=name]', 'order_id'); await p.fill('.http [data-g=description]', 'ID pesanan');
  await p.fill('.http [data-f=_h]', 'x-api-key: sk-test-123');
  await p.fill('#e-ins', '# CONTEXT\nAnda membantu pelanggan. Assign ke @sales team jika mahu orang. Tambah %vip. Hantar video demo.\n# BOUNDARIES\nJangan reka harga.');
  await p.click('#e-review'); await p.waitForSelector('#e-review-box .issue', { timeout: 8000 });
});
await p.screenshot({ path: (process.env.SHOT_DIR ?? '.') + '/8-agent-review.png', fullPage: false });
await step('apply all fixes', async () => { await p.click('#e-fixall'); await p.waitForTimeout(800); const v = await p.inputValue('#e-ins'); if (!v.includes('@Sales Team') || !v.includes('%VIP')) throw new Error('fix not applied: ' + v.slice(0, 120)); });
await step('save agent with http action', async () => { await p.click('#e-save'); await p.waitForTimeout(800); await p.waitForSelector('.http'); const hv = await p.inputValue('.http [data-f=_h]'); if (hv.includes('sk-test-123') || !hv.includes('***')) throw new Error('secret not masked: ' + hv); });

await step('templates card + metrics', async () => {
  await p.click('[data-v=knowledge]'); await p.fill('#t-name', 'promo_hello'); await p.fill('#t-body', 'Hai {{1}}, promosi {{2}}'); await p.click('#t-add'); await p.waitForFunction(() => document.querySelector('#t-list')?.textContent.includes('promo_hello'));
  await p.click('[data-v=metrics]'); await p.waitForSelector('.card');
});
await p.screenshot({ path: (process.env.SHOT_DIR ?? '.') + '/9-metrics.png' });
console.log('console errors:', JSON.stringify(errs));
await b.close();
