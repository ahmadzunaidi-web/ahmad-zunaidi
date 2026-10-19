import { describe, expect, it } from 'vitest';
import { parseWebhook, splitText, verifySignature } from '../src/channels/whatsapp.js';
import { api, inbound, setup, signed, waPayload } from './helpers.js';

describe('M1: WhatsApp webhook + echo bot', () => {
  it('answers the Meta verification handshake only with the right token', async () => {
    const c = setup();
    const ok = await c.app.inject({ method: 'GET', url: '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
    const no = await c.app.inject({ method: 'GET', url: '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1' });
    expect(no.statusCode).toBe(403);
  });

  it('verifies X-Hub-Signature-256 over the raw body', () => {
    const { payload, headers } = signed({ a: 1 });
    expect(verifySignature('app-secret', Buffer.from(payload), headers['x-hub-signature-256'])).toBe(true);
    expect(verifySignature('other', Buffer.from(payload), headers['x-hub-signature-256'])).toBe(false);
    expect(verifySignature('app-secret', Buffer.from(payload + ' '), headers['x-hub-signature-256'])).toBe(false);
    expect(verifySignature('app-secret', Buffer.from(payload), undefined)).toBe(false);
    expect(verifySignature('app-secret', Buffer.from(payload), 'sha256=zz')).toBe(false);
  });

  it('rejects unsigned and badly signed webhooks, and refuses when no secret is configured', async () => {
    const c = setup();
    const body = JSON.stringify(waPayload('60123', 'hi', 'w1'));
    const bad = await c.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } });
    expect(bad.statusCode).toBe(401);
    const none = await c.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: body, headers: { 'content-type': 'application/json' } });
    expect(none.statusCode).toBe(401);
    expect(c.store.listConversations()).toHaveLength(0);

    const open = setup({ waAppSecret: '' });
    const refused = await open.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: body, headers: { 'content-type': 'application/json' } });
    expect(refused.statusCode).toBe(401);
    const dev = setup({ waAppSecret: '', allowUnsigned: true });
    const accepted = await dev.app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: body, headers: { 'content-type': 'application/json' } });
    expect(accepted.statusCode).toBe(200);
  });

  it('stores the message, creates contact + conversation and echoes it back', async () => {
    const c = setup();
    const res = await inbound(c, '60123456789', 'Hello bot', 'wamid.1');
    expect(res.statusCode).toBe(200);
    const [conv] = c.store.listConversations();
    expect(conv.contact_name).toBe('Aina Binti Ali');
    expect(conv.wa_id).toBe('60123456789');
    const msgs = c.store.messages(conv.id);
    expect(msgs.map((m) => [m.direction, m.sender, m.body])).toEqual([['in', 'contact', 'Hello bot'], ['out', 'echo', '🔁 Hello bot']]);
    expect(msgs[1].status).toBe('sent');
    expect(c.sender.sent).toEqual([{ to: '60123456789', body: '🔁 Hello bot' }]);
  });

  it('is idempotent when Meta redelivers the same message id', async () => {
    const c = setup();
    await inbound(c, '60123', 'once', 'wamid.same');
    await inbound(c, '60123', 'once', 'wamid.same');
    expect(c.sender.sent).toHaveLength(1);
    expect(c.store.messages(c.store.listConversations()[0].id).filter((m) => m.direction === 'in')).toHaveLength(1);
  });

  it('keeps one conversation per contact and separates contacts', async () => {
    const c = setup();
    await inbound(c, '601', 'a');
    await inbound(c, '601', 'b');
    await inbound(c, '602', 'c');
    expect(c.store.listConversations()).toHaveLength(2);
  });

  it('does not echo when echo fallback is off', async () => {
    const c = setup({ echoFallback: false });
    await inbound(c, '601', 'hi');
    expect(c.sender.sent).toHaveLength(0);
  });

  it('flattens non-text messages into readable placeholders', () => {
    const base = (m: object) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '6', profile: { name: 'N' } }], messages: [{ from: '6', id: 'x', timestamp: '1', ...m }] } }] }] });
    const t = (m: object) => parseWebhook(base(m)).messages[0].text;
    expect(t({ type: 'interactive', interactive: { button_reply: { title: 'Ya' } } })).toBe('Ya');
    expect(t({ type: 'interactive', interactive: { list_reply: { title: 'Pakej A' } } })).toBe('Pakej A');
    expect(t({ type: 'image', image: { caption: 'rosak' } })).toBe('[Image] rosak');
    expect(t({ type: 'audio' })).toBe('[Audio message]');
    expect(t({ type: 'reaction', reaction: { emoji: '👍' } })).toBe('[Unsupported message]');
    expect(t({ type: 'location', location: { name: 'KLCC', latitude: 3.15, longitude: 101.7 } })).toContain('KLCC');
  });

  it('applies delivery statuses without downgrading them', async () => {
    const c = setup();
    await inbound(c, '601', 'hi');
    const out = c.store.messages(c.store.listConversations()[0].id)[1];
    const status = (s: string) => c.app.inject({ method: 'POST', url: '/webhook/whatsapp', ...signed({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: out.wa_message_id, status: s }] } }] }] }) });
    await status('read'); await c.drain();
    await status('delivered'); await c.drain();
    expect(c.store.findMessageByWaId(out.wa_message_id!)!.status).toBe('read');
    await status('failed'); await c.drain();
    expect(c.store.findMessageByWaId(out.wa_message_id!)!.status).toBe('failed');
  });

  it('marks a message failed instead of throwing when the Graph API errors', async () => {
    const c = setup();
    c.sender.failNext = true;
    await inbound(c, '601', 'hi');
    const out = c.store.messages(c.store.listConversations()[0].id)[1];
    expect(out.status).toBe('failed');
    expect(out.error).toContain('graph api down');
  });

  it('refuses free-form sends outside the 24h customer-service window', async () => {
    const c = setup();
    await inbound(c, '601', 'hi');
    const id = c.store.listConversations()[0].id;
    c.store.patchConversation(id, { last_inbound_at: Date.now() - 25 * 3600_000 });
    const sent = await c.pipeline.send(id, 'late reply', 'human');
    expect(sent[0].status).toBe('failed');
    expect(sent[0].error).toMatch(/24h/);
    expect(c.sender.sent.map((s) => s.body)).not.toContain('late reply');
  });

  it('splits replies longer than 4096 characters', () => {
    const parts = splitText(('word '.repeat(1500)).trim());
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
  });

  it('protects /api with the admin token when configured', async () => {
    const c = setup({ adminToken: 'tok' });
    expect((await api(c, 'GET', '/api/conversations')).status).toBe(401);
    const ok = await c.app.inject({ method: 'GET', url: '/api/conversations', headers: { authorization: 'Bearer tok' } });
    expect(ok.statusCode).toBe(200);
    const viaQuery = await c.app.inject({ method: 'GET', url: '/api/conversations?token=tok' });
    expect(viaQuery.statusCode).toBe(200);
    expect((await c.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
