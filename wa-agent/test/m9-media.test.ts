import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWebhook } from '../src/channels/whatsapp.js';
import { textResponse } from '../src/agent/llm.js';
import type { Graph, Step } from '../src/workflow/types.js';
import { api, inbound, publishAgent, setup, signed, type Ctx } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);
const PDF = Buffer.from('%PDF-1.4\n%fake pdf body');
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.from('fake-opus-body')]);
const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

type File = { mime: string; bytes: Buffer; size?: number; url?: string };
function graph(files: Record<string, File>, extra: { transcript?: string | (() => Response) } = {}) {
  const calls: { url: string; auth: string | null; body?: unknown }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization'), body: init?.body });
    const g = url.match(/graph\.facebook\.com\/v21\.0\/([\w-]+)$/);
    if (g) {
      const file = files[g[1]];
      return file ? j({ url: file.url ?? `https://93.184.216.34/dl/${g[1]}`, mime_type: file.mime, file_size: file.size ?? file.bytes.length }) : j({ error: { message: 'Unsupported get request. Object does not exist' } }, 400);
    }
    const d = url.match(/\/dl\/([\w-]+)$/);
    if (d && files[d[1]]) return new Response(new Uint8Array(files[d[1]].bytes), { status: 200, headers: { 'content-type': files[d[1]].mime } });
    if (url.includes('/audio/transcriptions')) return typeof extra.transcript === 'function' ? extra.transcript() : j({ text: extra.transcript ?? '' });
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function mediaPayload(from: string, type: string, media: Record<string, unknown>, id = 'wamid.' + Math.random().toString(36).slice(2)) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: from, profile: { name: 'Aina' } }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type, [type]: media }] } }] }] };
}
async function receive(c: Ctx, type: string, media: Record<string, unknown>, from = '601') {
  const r = signed(mediaPayload(from, type, media));
  await c.app.inject({ method: 'POST', url: '/webhook/whatsapp', ...r });
  await c.drain();
  const conv = c.store.lastConversation(c.store.contactByPhone(from)!.id)!;
  return { conv, msg: c.store.messages(conv.id).filter((m) => m.direction === 'in').at(-1)!, media: c.store.mediaForConversation(conv.id).at(-1) };
}
const wa = { waAccessToken: 'EAAtoken', waPhoneNumberId: '123', echoFallback: false } as const;
const files = (n: number) => readdirSync(join(n === 0 ? '' : '')).length; void files;
const stored = (c: Ctx) => { const out: string[] = []; const walk = (d: string) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : out.push(join(d, e.name)); }; walk(c.cfg.mediaDir); return out; };

describe('M9: inbound media', () => {
  it('parses media descriptors out of the webhook', () => {
    const m = (type: string, media: Record<string, unknown>) => parseWebhook(mediaPayload('601', type, media)).messages[0];
    expect(m('image', { id: 'm1', mime_type: 'image/jpeg', caption: 'rosak' })).toMatchObject({ text: '[Image] rosak', media: { kind: 'image', id: 'm1', mime: 'image/jpeg', caption: 'rosak' } });
    expect(m('audio', { id: 'a1', mime_type: 'audio/ogg; codecs=opus' })).toMatchObject({ type: 'audio', media: { kind: 'audio', id: 'a1', mime: 'audio/ogg; codecs=opus' } });
    expect(m('document', { id: 'd1', mime_type: 'application/pdf', filename: 'resit.pdf' }).media).toMatchObject({ kind: 'document', filename: 'resit.pdf' });
    expect(m('video', { id: 'v1', mime_type: 'video/mp4' }).media!.kind).toBe('video');
    expect(m('sticker', { id: 's1', mime_type: 'image/webp' }).media!.kind).toBe('sticker');
    expect(parseWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '6', id: 'x', timestamp: '1', type: 'text', text: { body: 'hi' } }] } }] }] }).messages[0].media).toBeUndefined();
  });

  it('downloads in two authenticated steps, validates, stores privately and serves it back safely', async () => {
    const { f, calls } = graph({ m1: { mime: 'image/png', bytes: PNG } });
    const c = setup({ ...wa, adminToken: 'tok' }, f);
    const { msg, media } = await receive(c, 'image', { id: 'm1', mime_type: 'image/png', caption: 'rosak' });
    expect(calls.map((x) => x.url)).toEqual(['https://graph.facebook.com/v21.0/m1', 'https://93.184.216.34/dl/m1']);
    expect(calls.every((x) => x.auth === 'Bearer EAAtoken')).toBe(true);
    expect(msg.body).toBe('[Image] rosak');
    expect(media).toMatchObject({ kind: 'image', mime: 'image/png', status: 'stored', size: PNG.length, caption: 'rosak' });
    expect(media).not.toHaveProperty('path'); // file paths never leave the server
    const files = stored(c);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/[0-9a-f]{64}\.png$/); // named by content hash, never by anything the sender controls

    const unauth = await c.app.inject({ method: 'GET', url: `/api/media/${media!.id}` });
    expect(unauth.statusCode).toBe(401);
    const res = await c.app.inject({ method: 'GET', url: `/api/media/${media!.id}?token=tok` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(PNG)).toBe(true);
    expect(res.headers).toMatchObject({ 'content-type': 'image/png', 'x-content-type-options': 'nosniff' });
    expect(String(res.headers['content-security-policy'])).toContain('sandbox');
    expect((await c.app.inject({ method: 'GET', url: '/api/media/999?token=tok' })).statusCode).toBe(404);
  });

  it('rejects files whose content does not match, unsupported types, oversize files and unsafe downloads', async () => {
    const { f, calls } = graph({
      liar: { mime: 'image/png', bytes: Buffer.from('<script>alert(1)</script>') },
      zip: { mime: 'application/zip', bytes: Buffer.from('PK\x03\x04') },
      huge: { mime: 'image/jpeg', bytes: JPG, size: 99 * 1024 * 1024 },
      plain: { mime: 'image/jpeg', bytes: JPG, url: 'http://93.184.216.34/dl/plain' },
      lan: { mime: 'image/jpeg', bytes: JPG, url: 'https://127.0.0.1/dl/lan' },
      svgish: { mime: 'image/svg+xml', bytes: Buffer.from('<svg/>') },
    });
    const c = setup({ ...wa }, f);
    const r = async (id: string, mime: string, kind = 'image') => (await receive(c, kind, { id, mime_type: mime })).media!;
    expect(await r('liar', 'image/png')).toMatchObject({ status: 'failed', error: expect.stringContaining('does not match') });
    expect(await r('zip', 'application/zip', 'document')).toMatchObject({ status: 'skipped', error: expect.stringContaining('unsupported file type') });
    expect(await r('huge', 'image/jpeg')).toMatchObject({ status: 'failed', error: expect.stringContaining('larger than') });
    expect(await r('plain', 'image/jpeg')).toMatchObject({ status: 'failed', error: expect.stringContaining('https') });
    expect(await r('lan', 'image/jpeg')).toMatchObject({ status: 'failed', error: expect.stringMatching(/Private/) });
    expect(await r('svgish', 'image/svg+xml')).toMatchObject({ status: 'skipped' }); // SVG can carry scripts: never stored
    expect(await r('gone', 'image/png')).toMatchObject({ status: 'failed', error: expect.stringContaining('could not resolve media') });
    const before = calls.length;
    expect(await r('../../etc/passwd', 'image/png')).toMatchObject({ status: 'failed', error: 'invalid media id' });
    expect(calls.length).toBe(before); // no request is even made for a malformed id
    expect((await receive(c, 'video', { id: 'v1', mime_type: 'video/mp4' })).media).toMatchObject({ status: 'skipped' });
    expect(stored(c)).toHaveLength(0);
  });

  it('is skipped (with a reason) when WhatsApp credentials are missing', async () => {
    const c = setup({ echoFallback: false });
    const { media } = await receive(c, 'image', { id: 'm1', mime_type: 'image/png' });
    expect(media).toMatchObject({ status: 'skipped', error: expect.stringContaining('not configured') });
  });

  it('stores identical files once, and cleanup only removes the file when no row needs it', async () => {
    const { f } = graph({ a: { mime: 'image/png', bytes: PNG }, b: { mime: 'image/png', bytes: PNG } });
    const c = setup({ ...wa, mediaRetentionDays: 1 }, f);
    await receive(c, 'image', { id: 'a', mime_type: 'image/png' });
    await receive(c, 'image', { id: 'b', mime_type: 'image/png' });
    expect(stored(c)).toHaveLength(1);
    const [m1, m2] = c.store.mediaForConversation(1);
    // age only the first row: its file is still referenced by the second
    c.store.db.prepare('UPDATE media SET created_at = ? WHERE id = ?').run(Date.now() - 2 * 86_400_000, m1.id);
    expect(c.media.cleanup()).toBe(1);
    expect(stored(c)).toHaveLength(1);
    expect(c.store.getMedia(m1.id)).toMatchObject({ status: 'expired', path: null });
    c.store.db.prepare('UPDATE media SET created_at = ? WHERE id = ?').run(Date.now() - 2 * 86_400_000, m2.id);
    expect(c.media.cleanup()).toBe(1);
    expect(stored(c)).toHaveLength(0);
    expect((await c.app.inject({ method: 'GET', url: `/api/media/${m2.id}` })).statusCode).toBe(404);
    expect(c.media.cleanup()).toBe(0);
  });

  it('refuses paths that escape the media directory', () => {
    const c = setup();
    expect(c.media.fileFor({ path: '../../etc/passwd' })).toBeNull();
    expect(c.media.fileFor({ path: '/etc/passwd' })).toBeNull();
    expect(c.media.fileFor({ path: 'ab/abcdef.png' })).toContain('wa-media-');
    expect(c.media.fileFor({ path: null })).toBeNull();
  });
});

describe('M9: voice notes', () => {
  it('transcribes with the configured provider and uses the transcript everywhere', async () => {
    const { f, calls } = graph({ v1: { mime: 'audio/ogg; codecs=opus', bytes: OGG } }, { transcript: 'saya nak tahu harga pakej' });
    const c = setup({ ...wa, transcribeUrl: 'https://stt.example.test/v1/audio/transcriptions', transcribeKey: 'stt-key', transcribeModel: 'whisper-1' }, f);
    const { msg, media } = await receive(c, 'audio', { id: 'v1', mime_type: 'audio/ogg; codecs=opus' });
    expect(msg.body).toBe('[Voice note] saya nak tahu harga pakej');
    expect(media).toMatchObject({ kind: 'audio', mime: 'audio/ogg', transcript: 'saya nak tahu harga pakej' });
    const call = calls.find((x) => x.url.includes('/audio/transcriptions'))!;
    expect(call.auth).toBe('Bearer stt-key');
    const form = call.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect((form.get('file') as unknown as Blob).size).toBe(OGG.length);
    // the WhatsApp token must never be sent to the transcription provider
    expect(JSON.stringify(calls.filter((x) => x.url.includes('stt.example')))).not.toContain('EAAtoken');
  });

  it('a spoken answer satisfies a workflow question', async () => {
    const { f } = graph({ v1: { mime: 'audio/ogg', bytes: OGG } }, { transcript: '5,000' });
    const c = setup({ ...wa, transcribeUrl: 'https://stt.example.test/v1/audio/transcriptions' }, f);
    const st = (id: string, type: Step['type'], config: Step['config'], next: string | null = null): Step => ({ id, type, config, next });
    const graphDef: Graph = { start: 'q', steps: { q: st('q', 'ask_question', { text: 'Bajet anda?', qtype: 'number', save_as: { field: 'Budget' } }, 'done'), done: st('done', 'update_lifecycle', { stage: 'Qualified' }) } };
    const w = await api(c, 'POST', '/api/workflows', { name: 'Voice', trigger: { type: 'conversation_opened' }, graph: graphDef });
    await api(c, 'POST', `/api/workflows/${w.body.id}/publish`);
    await inbound(c, '601', 'hi', 'x1');
    await receive(c, 'audio', { id: 'v1', mime_type: 'audio/ogg' });
    const contact = c.store.contactByPhone('601')!;
    expect(contact).toMatchObject({ fields: { Budget: 5000 }, lifecycle: 'Qualified' });
  });

  it('keeps the placeholder when no transcriber is configured or transcription fails', async () => {
    const { f } = graph({ v1: { mime: 'audio/ogg', bytes: OGG } });
    const none = setup({ ...wa }, f);
    expect((await receive(none, 'audio', { id: 'v1', mime_type: 'audio/ogg' })).msg.body).toBe('[Audio message]');
    const { f: bad } = graph({ v1: { mime: 'audio/ogg', bytes: OGG } }, { transcript: () => j({ error: { message: 'quota exceeded' } }, 429) });
    const c = setup({ ...wa, transcribeUrl: 'https://stt.example.test/v1/audio/transcriptions' }, bad);
    const r = await receive(c, 'audio', { id: 'v1', mime_type: 'audio/ogg' });
    expect(r.msg.body).toBe('[Audio message]');
    expect(r.media).toMatchObject({ status: 'stored', error: expect.stringContaining('quota exceeded') });
  });
});

describe('M9: the AI sees images and PDFs', () => {
  const sim = (c: Ctx, kind: string, mime: string, bytes: Buffer, caption?: string, from = '601') =>
    api(c, 'POST', '/api/dev/simulate-media', { from, name: 'Aina', kind, mime, data: bytes.toString('base64'), caption });

  it('attaches the image as a real content block next to the text', async () => {
    const c = setup({ echoFallback: false });
    const a = await publishAgent(c, 'Support');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: a.id });
    c.steps.push((req) => {
      const last = req.messages.at(-1)!.content as { type: string; source?: { type: string; media_type: string; data: string }; text?: string }[];
      expect(last[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
      expect(last.at(-1)).toMatchObject({ type: 'text', text: '[Image] telefon pecah' });
      expect(req.system.map((s) => s.text).join('\n')).toContain('5 most recent');
      return textResponse('Nampak skrin retak. Saya sambungkan ke sokongan.');
    });
    const r = await sim(c, 'image', 'image/png', PNG, 'telefon pecah');
    await c.pipeline.idle();
    expect(r.status).toBe(200);
    expect(c.store.runs(a.id)[0].error).toBeNull();
    expect(c.sender.sent.at(-1)!.body).toContain('skrin retak');
  });

  it('sends PDFs as document blocks, at most 5 files, newest last; oversize images stay as text', async () => {
    const c = setup({ echoFallback: false });
    const a = await publishAgent(c, 'Support', { wait_seconds: 0.05 });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: a.id });
    c.cfg.mediaMaxBytes = 30 * 1024 * 1024;
    const big = Buffer.concat([JPG, Buffer.alloc(5 * 1024 * 1024)]);
    c.steps.push(() => textResponse('ok'));
    await sim(c, 'image', 'image/png', PNG, '1');
    for (let i = 2; i <= 6; i++) await sim(c, 'image', 'image/jpeg', Buffer.concat([JPG, Buffer.from(String(i))]), String(i));
    await sim(c, 'document', 'application/pdf', PDF, 'resit');
    await sim(c, 'image', 'image/jpeg', big, 'terlalu besar');
    await c.drain();
    c.steps.push((req) => {
      // files may sit on earlier user turns: count across the whole window
      const blocks = req.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; source?: { media_type: string } }[]) : [])).filter((b) => b.type !== 'text');
      expect(blocks).toHaveLength(4); // newest 5 files = akhir, oversize(skipped: >5MB), pdf, img6, img5
      expect(blocks.length).toBeLessThanOrEqual(5);
      expect(blocks.some((b) => b.type === 'document' && b.source!.media_type === 'application/pdf')).toBe(true);
      expect(JSON.stringify(req.messages)).toContain('terlalu besar'); // placeholder text still there
      return textResponse('ok');
    });
    await sim(c, 'image', 'image/png', PNG, 'akhir');
    await c.pipeline.idle();
    expect(c.provider.requests.length).toBeGreaterThan(1);
    expect(c.store.runs(a.id)[0].error).toBeNull(); // the assertions inside the scripted step really passed
  });

  it('exposes media in the conversation API without paths and validates the simulator', async () => {
    const c = setup({ echoFallback: false });
    await sim(c, 'image', 'image/png', PNG, 'x');
    const conv = c.store.listConversations()[0];
    const t = await api(c, 'GET', `/api/conversations/${conv.id}`);
    expect(t.body.media[0]).toMatchObject({ kind: 'image', status: 'stored', mime: 'image/png' });
    expect(JSON.stringify(t.body.media)).not.toMatch(/path|sha256/);
    expect((await api(c, 'POST', '/api/dev/simulate-media', { from: '601', kind: 'image' })).status).toBe(400);
    expect((await api(c, 'POST', '/api/dev/simulate-media', { from: '601', kind: 'video', data: 'AAAA' })).status).toBe(400);
    const bad = await sim(c, 'image', 'image/png', Buffer.from('not an image'));
    expect(c.store.mediaForConversation(conv.id).at(-1)).toMatchObject({ status: 'failed' });
    expect(bad.status).toBe(200);
    expect((await api(setup({ devSimulator: false }), 'POST', '/api/dev/simulate-media', { from: '1', kind: 'image', data: 'AA' })).status).toBe(404);
  });
});
