import { describe, expect, it } from 'vitest';
import { textResponse } from '../src/agent/llm.js';
import { parseAnswer, parseDate } from '../src/workflow/engine.js';
import type { Graph, Step, Trigger } from '../src/workflow/types.js';
import { api, inbound, publishAgent, setup, type Ctx } from './helpers.js';

/** Build a linear/branching graph tersely. */
const g = (start: string, ...steps: Step[]): Graph => ({ start, steps: Object.fromEntries(steps.map((s) => [s.id, s])) });
const st = (id: string, type: Step['type'], config: Step['config'], next: string | null = null, outputs?: Step['outputs']): Step => ({ id, type, config, next, ...(outputs ? { outputs } : {}) });

async function makeWorkflow(c: Ctx, name: string, trigger: Trigger, graph: Graph, settings = {}) {
  const r = await api(c, 'POST', '/api/workflows', { name, trigger, graph, settings });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  const p = await api(c, 'POST', `/api/workflows/${r.body.id}/publish`);
  if (p.status !== 200) throw new Error(JSON.stringify(p.body));
  return p.body as { id: number; name: string; hook_url: string | null };
}

const menu = (extra: Partial<Step['config']> = {}) => st('q', 'ask_question', { text: 'Apa yang anda perlukan?', qtype: 'choice', choices: ['Harga', 'Sokongan', 'Cakap dengan orang'], save_as: { variable: 'topic' }, failure_branch: true, ...extra }, 'branch', { failure: 'ai' });

describe('M6: answers are validated per question type', () => {
  it('validates every question type', () => {
    expect(parseAnswer({ qtype: 'choice', choices: ['Harga', 'Sokongan'] }, 'harga')).toEqual({ ok: true, value: 'Harga' });
    expect(parseAnswer({ qtype: 'choice', choices: ['Harga', 'Sokongan'] }, '2')).toEqual({ ok: true, value: 'Sokongan' });
    expect(parseAnswer({ qtype: 'choice', choices: ['Harga'] }, '3').ok).toBe(false);
    expect(parseAnswer({ qtype: 'number', min: 1, max: 10 }, '5')).toEqual({ ok: true, value: 5 });
    expect(parseAnswer({ qtype: 'number', min: 1, max: 10 }, '11').ok).toBe(false);
    expect(parseAnswer({ qtype: 'number' }, 'RM5,000')).toMatchObject({ ok: false });
    expect(parseAnswer({ qtype: 'number' }, '5,000')).toEqual({ ok: true, value: 5000 });
    expect(parseAnswer({ qtype: 'email' }, 'A@B.my')).toEqual({ ok: true, value: 'a@b.my' });
    expect(parseAnswer({ qtype: 'email' }, 'nope').ok).toBe(false);
    expect(parseAnswer({ qtype: 'phone' }, '+60 11-2233 455')).toEqual({ ok: true, value: '60112233455' });
    expect(parseAnswer({ qtype: 'phone' }, '123').ok).toBe(false);
    expect(parseAnswer({ qtype: 'url' }, 'https://x.my/a')).toMatchObject({ ok: true });
    expect(parseAnswer({ qtype: 'url' }, 'javascript:alert(1)').ok).toBe(false);
    expect(parseAnswer({ qtype: 'rating' }, '4')).toEqual({ ok: true, value: 4 });
    expect(parseAnswer({ qtype: 'rating' }, '⭐⭐⭐')).toEqual({ ok: true, value: 3 });
    expect(parseAnswer({ qtype: 'rating' }, '9').ok).toBe(false);
    expect(parseAnswer({ qtype: 'location' }, '(3.1545313, 101.7151839)')).toEqual({ ok: true, value: '3.1545313,101.7151839' });
    expect(parseAnswer({ qtype: 'location' }, '[Location] KLCC (3.15, 101.71)')).toMatchObject({ ok: true });
    expect(parseAnswer({ qtype: 'location' }, '(95, 10)').ok).toBe(false);
    expect(parseAnswer({ qtype: 'text' }, '   ').ok).toBe(false);
  });

  it('parses dates in the configured format and rejects impossible dates', () => {
    expect(parseDate('31/12/2026', 'DD/MM/YYYY')).toEqual({ ok: true, value: '2026-12-31' });
    expect(parseDate('2026-02-30', 'YYYY-MM-DD').ok).toBe(false);
    expect(parseDate('Mar-05-2026', 'MMM-DD-YYYY')).toEqual({ ok: true, value: '2026-03-05' });
    expect(parseDate('12-25', 'MM-DD')).toMatchObject({ ok: true });
    expect(parseDate('2026/01/02', 'DD/MM/YYYY').ok).toBe(false);
  });
});

describe('M6: workflow lifecycle and validation', () => {
  it('stores drafts, blocks incomplete publishes and lists every problem', async () => {
    const c = setup();
    const created = await api(c, 'POST', '/api/workflows', { name: 'Draft', trigger: { type: 'conversation_opened' }, graph: g('a', st('a', 'send_message', { text: '' }, 'zz')) });
    expect(created.status).toBe(400); // points to a missing step: unsafe to store
    const ok = await api(c, 'POST', '/api/workflows', { name: 'Draft', trigger: { type: 'conversation_opened' }, graph: g('a', st('a', 'send_message', { text: '' }, null), st('orphan', 'wait', { minutes: 5 })) });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('draft');
    const pub = await api(c, 'POST', `/api/workflows/${ok.body.id}/publish`);
    expect(pub.status).toBe(400);
    expect(pub.body.issues.map((i: { message: string }) => i.message)).toEqual(expect.arrayContaining(['Message text is required', 'This step is not connected to the start and will never run']));
    expect((await api(c, 'POST', '/api/workflows', { name: 'Draft' })).status).toBe(400); // names are unique
    expect((await api(c, 'POST', '/api/workflows', { name: 'Bad trigger', trigger: { type: 'contact_tag_updated' } })).status).toBe(400);
  });

  it('publishes, locks editing until stopped, clones and deletes only when not published', async () => {
    const c = setup({ echoFallback: false });
    const w = await makeWorkflow(c, 'Greeter', { type: 'conversation_opened' }, g('s', st('s', 'send_message', { text: 'Hai!' })));
    expect((await api(c, 'PUT', `/api/workflows/${w.id}`, { name: 'Renamed' })).status).toBe(409);
    expect((await api(c, 'DELETE', `/api/workflows/${w.id}`)).status).toBe(409);
    const stopped = await api(c, 'POST', `/api/workflows/${w.id}/stop`);
    expect(stopped.body.status).toBe('stopped');
    expect((await api(c, 'PUT', `/api/workflows/${w.id}`, { name: 'Renamed' })).body.name).toBe('Renamed');
    const clone = await api(c, 'POST', `/api/workflows/${w.id}/clone`);
    expect(clone.body).toMatchObject({ name: 'Renamed clone', status: 'draft' });
    expect((await api(c, 'DELETE', `/api/workflows/${clone.body.id}`)).status).toBe(204);
  });

  it('enforces the 100 step and 150 workflow limits', async () => {
    const c = setup();
    const steps: Step[] = Array.from({ length: 101 }, (_, i) => st(`s${i}`, 'wait', { minutes: 1 }, i < 100 ? `s${i + 1}` : null));
    expect((await api(c, 'POST', '/api/workflows', { name: 'Big', graph: g('s0', ...steps) })).status).toBe(400);
    for (let i = 0; i < 150; i++) c.store.createWorkflow(`w${i}`, { type: 'manual' }, { start: null, steps: {} }, {}, `t${i}`);
    expect((await api(c, 'POST', '/api/workflows', { name: 'One too many' })).status).toBe(400);
  });
});

describe('M6: menu -> AI fallback (the core sales pattern)', () => {
  async function setupMenu(c: Ctx) {
    const ai = await publishAgent(c, 'Sales Agent');
    const sales = st('sales', 'assign_to', { target: { kind: 'team', name: 'Sales Team' } }, null);
    const branch = st('branch', 'branch', { branches: [{ conditions: [{ source: 'var', key: 'topic', op: 'equals', value: 'Cakap dengan orang' }] }] }, null, { b0: 'sales', else: 'ai' });
    const aiStep = st('ai', 'assign_to', { target: { kind: 'agent', name: 'Sales Agent' } }, null);
    const w = await makeWorkflow(c, 'Menu', { type: 'conversation_opened' }, g('hello', st('hello', 'send_message', { text: 'Hai {{$contact.firstname}}!' }, 'q'), menu(), branch, sales, aiStep));
    return { ai, w };
  }

  it('greets, asks with a menu, and routes a valid choice to a human team', async () => {
    const c = setup({ echoFallback: false });
    await setupMenu(c);
    await inbound(c, '601', 'hi', 'm1');
    expect(c.sender.sent.map((s) => s.body)).toEqual(['Hai Aina!', 'Apa yang anda perlukan? [Harga | Sokongan | Cakap dengan orang]']);
    const conv = c.store.listConversations()[0];
    expect(c.store.getConversation(conv.id)).toMatchObject({ handler: 'none' }); // the workflow holds the chat
    expect(c.provider.requests).toHaveLength(0);

    await inbound(c, '601', 'Cakap dengan orang', 'm2');
    expect(c.store.getConversation(conv.id)).toMatchObject({ handler: 'human', assignee_team: 'Sales Team', assignee_user: 'Aisyah' });
    expect(c.provider.requests).toHaveLength(0); // never reached the AI
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'completed', vars: { topic: 'Cakap dengan orang' } });
  });

  it('sends free text that is not a menu option to the AI agent, which answers that very message', async () => {
    const c = setup({ echoFallback: false });
    const { ai } = await setupMenu(c);
    await inbound(c, '601', 'hi', 'm1');
    c.steps.push((req) => {
      expect(String(req.messages.at(-1)!.content)).toContain('berapa harga pakej premium');
      expect(req.system.map((s) => s.text).join('\n')).toContain('Assignment Event');
      return textResponse('Pakej Premium RM300 sebulan.');
    });
    await inbound(c, '601', 'berapa harga pakej premium?', 'm2');
    const conv = c.store.listConversations()[0];
    expect(c.store.getConversation(conv.id)).toMatchObject({ handler: 'ai', agent_id: ai.id });
    expect(c.sender.sent.at(-1)!.body).toBe('Pakej Premium RM300 sebulan.');
  });

  it('does not treat the message that opened the conversation as the answer', async () => {
    const c = setup({ echoFallback: false });
    await setupMenu(c);
    await inbound(c, '601', 'Harga', 'm1'); // looks like a valid choice, but it only opened the chat
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'waiting', wait_kind: 'question' });
  });

  it('re-asks invalid answers and gives up after three when there is no failure branch', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Strict', { type: 'conversation_opened' }, g('q', st('q', 'ask_question', { text: 'Umur?', qtype: 'number', min: 1, max: 120, save_as: { variable: 'age' } }, null)));
    await inbound(c, '601', 'hi', 'a1');
    await inbound(c, '601', 'abc', 'a2');
    await inbound(c, '601', '999', 'a3');
    expect(c.sender.sent.filter((s) => s.body.includes('tidak sah'))).toHaveLength(2);
    await inbound(c, '601', 'xyz', 'a4');
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'exited', ended_reason: 'invalid_answers' });
  });

  it('saves answers to contact fields and tags, and applies timeout/failure outputs', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Intake', { type: 'conversation_opened' }, g('q1',
      st('q1', 'ask_question', { text: 'Bajet?', qtype: 'number', save_as: { field: 'Budget' } }, 'q2'),
      st('q2', 'ask_question', { text: 'Minat?', qtype: 'choice', choices: ['Pricing', 'Demo'], save_as: { tag: true }, timeout_branch: true, timeout_minutes: 10 }, 'done', { timeout: 'late' }),
      st('done', 'update_lifecycle', { stage: 'Qualified' }, null),
      st('late', 'update_tag', { add: ['VIP'] }, null)));
    await inbound(c, '601', 'hi', 'b1');
    await inbound(c, '601', '5,000', 'b2');
    await inbound(c, '601', 'demo', 'b3');
    const contact = c.store.getContact(c.store.listConversations()[0].contact_id)!;
    expect(contact).toMatchObject({ fields: { Budget: 5000 }, tags: ['Demo'], lifecycle: 'Qualified' });

    // timeout path
    await inbound(c, '602', 'hi', 'c1');
    await inbound(c, '602', '200', 'c2');
    await c.engine.tick(Date.now() + 11 * 60_000);
    expect(c.store.getContact(c.store.upsertContact('602', null).id)!.tags).toEqual(['VIP']);
  });
});

describe('M6: steps', () => {
  it('wait / branch / jump / comment / tag / close work together and survive via the timer', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Nurture', { type: 'conversation_opened' }, g('w',
      st('w', 'wait', { minutes: 30 }, 'b'),
      st('b', 'branch', { branches: [{ conditions: [{ source: 'tag', key: 'VIP', op: 'has_tag' }] }] }, null, { b0: 'vip', else: 'plain' }),
      st('vip', 'add_comment', { text: 'VIP {{$contact.firstname}} waited' }, 'close'),
      st('plain', 'update_tag', { add: ['Pricing'] }, 'close'),
      st('close', 'close_conversation', { note: 'Issue Resolved', summary: 'auto' }, null)));
    await inbound(c, '601', 'hi', 'n1');
    const conv = c.store.listConversations()[0];
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'waiting', wait_kind: 'wait' });
    expect(await c.engine.tick(Date.now() + 5 * 60_000)).toBe(0); // not due yet
    expect(await c.engine.tick(Date.now() + 31 * 60_000)).toBe(1);
    expect(c.store.getContact(conv.contact_id)!.tags).toEqual(['Pricing']);
    expect(c.store.getConversation(conv.id)).toMatchObject({ status: 'closed', closing_note: 'Issue Resolved' });
    expect(c.store.runsFor(1)[0].status).toBe('completed');
  });

  it('protects against infinite loops (jump to itself)', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Loop', { type: 'conversation_opened' }, g('a', st('a', 'update_tag', { add: ['Pricing'] }, 'j'), st('j', 'jump_to', { target: 'a' }, null)));
    await inbound(c, '601', 'hi', 'l1');
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'exited', ended_reason: 'loop_guard' });
  });

  it('sends a registered WhatsApp template and fails clearly when it is unknown', async () => {
    const c = setup({ echoFallback: false });
    c.store.upsertTemplate('promo_hello', 'ms', 'Hai {{1}}, promosi hari ini: {{2}}');
    const sent: unknown[] = [];
    (c.sender as unknown as { sendTemplate: (...a: unknown[]) => Promise<{ id: string }> }).sendTemplate = async (...a) => { sent.push(a); return { id: 'wamid.t1' }; };
    await makeWorkflow(c, 'Promo', { type: 'conversation_opened' }, g('t', st('t', 'send_template', { template: 'promo_hello', params: ['{{$contact.firstname}}', '20% diskaun'] }, null)));
    await inbound(c, '601', 'hi', 't1');
    expect(sent[0]).toEqual(['601', 'promo_hello', 'ms', ['Aina', '20% diskaun']]);
    const msg = c.store.messages(c.store.listConversations()[0].id).at(-1)!;
    expect(msg).toMatchObject({ type: 'template', sender: 'workflow', body: 'Hai Aina, promosi hari ini: 20% diskaun' });
    const bad = await api(c, 'POST', '/api/workflows', { name: 'Bad', trigger: { type: 'manual' }, graph: g('t', st('t', 'send_template', { template: 'ghost' }, null)) });
    expect((await api(c, 'POST', `/api/workflows/${bad.body.id}/publish`)).body.error).toContain('not registered');
  });

  it('date_time branches on workspace-timezone windows', async () => {
    const c = setup({ echoFallback: false });
    const all = [0, 1, 2, 3, 4, 5, 6];
    await makeWorkflow(c, 'Hours', { type: 'conversation_opened' }, g('d',
      st('d', 'date_time', { branches: [{ name: 'always', days: all, from: '00:00', to: '23:59' }] }, null, { b0: 'open', else: 'closed' }),
      st('open', 'update_tag', { add: ['Pricing'] }, null), st('closed', 'update_tag', { add: ['Demo'] }, null)));
    await inbound(c, '601', 'hi', 'd1');
    expect(c.store.getContact(c.store.listConversations()[0].contact_id)!.tags).toEqual(['Pricing']);
  });

  it('assign_to queues when everyone is at capacity, then times out to the timeout branch', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Cap', { type: 'conversation_opened' }, g('a',
      st('a', 'assign_to', { target: { kind: 'team', name: 'Support Team' }, max_open: 1, timeout_branch: true, timeout_minutes: 5 }, null, { timeout: 'fallback' }),
      st('fallback', 'add_comment', { text: 'no one free' }, null)));
    const busy = c.store.createConversation(c.store.upsertContact('999', null).id);
    c.store.patchConversation(busy.id, { handler: 'human', assignee_user: 'Nur' });
    await inbound(c, '601', 'hi', 'q1');
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'waiting', wait_kind: 'assign' });
    await c.engine.tick(Date.now() + 6 * 60_000);
    const conv = c.store.listConversations().find((x) => x.wa_id === '601')!;
    expect(c.store.comments(conv.id)[0].body).toBe('no one free');
    expect(c.store.runsFor(1)[0].status).toBe('completed');
  });
});

describe('M6: triggers', () => {
  it('fires on tag/field/lifecycle changes with filters, and never re-triggers itself', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'On VIP tag', { type: 'contact_tag_updated', config: { tag: 'VIP', action: 'added' } }, g('a', st('a', 'update_field', { field: 'Company', value: 'VIP-{{$contact.firstname}}' }, null)));
    await makeWorkflow(c, 'On budget', { type: 'contact_field_updated', config: { field: 'Budget' } }, g('a', st('a', 'update_lifecycle', { stage: 'Hot Lead' }, null)));
    await makeWorkflow(c, 'Self loop', { type: 'lifecycle_updated', config: { stage: 'Customer' } }, g('a', st('a', 'update_lifecycle', { stage: 'Customer' }, null)));
    await inbound(c, '601', 'hi', 'x1');
    const contact = c.store.listConversations()[0].contact_id;
    expect((await api(c, 'PUT', `/api/contacts/${contact}`, { tags: ['VIP'] })).body.fields.Company).toBe('VIP-Aina');
    expect((await api(c, 'PUT', `/api/contacts/${contact}`, { tags: ['VIP', 'Pricing'] })).status).toBe(200); // other tag: no match
    await api(c, 'PUT', `/api/contacts/${contact}`, { fields: { Budget: 500 } });
    expect(c.store.getContact(contact)!.lifecycle).toBe('Hot Lead');
    await api(c, 'PUT', `/api/contacts/${contact}`, { lifecycle: 'Customer' });
    expect(c.store.runsFor(3).length).toBeGreaterThan(0);
    expect(c.store.runsFor(3).length).toBeLessThanOrEqual(1);
    expect((await api(c, 'PUT', `/api/contacts/${contact}`, { tags: ['Nope'] })).status).toBe(400);
    expect((await api(c, 'PUT', `/api/contacts/${contact}`, { fields: { Budget: 'abc' } })).status).toBe(400);
  });

  it('fires on conversation closed, honours source filters and trigger conditions', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'After close', { type: 'conversation_closed', config: { sources: ['user'] }, conditions: [{ source: 'lifecycle', op: 'equals', value: 'Customer' }] }, g('a', st('a', 'update_tag', { add: ['Demo'] }, null)));
    await inbound(c, '601', 'hi', 'x1');
    const conv = c.store.listConversations()[0];
    await api(c, 'POST', `/api/conversations/${conv.id}/status`, { status: 'closed' });
    expect(c.store.runsFor(1)).toHaveLength(0); // condition (Customer) not met
    await api(c, 'POST', `/api/conversations/${conv.id}/status`, { status: 'open' });
    await api(c, 'PUT', `/api/contacts/${conv.contact_id}`, { lifecycle: 'Customer' });
    await api(c, 'POST', `/api/conversations/${conv.id}/status`, { status: 'closed' });
    expect(c.store.runsFor(1)).toHaveLength(1);
  });

  it('starts from an incoming webhook with variables, and from a shortcut and Trigger Another Workflow', async () => {
    const c = setup({ echoFallback: false });
    c.store.upsertTemplate('order_update', 'en', 'Order {{1}} is {{2}}');
    (c.sender as unknown as { sendTemplate: (...a: unknown[]) => Promise<{ id: string }> }).sendTemplate = async () => ({ id: 'wamid.x' });
    const hook = await makeWorkflow(c, 'Order hook', { type: 'incoming_webhook' }, g('s', st('s', 'send_template', { template: 'order_update', params: ['{{$trigger.order.id}}', '{{$trigger.status}}'] }, 'f'), st('f', 'update_field', { field: 'Company', value: '{{$trigger.company}}' }, null)));
    expect(hook.hook_url).toMatch(/^\/hooks\/workflow\/[0-9a-f]{32}$/);
    const bad = await c.app.inject({ method: 'POST', url: hook.hook_url!, payload: JSON.stringify({}), headers: { 'content-type': 'application/json' } });
    expect(bad.statusCode).toBe(400);
    const ok = await c.app.inject({ method: 'POST', url: hook.hook_url!, payload: JSON.stringify({ phone: '+60 12-999 8888', name: 'Budi', status: 'shipped', company: 'ACME', order: { id: 'A-77' } }), headers: { 'content-type': 'application/json' } });
    expect(ok.statusCode).toBe(202);
    const contact = c.store.contactByPhone('60129998888')!;
    expect(contact).toMatchObject({ name: 'Budi', fields: { Company: 'ACME' } });
    const conv = c.store.lastConversation(contact.id)!;
    expect(c.store.messages(conv.id).at(-1)!.body).toBe('Order A-77 is shipped');
    expect((await c.app.inject({ method: 'POST', url: '/hooks/workflow/' + 'a'.repeat(32), payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(404);

    // shortcut + manual chaining
    const target = await makeWorkflow(c, 'Tag it', { type: 'manual' }, g('a', st('a', 'update_tag', { add: ['VIP'] }, null)));
    await makeWorkflow(c, 'Shortcut', { type: 'shortcut', config: { label: 'Mark VIP' } }, g('a', st('a', 'trigger_workflow', { workflow_id: target.id }, null)));
    const sc = c.store.listWorkflows().find((w) => w.name === 'Shortcut')!;
    await inbound(c, '601', 'hi', 'z1');
    const conv2 = c.store.listConversations().find((x) => x.wa_id === '601')!;
    expect((await api(c, 'POST', `/api/conversations/${conv2.id}/shortcut`, { workflow_id: sc.id })).status).toBe(200);
    expect(c.store.getContact(conv2.contact_id)!.tags).toEqual(['VIP']);
    expect((await api(c, 'POST', `/api/conversations/${conv2.id}/shortcut`, { workflow_id: target.id })).status).toBe(400); // not a shortcut workflow
  });

  it('starts from a click-to-WhatsApp ad referral and filters by campaign', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Ad promo', { type: 'click_to_chat_ad', config: { campaign: 'raya' } }, g('a', st('a', 'send_message', { text: 'Promo {{$trigger.headline}}' }, null)));
    const payload = (body: object) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '601', profile: { name: 'A' } }], messages: [{ from: '601', id: 'ad-' + Math.random(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'hi' }, ...body }] } }] }] });
    const { signed } = await import('./helpers.js');
    const post = async (p: object) => { const r = signed(p); await c.app.inject({ method: 'POST', url: '/webhook/whatsapp', ...r }); await c.drain(); };
    await post(payload({ referral: { source_url: 'https://fb.me/x', source_id: '1', source_type: 'ad', headline: 'Jualan Raya' } }));
    expect(c.sender.sent.map((s) => s.body)).toContain('Promo Jualan Raya');
    const c2 = setup({ echoFallback: false });
    await makeWorkflow(c2, 'Ad promo', { type: 'click_to_chat_ad', config: { campaign: 'raya' } }, g('a', st('a', 'send_message', { text: 'x' }, null)));
    const r2 = signed(payload({ referral: { headline: 'Other', source_url: '', source_id: '', source_type: 'ad' } }));
    await c2.app.inject({ method: 'POST', url: '/webhook/whatsapp', ...r2 }); await c2.drain();
    expect(c2.sender.sent).toHaveLength(0);
  });

  it('exit conditions: a human reply or manual assign ends a waiting run', async () => {
    const c = setup({ echoFallback: false });
    await makeWorkflow(c, 'Patient', { type: 'conversation_opened' }, g('w', st('w', 'wait', { minutes: 60 }, null)), { exit_on_outgoing: true });
    await inbound(c, '601', 'hi', 'e1');
    const conv = c.store.listConversations()[0];
    await api(c, 'POST', `/api/conversations/${conv.id}/takeover`);
    await api(c, 'POST', `/api/conversations/${conv.id}/messages`, { text: 'Saya di sini' });
    expect(c.store.runsFor(1)[0]).toMatchObject({ status: 'exited', ended_reason: 'agent_replied' });
  });

  it('stopping a workflow ejects contacts, and a stopped workflow no longer triggers', async () => {
    const c = setup({ echoFallback: false });
    const w = await makeWorkflow(c, 'Stopper', { type: 'conversation_opened' }, g('w', st('w', 'wait', { minutes: 60 }, null)));
    await inbound(c, '601', 'hi', 's1');
    const stopped = await api(c, 'POST', `/api/workflows/${w.id}/stop`);
    expect(stopped.body.ejected).toBe(1);
    expect(c.store.runsFor(w.id)[0]).toMatchObject({ status: 'exited', ended_reason: 'workflow_stopped' });
    await inbound(c, '602', 'hi', 's2');
    expect(c.store.runsFor(w.id)).toHaveLength(1);
  });

  it('tests a draft workflow for a phone number', async () => {
    const c = setup({ echoFallback: false });
    const r = await api(c, 'POST', '/api/workflows', { name: 'Draft test', trigger: { type: 'manual' }, graph: g('s', st('s', 'send_message', { text: 'Ujian untuk {{$contact.firstname}}' }, null)) });
    // no recent message from this number: WhatsApp forbids free text, so the step records a clear failure
    const cold = await api(c, 'POST', `/api/workflows/${r.body.id}/test`, { phone: '60188888888', name: 'Cold' });
    expect(cold.status).toBe(200);
    expect(c.store.messages(c.store.lastConversation(c.store.contactByPhone('60188888888')!.id)!.id).at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('24h') });
    await inbound(c, '60177777777', 'hi', 'tt1');
    const run = await api(c, 'POST', `/api/workflows/${r.body.id}/test`, { phone: '60177777777', name: 'Tester' });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ status: 'completed', is_test: true });
    expect(c.sender.sent.at(-1)!.body).toBe('Ujian untuk Tester');
    expect((await api(c, 'POST', `/api/workflows/${r.body.id}/test`, { phone: '12' })).status).toBe(400);
  });

  it('an HTTP step saves response fields as variables and follows the failure branch on errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.includes('/ok') ? new Response(JSON.stringify({ data: { tier: 'gold' } }), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('nope', { status: 500 });
    }) as unknown as typeof fetch;
    const c = setup({ echoFallback: false }, f);
    await makeWorkflow(c, 'Lookup', { type: 'conversation_opened' }, g('h',
      st('h', 'http_request', { method: 'POST', url: 'https://93.184.216.34/ok/{{$contact.phone}}', headers: { 'x-api-key': 'k1' }, body: '{"name":"{{$contact.name}}"}', save: [{ var: 'tier', path: 'data.tier' }], failure_branch: true }, 'tag', { failure: 'bad' }),
      st('tag', 'send_message', { text: 'Tier: {{$var.tier}}' }, null), st('bad', 'send_message', { text: 'gagal' }, null)));
    await makeWorkflow(c, 'Lookup fail', { type: 'conversation_closed' }, g('h', st('h', 'http_request', { method: 'GET', url: 'https://93.184.216.34/bad', failure_branch: true }, 'x', { failure: 'bad' }), st('x', 'send_message', { text: 'ok?' }, null), st('bad', 'add_comment', { text: 'http failed' }, null)));
    await inbound(c, '601', 'hi', 'h1');
    expect(c.sender.sent.at(-1)!.body).toBe('Tier: gold');
    expect(calls[0].url).toBe('https://93.184.216.34/ok/601');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: 'Aina Binti Ali' });
    const conv = c.store.listConversations()[0];
    await api(c, 'POST', `/api/conversations/${conv.id}/status`, { status: 'closed' });
    expect(c.store.comments(conv.id).map((x) => x.body)).toContain('http failed');
    // private targets are refused even in workflows
    const c2 = setup({ echoFallback: false }, f);
    await makeWorkflow(c2, 'Evil', { type: 'conversation_opened' }, g('h', st('h', 'http_request', { method: 'GET', url: 'http://127.0.0.1:3000/api/conversations', failure_branch: true }, 'x', { failure: 'bad' }), st('x', 'send_message', { text: 'leaked' }, null), st('bad', 'send_message', { text: 'blocked' }, null)));
    await inbound(c2, '601', 'hi', 'h2');
    expect(c2.sender.sent.map((s) => s.body)).toEqual(['blocked']);
  });
});
