import { describe, expect, it } from 'vitest';
import { api, inbound, publishAgent, setup } from './helpers.js';
import { textResponse } from '../src/agent/llm.js';

describe('M2: inbox API + manual handover', () => {
  it('lists conversations with last message and returns a full thread', async () => {
    const c = setup();
    await inbound(c, '601', 'Hai');
    const list = await api(c, 'GET', '/api/conversations');
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ contact_name: 'Aina Binti Ali', wa_id: '601', handler: 'none', status: 'open' });
    expect(list.body[0].last_body).toBe('🔁 Hai');
    const thread = await api(c, 'GET', `/api/conversations/${list.body[0].id}`);
    expect(thread.body.messages).toHaveLength(2);
    expect(thread.body.contact.wa_id).toBe('601');
    expect((await api(c, 'GET', '/api/conversations/999')).status).toBe(404);
  });

  it('lets a human reply after taking over and blocks replies while an AI handles the chat', async () => {
    const c = setup();
    const agent = await publishAgent(c, 'Receptionist');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => textResponse('Hai, ada apa saya boleh bantu?'));
    await inbound(c, '601', 'Hai');
    const id = c.store.listConversations()[0].id;
    expect(c.store.getConversation(id)!.handler).toBe('ai');

    const blocked = await api(c, 'POST', `/api/conversations/${id}/messages`, { text: 'manual' });
    expect(blocked.status).toBe(409);

    const taken = await api(c, 'POST', `/api/conversations/${id}/takeover`);
    expect(taken.body.conversation).toMatchObject({ handler: 'human', agent_id: null, assignee_user: 'Inbox user' });

    const ok = await api(c, 'POST', `/api/conversations/${id}/messages`, { text: 'Saya Aisyah dari Sales.' });
    expect(ok.status).toBe(200);
    expect(c.sender.sent.at(-1)).toEqual({ to: '601', body: 'Saya Aisyah dari Sales.' });

    // after takeover the AI must stay silent on new customer messages
    const before = c.sender.sent.length;
    await inbound(c, '601', 'terima kasih');
    expect(c.sender.sent.length).toBe(before);
    expect(c.provider.requests).toHaveLength(1);
  });

  it('assigns to a team (round robin), a user, an AI agent, and unassigns', async () => {
    const c = setup();
    await inbound(c, '601', 'a'); await inbound(c, '602', 'b'); await inbound(c, '603', 'c');
    const [c1, c2, c3] = c.store.listConversations().map((x) => x.id).reverse();
    const team = async (id: number) => (await api(c, 'POST', `/api/conversations/${id}/assign`, { team: 'Sales Team' })).body.conversation;
    expect((await team(c1)).assignee_user).toBe('Aisyah');
    expect((await team(c2)).assignee_user).toBe('Hafiz');
    expect((await team(c3)).assignee_user).toBe('Aisyah');
    const user = await api(c, 'POST', `/api/conversations/${c1}/assign`, { user: 'Nur' });
    expect(user.body.conversation).toMatchObject({ assignee_user: 'Nur', assignee_team: 'Support Team', handler: 'human' });
    expect((await api(c, 'POST', `/api/conversations/${c1}/assign`, { team: 'Nope' })).status).toBe(400);
    const un = await api(c, 'POST', `/api/conversations/${c1}/assign`, { unassign: true });
    expect(un.body.conversation).toMatchObject({ handler: 'none', assignee_user: null });
    const inactive = await api(c, 'POST', `/api/agents`, { name: 'Draft only' });
    expect((await api(c, 'POST', `/api/conversations/${c1}/assign`, { agent_id: inactive.body.id })).status).toBe(400);
  });

  it('closes with a valid closing note, rejects unknown notes, and reopens on the next message', async () => {
    const c = setup({ echoFallback: false });
    await inbound(c, '601', 'hi');
    const id = c.store.listConversations()[0].id;
    expect((await api(c, 'POST', `/api/conversations/${id}/status`, { status: 'closed', closing_note: 'Made up' })).status).toBe(400);
    const closed = await api(c, 'POST', `/api/conversations/${id}/status`, { status: 'closed', closing_note: 'Issue Resolved', summary: 'Asked about hours' });
    expect(closed.body.conversation).toMatchObject({ status: 'closed', closing_note: 'Issue Resolved', handler: 'none' });
    await inbound(c, '601', 'satu lagi');
    expect(c.store.getConversation(id)).toMatchObject({ status: 'open' });
    expect(c.store.events(id).map((e) => e.type)).toContain('reopened');
    expect(c.store.listConversations()).toHaveLength(1);
  });

  it('stores internal comments and validates them', async () => {
    const c = setup();
    await inbound(c, '601', 'hi');
    const id = c.store.listConversations()[0].id;
    const ok = await api(c, 'POST', `/api/conversations/${id}/comments`, { text: 'VIP customer' });
    expect(ok.body.comment).toMatchObject({ author: 'Inbox user', body: 'VIP customer' });
    expect((await api(c, 'POST', `/api/conversations/${id}/comments`, { text: '' })).status).toBe(400);
    expect((await api(c, 'POST', `/api/conversations/${id}/comments`, { text: 'x'.repeat(2001) })).status).toBe(400);
    // internal comments are never sent to the customer
    expect(c.sender.sent.map((s) => s.body)).not.toContain('VIP customer');
  });

  it('simulates an inbound customer message in dev and 404s when the simulator is off', async () => {
    const c = setup();
    const r = await api(c, 'POST', '/api/dev/simulate', { from: '+60 12-345 6789', name: 'Tester', text: 'hello' });
    expect(r.status).toBe(200);
    expect(r.body.conversation.contact_id).toBeGreaterThan(0);
    expect(c.store.upsertContact('60123456789', null).name).toBe('Tester');
    expect((await api(c, 'POST', '/api/dev/simulate', { from: '', text: 'x' })).status).toBe(400);
    const off = setup({ devSimulator: false });
    expect((await api(off, 'POST', '/api/dev/simulate', { from: '1', text: 'x' })).status).toBe(404);
  });

  it('publishes live events when messages arrive', async () => {
    const c = setup();
    const seen: string[] = [];
    c.hub.subscribe((e) => seen.push(e.type));
    await inbound(c, '601', 'hi');
    expect(seen).toContain('message');
    expect(seen).toContain('conversation');
  });
});
