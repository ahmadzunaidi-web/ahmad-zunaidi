import { describe, expect, it } from 'vitest';
import { CloudApiSender, interactiveKind, interactivePayload } from '../src/channels/whatsapp.js';
import { maskActions, renderJsonBody, validateHttpActions } from '../src/agent/http-skill.js';
import { textResponse, toolResponse } from '../src/agent/llm.js';
import type { Graph, Step } from '../src/workflow/types.js';
import { api, inbound, publishAgent, setup, type Ctx } from './helpers.js';

const act = (over: Record<string, unknown> = {}) => ({
  name: 'Order status', description: 'Use when the contact asks about an order.', method: 'POST', url: 'https://93.184.216.34/orders/$agent.order_id',
  inputs: [{ name: 'order_id', format: 'text', description: '8-digit id' }, { name: 'qty', format: 'number', description: 'quantity' }],
  query: { lang: 'ms' }, headers: { 'x-api-key': 'sk-secret-123' }, body: '{"id":"$agent.order_id","qty":$agent.qty,"who":"$contact.name"}', ...over,
});
const json = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function aiSetup(c: Ctx, name: string, draft: Record<string, unknown>) {
  const a = await publishAgent(c, name, draft);
  await api(c, 'PUT', '/api/settings/default-agent', { agent_id: a.id });
  return a;
}

describe('M8: HTTP request skill', () => {
  it('validates configuration (limits, names, URL, header injection, body JSON, undefined inputs)', () => {
    expect(() => validateHttpActions(Array.from({ length: 11 }, (_, i) => act({ name: `A${i}` })))).toThrow(/At most 10/);
    expect(() => validateHttpActions([act(), act()])).toThrow(/unique/);
    expect(() => validateHttpActions([act({ url: 'ftp://x' })])).toThrow(/URL/);
    expect(() => validateHttpActions([act({ headers: { 'x-a': 'a\r\nInjected: 1' } })])).toThrow(/single line/);
    expect(() => validateHttpActions([act({ headers: { 'bad name': 'v' } })])).toThrow(/header name/);
    expect(() => validateHttpActions([act({ body: '{not json' })])).toThrow(/JSON/);
    expect(() => validateHttpActions([act({ method: 'GET' })])).toThrow(/GET requests cannot have a body/);
    expect(() => validateHttpActions([act({ url: 'https://x.my/$agent.nope' })])).toThrow(/no input called "nope"/);
    expect(() => validateHttpActions([act({ inputs: Array.from({ length: 21 }, (_, i) => ({ name: `i${i}`, format: 'text', description: '' })) })])).toThrow(/at most 20 inputs/);
    expect(() => validateHttpActions([act({ inputs: [{ name: 'a'.repeat(31), format: 'text', description: '' }] })])).toThrow(/max 30/);
    expect(validateHttpActions([act()])[0].inputs).toHaveLength(2);
  });

  it('substitutes safely: values cannot break out of the JSON body', () => {
    const body = renderJsonBody('{"note":"$agent.note","n":$agent.n,"list":$agent.tags,"who":"$contact.name"}', { agent: { note: 'he said "hi"\n}, "admin": true, "x":"', n: 5, tags: ['a', 'b'] }, contact: { name: 'Aina' } });
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ note: 'he said "hi"\n}, "admin": true, "x":"', n: 5, list: ['a', 'b'], who: 'Aina' });
    expect(parsed).not.toHaveProperty('admin');
  });

  it('masks secrets for the browser and restores them when the form sends *** back', async () => {
    const c = setup();
    expect(maskActions(validateHttpActions([act()]))[0].headers['x-api-key']).toBe('***');
    const a = await api(c, 'POST', '/api/agents', { name: 'Shop', draft: { instructions: 'x', skills: { http: { enabled: true, prompt: '' } }, http_actions: [act()] } });
    expect(a.status).toBe(200);
    expect(a.body.draft.http_actions[0].headers['x-api-key']).toBe('***');
    const got = await api(c, 'GET', `/api/agents/${a.body.id}`);
    expect(JSON.stringify(got.body)).not.toContain('sk-secret-123');
    const edited = { ...got.body.draft.http_actions[0], description: 'Updated text' };
    await api(c, 'PUT', `/api/agents/${a.body.id}`, { draft: { http_actions: [edited] } });
    expect(c.store.getAgent(a.body.id)!.draft.http_actions[0]).toMatchObject({ description: 'Updated text', headers: { 'x-api-key': 'sk-secret-123' } }); // stored secret kept
    expect((await api(c, 'PUT', `/api/agents/${a.body.id}`, { draft: { http_actions: [act({ url: 'nope' })] } })).status).toBe(400);
    expect(JSON.stringify((await api(c, 'GET', '/api/agents')).body)).not.toContain('sk-secret-123');
  });

  it('lets the model call an API: asks for inputs, sends the request, explains the result', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return json({ status: 'shipped', eta: '2026-12-12', receipt: 'https://cdn.example.com/files/receipt.pdf' }); }) as unknown as typeof fetch;
    const c = setup({ echoFallback: false }, f);
    await aiSetup(c, 'Shop', { skills: { http: { enabled: true, prompt: '' }, attachment: { enabled: true, prompt: '' } }, http_actions: [act()] });
    c.steps.push(() => toolResponse('http_order_status', { order_id: 'A/12 34', qty: 2 }, 'h1'));
    c.steps.push((req) => {
      const r = req.messages.at(-1)!.content as unknown as { content: string; is_error?: boolean }[];
      expect(r[0].is_error).toBeUndefined();
      expect(r[0].content).toContain('HTTP 200');
      expect(r[0].content).toContain('shipped');
      return toolResponse('send_attachment', { url: 'https://cdn.example.com/files/receipt.pdf', caption: 'Resit' }, 'a1');
    });
    c.steps.push(() => textResponse('Pesanan anda sudah dihantar, tiba 12 Dis.'));
    const sentMedia: unknown[][] = [];
    (c.sender as unknown as { sendMedia: (...a: unknown[]) => Promise<{ id: string }> }).sendMedia = async (...a) => { sentMedia.push(a); return { id: 'wamid.m1' }; };
    await inbound(c, '601', 'mana pesanan saya?');
    const call = calls[0];
    expect(call.url).toBe('https://93.184.216.34/orders/A%2F12%2034?lang=ms'); // path encoded, query added
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['x-api-key']).toBe('sk-secret-123');
    expect(JSON.parse(String(call.init.body))).toEqual({ id: 'A/12 34', qty: 2, who: 'Aina Binti Ali' });
    expect(sentMedia[0].slice(0, 4)).toEqual(['601', 'document', 'https://cdn.example.com/files/receipt.pdf', 'Resit']);
    expect(c.sender.sent.at(-1)!.body).toContain('Pesanan anda sudah dihantar');
    // the secret never reaches the model
    expect(JSON.stringify(c.provider.requests)).not.toContain('sk-secret-123');
  });

  it('reports failures to the model, refuses private targets and missing inputs', async () => {
    const f = (async (url: string) => (url.includes('/orders/') ? json({ error: 'not found' }, 404) : json({}))) as unknown as typeof fetch;
    const c = setup({ echoFallback: false }, f);
    await aiSetup(c, 'Shop', { skills: { http: { enabled: true, prompt: '' } }, http_actions: [act(), act({ name: 'Internal', url: 'http://127.0.0.1:9/admin', method: 'GET', body: undefined, inputs: [], headers: {} })] });
    c.steps.push(() => toolResponse('http_order_status', { order_id: '999', qty: 1 }, 'x1'));
    c.steps.push(() => toolResponse('http_internal', {}, 'x2'));
    c.steps.push(() => toolResponse('http_order_status', { order_id: '', qty: 1 }, 'x3'));
    c.steps.push(() => textResponse('Maaf, tidak jumpa.'));
    await inbound(c, '601', 'check');
    const run = c.store.runs(1)[0] as { tool_calls: { ok: boolean; message: string }[] };
    expect(run.tool_calls.map((t) => t.ok)).toEqual([false, false, false]);
    expect(run.tool_calls[0].message).toContain('HTTP 404');
    expect(run.tool_calls[1].message).toMatch(/Private URLs/);
    expect(run.tool_calls[2].message).toContain('Missing input');
  });

  it('is exposed only when the skill is on', async () => {
    const c = setup({ echoFallback: false });
    const a = await api(c, 'POST', '/api/agents', { name: 'NoHttp', draft: { instructions: 'x', http_actions: [act()] } });
    expect((await api(c, 'GET', `/api/agents/${a.body.id}/tools`)).body).toEqual([]);
  });
});

describe('M8: trigger workflow skill', () => {
  const wf = (c: Ctx, name: string, trigger: object, graph: Graph) => api(c, 'POST', '/api/workflows', { name, trigger, graph }).then(async (r) => { await api(c, 'POST', `/api/workflows/${r.body.id}/publish`); return r.body as { id: number }; });
  const step = (id: string, type: Step['type'], config: Step['config'], next: string | null = null): Step => ({ id, type, config, next });

  it('starts a published Manual workflow by exact name, passing variables, and rejects others', async () => {
    const c = setup({ echoFallback: false });
    await wf(c, 'refund_processing', { type: 'manual' }, { start: 'a', steps: { a: step('a', 'add_comment', { text: 'Refund for {{$trigger.order}}' }) } });
    await wf(c, 'on_open', { type: 'conversation_opened' }, { start: 'a', steps: { a: step('a', 'wait', { minutes: 5 }) } });
    await aiSetup(c, 'Support', { skills: { trigger_workflow: { enabled: true, prompt: 'If the contact asks for a refund, trigger !refund_processing' } } });
    c.steps.push(() => toolResponse('trigger_workflow', { workflow: 'on_open' }, 't0'));
    c.steps.push(() => toolResponse('trigger_workflow', { workflow: '!refund_processing', variables: { order: 'A-7' } }, 't1'));
    c.steps.push(() => textResponse('Permintaan refund diterima.'));
    await inbound(c, '601', 'nak refund');
    const run = c.store.runs(1)[0] as { tool_calls: { ok: boolean; message: string }[] };
    expect(run.tool_calls[0]).toMatchObject({ ok: false });
    expect(run.tool_calls[0].message).toContain('Manual trigger');
    expect(run.tool_calls[1].ok).toBe(true);
    const conv = c.store.listConversations()[0];
    expect(c.store.comments(conv.id).map((x) => x.body)).toContain('Refund for A-7');
  });
});

describe('M8: follow-ups', () => {
  const schedule = (steps: unknown[]) => toolResponse('schedule_follow_ups', { steps }, 'f1');

  async function followSetup(c: Ctx) {
    const a = await aiSetup(c, 'Nurture', { skills: { followup: { enabled: true, prompt: '' }, close: { enabled: true, prompt: '' }, set_lifecycle: { enabled: true, prompt: '' } } });
    c.steps.push(() => schedule([
      { after_minutes: 10, message: 'Masih di sana? 🙂' },
      { after_minutes: 30, message: 'Saya tutup perbualan ya.', then: [{ tool: 'update_lifecycle_stage', input: { stage: 'Unqualified' } }, { tool: 'close_conversation', input: { closing_note: 'No Response' } }] },
    ]));
    c.steps.push(() => textResponse('Boleh saya bantu?'));
    await inbound(c, '601', 'hi');
    return { a, conv: c.store.listConversations()[0] };
  }

  it('sends each step after its delay, runs the final actions and persists across restarts', async () => {
    const c = setup({ echoFallback: false });
    const { conv } = await followSetup(c);
    expect(c.store.followupsFor(conv.id).map((j) => j.status)).toEqual(['pending', 'queued']);
    const t0 = Date.now();
    expect(await c.followups.tick(t0 + 5 * 60_000)).toBe(0);
    expect(await c.followups.tick(t0 + 11 * 60_000)).toBe(1);
    expect(c.sender.sent.at(-1)!.body).toBe('Masih di sana? 🙂');
    expect(c.store.getConversation(conv.id)!.status).toBe('open');

    // "restart": a brand-new scheduler instance reads the same persisted jobs
    const { FollowUps } = await import('../src/core/followups.js');
    const fresh = new FollowUps(c.pipeline);
    expect(await fresh.tick(Date.now() + 5 * 60_000)).toBe(0); // second step is 30 min after the first was SENT
    expect(await fresh.tick(Date.now() + 31 * 60_000)).toBe(1);
    expect(c.sender.sent.at(-1)!.body).toBe('Saya tutup perbualan ya.');
    expect(c.store.getConversation(conv.id)).toMatchObject({ status: 'closed', closing_note: 'No Response' });
    expect(c.store.getContact(conv.contact_id)!.lifecycle).toBe('Unqualified');
    expect(c.store.followupsFor(conv.id).map((j) => j.status)).toEqual(['sent', 'sent']);
  });

  it('stops when the contact replies, when a person takes over, and can be cancelled by the AI', async () => {
    const c = setup({ echoFallback: false });
    const { conv } = await followSetup(c);
    c.steps.push(() => textResponse('Hai lagi'));
    await inbound(c, '601', 'saya di sini');
    expect(c.store.followupsFor(conv.id).every((j) => j.status === 'cancelled')).toBe(true);
    expect(await c.followups.tick(Date.now() + 99 * 60_000)).toBe(0);

    const c2 = setup({ echoFallback: false });
    const s2 = await followSetup(c2);
    await api(c2, 'POST', `/api/conversations/${s2.conv.id}/takeover`);
    expect(c2.store.followupsFor(s2.conv.id).every((j) => j.status === 'cancelled')).toBe(true);

    const c3 = setup({ echoFallback: false });
    await followSetup(c3);
    c3.steps.push(() => toolResponse('cancel_follow_ups', {}, 'cf'));
    c3.steps.push(() => textResponse('Baik, selamat tinggal.'));
    await inbound(c3, '601', 'tak minat, bye');
    expect(c3.store.followupsFor(c3.store.listConversations()[0].id).every((j) => j.status === 'cancelled')).toBe(true);
  });

  it('enforces limits: 5 steps, each within 24h, valid skills in "then", known templates', async () => {
    const c = setup({ echoFallback: false });
    await aiSetup(c, 'Nurture', { skills: { followup: { enabled: true, prompt: '' } } });
    const bad = [
      [Array.from({ length: 6 }, () => ({ after_minutes: 5, message: 'x' })), /1-5/],
      [[{ after_minutes: 1441, message: 'x' }], /24h|between 1 and 1440/],
      [[{ after_minutes: 5 }], /message or a "then"/],
      [[{ after_minutes: 5, message: 'x', then: [{ tool: 'close_conversation' }] }], /not allowed/],
      [[{ after_minutes: 5, message: 'x', template: 'ghost' }], /unknown template/],
    ] as const;
    for (const [steps] of bad) c.steps.push(() => schedule(steps as unknown as unknown[]));
    c.steps.push(() => textResponse('ok'));
    await inbound(c, '601', 'hi');
    const run = c.store.runs(1)[0] as { tool_calls: { ok: boolean; message: string }[] };
    expect(run.tool_calls.map((t) => t.ok)).toEqual([false, false, false, false, false]);
    bad.forEach(([, re], i) => expect(run.tool_calls[i].message).toMatch(re));
    expect(c.store.followupsFor(c.store.listConversations()[0].id)).toHaveLength(0);
  });

  it('falls back to a template when the 24h window closed, otherwise records a clear failure', async () => {
    const c = setup({ echoFallback: false });
    c.store.upsertTemplate('nudge', 'ms', 'Hai {{1}}, masih berminat?');
    const tpl: unknown[][] = [];
    (c.sender as unknown as { sendTemplate: (...a: unknown[]) => Promise<{ id: string }> }).sendTemplate = async (...a) => { tpl.push(a); return { id: 'wamid.t' }; };
    await aiSetup(c, 'Nurture', { skills: { followup: { enabled: true, prompt: '' } } });
    c.steps.push(() => schedule([{ after_minutes: 1380, message: 'Nudge teks', template: 'nudge', template_params: ['Aina'] }, { after_minutes: 60, message: 'Tanpa template' }]));
    c.steps.push(() => textResponse('ok'));
    await inbound(c, '601', 'hi');
    const conv = c.store.listConversations()[0];
    c.store.patchConversation(conv.id, { last_inbound_at: Date.now() - 25 * 3600_000 });
    await c.followups.tick(Date.now() + 1381 * 60_000);
    expect(tpl[0]).toEqual(['601', 'nudge', 'ms', ['Aina']]);
    await c.followups.tick(Date.now() + 1381 * 60_000 + 61 * 60_000);
    const last = c.store.messages(conv.id).at(-1)!;
    expect(last).toMatchObject({ body: 'Tanpa template', status: 'failed', error: expect.stringContaining('24h') });
  });
});

describe('M8: attachments, templates, interactive messages', () => {
  it('only sends attachment URLs that came from instructions, knowledge or an API response', async () => {
    const c = setup({ echoFallback: false });
    const k = await api(c, 'POST', '/api/knowledge', { name: 'Brosur', text: 'Pakej Premium. Brosur: https://cdn.example.com/brosur-premium.pdf. Pelan lantai https://cdn.example.com/plan.png' });
    await aiSetup(c, 'Sales', { instructions: 'Menu: https://cdn.example.com/menu.jpg', knowledge_ids: [k.body.id], skills: { attachment: { enabled: true, prompt: '' } } });
    const media: string[] = [];
    (c.sender as unknown as { sendMedia: (...a: unknown[]) => Promise<{ id: string }> }).sendMedia = async (_to, kind, url) => { media.push(`${kind}:${url}`); return { id: `wamid.m${media.length}` }; };
    const tries = ['https://cdn.example.com/brosur-premium.pdf', 'https://cdn.example.com/menu.jpg', 'https://cdn.example.com/invented.pdf', 'https://cdn.example.com/plan.exe', 'http://cdn.example.com/plan.png', 'https://cdn.example.com/plan.png'];
    for (const [i, u] of tries.entries()) c.steps.push(() => toolResponse('send_attachment', { url: u }, `a${i}`));
    c.steps.push(() => textResponse('Sila lihat lampiran.'));
    await inbound(c, '601', 'hantar brosur');
    expect(media).toEqual(['document:https://cdn.example.com/brosur-premium.pdf', 'image:https://cdn.example.com/menu.jpg', 'image:https://cdn.example.com/plan.png']);
    const run = c.store.runs(1)[0] as { tool_calls: { ok: boolean; message: string }[] };
    expect(run.tool_calls.map((t) => t.ok)).toEqual([true, true, false, false, false, true]);
    expect(run.tool_calls[2].message).toContain('not found in your instructions');
    expect(run.tool_calls[3].message).toContain('Unsupported file type');
    expect(run.tool_calls[4].message).toContain('https');
    expect(c.store.messages(c.store.listConversations()[0].id).filter((m) => m.type === 'document' || m.type === 'image')).toHaveLength(3);
  });

  it('caps attachments at 5 per reply', async () => {
    const c = setup({ echoFallback: false });
    const urls = Array.from({ length: 7 }, (_, i) => `https://cdn.example.com/p${i}.png`);
    await aiSetup(c, 'Sales', { instructions: urls.join(' '), skills: { attachment: { enabled: true, prompt: '' } } });
    let n = 0;
    (c.sender as unknown as { sendMedia: () => Promise<{ id: string }> }).sendMedia = async () => ({ id: `wamid.m${n++}` });
    for (const [i, u] of urls.entries()) c.steps.push(() => toolResponse('send_attachment', { url: u }, `a${i}`));
    c.steps.push(() => textResponse('done'));
    await inbound(c, '601', 'gambar');
    const run = c.store.runs(1)[0] as { tool_calls: { ok: boolean }[] };
    expect(run.tool_calls.filter((t) => t.ok)).toHaveLength(5);
  });

  it('registers templates, validates them and sends one outside the 24h window', async () => {
    const c = setup({ echoFallback: false });
    expect((await api(c, 'POST', '/api/templates', { name: 'Bad Name', language: 'en', body: 'x' })).status).toBe(400);
    expect((await api(c, 'POST', '/api/templates', { name: 'promo', language: 'english', body: 'x' })).status).toBe(400);
    const t = await api(c, 'POST', '/api/templates', { name: 'promo', language: 'ms', body: 'Hai {{1}}, kod {{2}}' });
    expect(t.body).toMatchObject({ name: 'promo', params: 2 });
    await inbound(c, '601', 'hi');
    const conv = c.store.listConversations()[0];
    c.store.patchConversation(conv.id, { last_inbound_at: Date.now() - 30 * 3600_000 });
    expect((await api(c, 'POST', `/api/conversations/${conv.id}/messages`, { text: 'free text' })).status).toBe(502);
    const sent: unknown[][] = [];
    (c.sender as unknown as { sendTemplate: (...a: unknown[]) => Promise<{ id: string }> }).sendTemplate = async (...a) => { sent.push(a); return { id: 'wamid.t' }; };
    const ok = await api(c, 'POST', `/api/conversations/${conv.id}/template`, { name: 'promo', params: ['Aina', 'RAYA'] });
    expect(ok.status).toBe(200);
    expect(sent[0]).toEqual(['601', 'promo', 'ms', ['Aina', 'RAYA']]);
    expect(ok.body.message.body).toBe('Hai Aina, kod RAYA');
    expect((await api(c, 'POST', `/api/conversations/${conv.id}/template`, { name: 'promo', params: ['only one'] })).status).toBe(400);
    expect((await api(c, 'POST', `/api/conversations/${conv.id}/template`, { name: 'ghost', params: [] })).status).toBe(400);
    expect((await api(c, 'DELETE', `/api/templates/${t.body.id}`)).status).toBe(204);
  });

  it('chooses WhatsApp buttons (<=3, <=20 chars), lists (<=10, <=24 chars) or numbered text', () => {
    expect(interactiveKind(['Ya', 'Tidak'])).toBe('buttons');
    expect(interactiveKind(['Satu', 'Dua', 'Tiga', 'Empat'])).toBe('list');
    expect(interactiveKind(['Pakej yang sangat panjang sekali ya', 'b'])).toBeNull();
    expect(interactiveKind(Array.from({ length: 11 }, (_, i) => `c${i}`))).toBeNull();
    const p = interactivePayload({ body: 'Pilih', choices: ['Ya', 'Tidak'] }) as { type: string; action: { buttons: { reply: { title: string } }[] } };
    expect(p.type).toBe('button');
    expect(p.action.buttons.map((b) => b.reply.title)).toEqual(['Ya', 'Tidak']);
    expect((interactivePayload({ body: 'Pilih', choices: ['A', 'B', 'C', 'D'] }) as { type: string }).type).toBe('list');
  });

  it('falls back to numbered text when the channel has no interactive support', async () => {
    const c = setup({ echoFallback: false });
    delete (c.sender as unknown as { sendInteractive?: unknown }).sendInteractive;
    Object.setPrototypeOf(c.sender, { sendText: (c.sender as unknown as { sendText: unknown }).sendText });
    (c.sender as unknown as { sendInteractive?: unknown }).sendInteractive = undefined;
    await inbound(c, '601', 'hi');
    const conv = c.store.listConversations()[0];
    const m = await c.pipeline.sendChoices(conv.id, 'Pilih satu', ['Harga', 'Sokongan'], 'workflow');
    expect(m.body).toBe('Pilih satu\n1. Harga\n2. Sokongan');
  });

  it('builds correct Cloud API payloads for templates, interactive and media', async () => {
    const bodies: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return json({ messages: [{ id: 'wamid.x' }] }); }) as unknown as typeof fetch;
    const s = new CloudApiSender({ waAccessToken: 't', waPhoneNumberId: '123', waApiVersion: 'v21.0' }, f);
    await s.sendTemplate('601', 'promo', 'ms', ['Aina', 'RAYA']);
    await s.sendInteractive('601', { body: 'Pilih', choices: ['Ya', 'Tidak'] });
    await s.sendMedia('601', 'document', 'https://x.my/a.pdf', 'Resit', 'a.pdf');
    expect(bodies[0]).toMatchObject({ messaging_product: 'whatsapp', to: '601', type: 'template', template: { name: 'promo', language: { code: 'ms' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Aina' }, { type: 'text', text: 'RAYA' }] }] } });
    expect(bodies[1]).toMatchObject({ type: 'interactive', interactive: { type: 'button' } });
    expect(bodies[2]).toMatchObject({ type: 'document', document: { link: 'https://x.my/a.pdf', caption: 'Resit', filename: 'a.pdf' } });
  });
});

describe('M8: operations', () => {
  it('reports metrics', async () => {
    const c = setup({ echoFallback: false });
    await aiSetup(c, 'Sales', { skills: { set_lifecycle: { enabled: true, prompt: '' } } });
    c.steps.push(() => toolResponse('update_lifecycle_stage', { stage: 'Hot Lead' }));
    c.steps.push(() => textResponse('Hai'));
    await inbound(c, '601', 'hi');
    const m = (await api(c, 'GET', '/api/metrics?days=7')).body;
    expect(m.days).toBe(7);
    expect(m.conversations).toMatchObject({ total: 1, open: 1 });
    expect(m.contacts.byLifecycle).toEqual([{ k: 'Hot Lead', v: 1 }]);
    expect(m.messages.inbound).toBe(1);
    expect(m.messages.bySender).toEqual([{ k: 'ai', v: 1 }]);
    expect(m.ai.runs).toBe(1);
    expect(m.ai.inputTokens).toBeGreaterThan(0);
    expect(m.ai.byAgent).toEqual([{ k: 'Sales', v: 1 }]);
  });

  it('pauses the AI (and tells a human) when a conversation exceeds the hourly run budget', async () => {
    const c = setup({ echoFallback: false, aiMaxRunsPerHour: 2 });
    await aiSetup(c, 'Sales', {});
    for (let i = 0; i < 3; i++) c.steps.push(() => textResponse(`r${i}`));
    for (let i = 0; i < 4; i++) await inbound(c, '601', `m${i}`);
    const conv = c.store.listConversations()[0];
    expect(c.provider.requests).toHaveLength(2);
    expect(c.store.getConversation(conv.id)).toMatchObject({ handler: 'human', agent_id: null });
    expect(c.store.comments(conv.id)[0].body).toContain('AI paused');
  });

  it('recovers unanswered conversations after a restart', async () => {
    const c = setup({ echoFallback: false });
    const a = await aiSetup(c, 'Sales', {});
    const contact = c.store.upsertContact('601', 'Aina');
    const conv = c.store.createConversation(contact.id);
    c.store.patchConversation(conv.id, { handler: 'ai', agent_id: a.id, last_inbound_at: Date.now() });
    c.store.insertMessage({ conversation_id: conv.id, direction: 'in', sender: 'contact', body: 'masih ada orang?', status: 'received' });
    c.steps.push(() => textResponse('Ada, apa khabar?'));
    expect(c.pipeline.recover()).toBe(1);
    await c.pipeline.idle();
    expect(c.sender.sent.at(-1)!.body).toBe('Ada, apa khabar?');
    expect(c.pipeline.recover()).toBe(0); // already handled
  });
});
