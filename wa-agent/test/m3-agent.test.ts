import { describe, expect, it } from 'vitest';
import { textResponse, toolResponse, type LlmRequest } from '../src/agent/llm.js';
import { buildMessages, substituteVars } from '../src/agent/runtime.js';
import { api, inbound, postInbound, publishAgent, setup } from './helpers.js';

const sysText = (r: LlmRequest) => r.system.map((s) => s.text).join('\n');

describe('M3: AI agent runtime', () => {
  it('replies as the assigned agent with workspace names, contact context and substituted variables', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Sales Agent', { instructions: '# ROLE\nBe friendly. Greet $contact.firstname. Budget: $contact.budget.' });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => textResponse('Hai Aina! Boleh saya bantu?'));
    await inbound(c, '601', 'Hai');

    const req = c.provider.requests[0];
    const sys = sysText(req);
    expect(sys).toContain('Greet Aina.');
    expect(sys).toContain('Sales Team');
    expect(sys).toContain('"Hot Lead"');
    expect(sys).toContain('Current time:');
    expect(sys).toContain('Budget: .'); // known-but-empty custom field becomes empty, not left as a raw variable
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.messages).toEqual([{ role: 'user', content: 'Hai' }]);
    expect(c.sender.sent.at(-1)!.body).toBe('Hai Aina! Boleh saya bantu?');
    const conv = c.store.listConversations()[0];
    expect(conv.handler).toBe('ai');
    expect(c.store.messages(conv.id).at(-1)).toMatchObject({ sender: 'ai', direction: 'out', status: 'sent' });
    expect(c.store.runs(agent.id)[0]).toMatchObject({ reply: 'Hai Aina! Boleh saya bantu?', error: null });
  });

  it('merges consecutive turns, drops a leading assistant turn and never ends on an assistant turn', () => {
    const msgs = buildMessages([
      { role: 'assistant', text: 'old greeting' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'assistant', text: 'c' },
    ]);
    expect(msgs[0]).toEqual({ role: 'user', content: 'a\nb' });
    expect(msgs.at(-1)!.role).toBe('user'); // never ends on an assistant turn (no prefill)
  });

  it('keeps the window to 20 messages in the model request', async () => {
    const c = setup({ echoFallback: false });
    const agent = await publishAgent(c, 'Receptionist');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => textResponse(''));
    for (let i = 0; i < 25; i++) {
      const conv = c.store.findOpenConversation(c.store.upsertContact('601', null).id) ?? c.store.createConversation(c.store.upsertContact('601', null).id);
      c.store.insertMessage({ conversation_id: conv.id, direction: i % 2 ? 'out' : 'in', sender: i % 2 ? 'human' : 'contact', body: `old ${i}`, status: 'received' });
    }
    await inbound(c, '601', 'newest');
    const flat = c.provider.requests[0].messages.map((m) => String(m.content)).join('\n');
    expect(flat).toContain('newest');
    expect(flat).not.toContain('old 0\n');
    expect(flat).not.toContain('old 3');
  });

  it('waits for the contact to finish typing (debounce) and answers once', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Receptionist', { wait_seconds: 0.1 });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => textResponse('Satu jawapan sahaja'));
    await postInbound(c, '601', 'baris 1', 'w1');
    await postInbound(c, '601', 'baris 2', 'w2');
    await postInbound(c, '601', 'baris 3', 'w3');
    const t0 = Date.now();
    await c.drain();
    expect(c.provider.requests).toHaveLength(1);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(60); // waited for the quiet period
    expect(c.provider.requests[0].messages).toEqual([{ role: 'user', content: 'baris 1\nbaris 2\nbaris 3' }]);
    expect(c.sender.sent.map((s) => s.body)).toEqual(['Satu jawapan sahaja']);
  });

  it('drops a stale reply and re-runs when a newer message arrives mid-run', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Receptionist');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => {
      void c.pipeline.handleInbound({ waMessageId: 'late-1', from: '601', name: null, timestamp: Date.now(), type: 'text', text: 'tunggu, soalan lain' });
      return textResponse('JAWAPAN LAMA');
    });
    c.steps.push(() => textResponse('JAWAPAN BARU'));
    await inbound(c, '601', 'soalan pertama');
    const bodies = c.sender.sent.map((s) => s.body);
    expect(bodies).toContain('JAWAPAN BARU');
    expect(bodies).not.toContain('JAWAPAN LAMA');
    expect(c.provider.requests).toHaveLength(2);
  });

  it('adds an internal comment (never a customer message) when the model API fails', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Receptionist');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => { throw new Error('529 overloaded'); });
    await inbound(c, '601', 'hi');
    const conv = c.store.listConversations()[0];
    expect(c.sender.sent).toHaveLength(0);
    expect(c.store.comments(conv.id)[0].body).toContain('529 overloaded');
    expect(c.store.runs(agent.id)[0].error).toContain('529 overloaded');
  });

  it('does not run an unpublished agent and falls back to echo', async () => {
    const c = setup();
    const created = await api(c, 'POST', '/api/agents', { name: 'Draft', draft: { instructions: 'x' } });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: created.body.id });
    await inbound(c, '601', 'hi');
    expect(c.provider.requests).toHaveLength(0);
    expect(c.sender.sent[0].body).toBe('🔁 hi');
  });

  it('versions agents: edits to the draft do not change the live agent until publish', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Receptionist', { instructions: 'VERSION ONE' });
    await api(c, 'PUT', `/api/agents/${agent.id}`, { draft: { instructions: 'VERSION TWO' } });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => textResponse('ok'));
    await inbound(c, '601', 'hi');
    expect(sysText(c.provider.requests[0])).toContain('VERSION ONE');
    await api(c, 'POST', `/api/agents/${agent.id}/publish`);
    c.steps.push(() => textResponse('ok'));
    await inbound(c, '601', 'again');
    expect(sysText(c.provider.requests.at(-1)!)).toContain('VERSION TWO');
    expect(c.store.getAgent(agent.id)!.published_version).toBe(2);
  });

  it('validates agent input: instruction limit, names, wait time, unknown skills', async () => {
    const c = setup();
    expect((await api(c, 'POST', '/api/agents', { name: 'A', draft: { instructions: 'x'.repeat(10_001) } })).status).toBe(400);
    expect((await api(c, 'POST', '/api/agents', { name: '' })).status).toBe(400);
    await api(c, 'POST', '/api/agents', { name: 'Dup' });
    expect((await api(c, 'POST', '/api/agents', { name: 'Dup' })).status).toBe(400);
    expect((await api(c, 'POST', '/api/agents', { name: 'W', draft: { wait_seconds: 999 } })).status).toBe(400);
    expect((await api(c, 'POST', '/api/agents', { name: 'S', draft: { skills: { hack: { enabled: true, prompt: '' } } } })).status).toBe(400);
    const empty = await api(c, 'POST', '/api/agents', { name: 'Empty' });
    expect((await api(c, 'POST', `/api/agents/${empty.body.id}/publish`)).status).toBe(400);
  });

  it('substitutes $contact variables with values and leaves unknown ones alone', () => {
    const c = setup();
    const env = { workspace: c.workspace, state: { contact: { name: 'Aina Ali', phone: '601', email: null, lifecycle: 'Hot Lead', tags: [], fields: { Budget: 5000 } }, status: 'open', handler: 'ai', assignee_team: null, assignee_user: null }, effects: {} as never, agents: [], selfName: 'x', searchKnowledge: () => [] } as never;
    expect(substituteVars('Hi $contact.firstname ($contact.lifecycle), RM$contact.budget, $contact.unknownthing', env)).toBe('Hi Aina (Hot Lead), RM5000, $contact.unknownthing');
  });

  it('passes the "Test AI Agent" simulation without persisting anything', async () => {
    const c = setup();
    const created = await api(c, 'POST', '/api/agents', { name: 'Tester', draft: { instructions: 'Qualify leads', skills: { set_lifecycle: { enabled: true, prompt: 'When budget > 100 set Hot Lead' }, set_field: { enabled: true, prompt: '' } } } });
    c.steps.push(() => toolResponse('update_contact_field', { field: 'Budget', value: '5,000' }, 't1'));
    c.steps.push(() => toolResponse('update_lifecycle_stage', { stage: 'Hot Lead' }, 't2'));
    c.steps.push(() => textResponse('Terima kasih!'));
    const r = await api(c, 'POST', `/api/agents/${created.body.id}/test`, { history: [{ role: 'user', text: 'bajet saya 5000' }] });
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe('Terima kasih!');
    expect(r.body.actions).toEqual(['Field Budget = 5000', 'Lifecycle → Hot Lead']);
    expect(r.body.state.contact).toMatchObject({ lifecycle: 'Hot Lead', fields: { Budget: 5000 } });
    expect(c.store.listConversations()).toHaveLength(0);
    expect(c.sender.sent).toHaveLength(0);
    // tool descriptions carry the owner's "when and how" prompt
    expect(JSON.stringify(c.provider.requests[0].tools)).toContain('When budget > 100 set Hot Lead');
  });
});
