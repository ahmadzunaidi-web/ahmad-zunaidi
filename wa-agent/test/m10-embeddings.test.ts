import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textResponse, toolResponse } from '../src/agent/llm.js';
import { openDb } from '../src/db.js';
import { BATCH_SIZE, dot, Embedder, fromBlob, normalize, toBlob, type EmbedConfig } from '../src/knowledge/embed.js';
import { fuse } from '../src/knowledge/vector.js';
import { api, inbound, publishAgent, setup } from './helpers.js';

const CONCEPTS = [
  ['harga', 'berharga', 'kos', 'bayaran', 'price', 'cost', 'fee', 'rm100', 'rm300'],
  ['pakej', 'plan', 'langganan', 'subscription', 'package'],
  ['sebulan', 'bulanan', 'monthly', 'month'],
  ['waktu', 'operasi', 'jam', 'dibuka', 'buka', 'hours', 'open', 'opening'],
  ['isnin', 'jumaat', 'weekday', 'bekerja'],
  ['hantar', 'dihantar', 'penghantaran', 'shipping', 'delivery', 'kurier'],
];
const DIM = 48;
function vec(text: string): number[] {
  const v = new Array(DIM).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const c = CONCEPTS.findIndex((g) => g.includes(w));
    if (c >= 0) v[(c * 7 + 3) % DIM] += 1;
    else { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % DIM] += 0.15; }
  }
  return v;
}

interface Call { url: string; auth: string | null; body: { model: string; input: string[]; dimensions?: number; input_type?: string } }
function embedApi(o: { status?: () => number; delayMs?: number; shuffle?: boolean; badCount?: boolean; dims?: number } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, auth: new Headers(init.headers).get('authorization'), body });
    if (o.delayMs) await new Promise<void>((res, rej) => { const t = setTimeout(res, o.delayMs); init.signal?.addEventListener('abort', () => { clearTimeout(t); rej(init.signal!.reason); }); });
    const st = o.status?.() ?? 200;
    if (st !== 200) return new Response(JSON.stringify({ error: { message: `status ${st}` } }), { status: st, headers: { 'content-type': 'application/json' } });
    let data = (body.input as string[]).map((t, index) => ({ index, embedding: vec(t).slice(0, o.dims ?? DIM) }));
    if (o.badCount) data = data.slice(1);
    if (o.shuffle) data = [...data].reverse();
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const cfg = (over: Partial<EmbedConfig> = {}): EmbedConfig => ({ embedUrl: 'https://embed.example.test/v1/embeddings', embedKey: 'ek-1', embedModel: 'test-embed', embedDims: 0, embedInputType: false, embedDocPrefix: '', embedQueryPrefix: '', embedQueryTimeoutMs: 300, ...over });
const noSleep = async () => {};
const mk = (over: Partial<EmbedConfig> = {}, api_ = embedApi()) => ({ api: api_, e: new Embedder(cfg(over), api_.f, noSleep) });

const KB = `Harga Pakej

Pakej Asas berharga RM100 sebulan termasuk 1 pengguna dan sokongan emel.

Pakej Premium berharga RM300 sebulan termasuk 5 pengguna dan sokongan WhatsApp 24 jam.

Waktu operasi

Kami dibuka Isnin hingga Jumaat, 9 pagi hingga 5 petang. Tutup pada hujung minggu dan cuti umum.

Penghantaran

Barang dihantar melalui kurier dalam 3 hari bekerja.`;

/** A fully wired app whose knowledge base embeds through the fake provider. */
function app(over: { embed?: Partial<EmbedConfig>; api?: ReturnType<typeof embedApi>; minScore?: number } = {}) {
  const a = over.api ?? embedApi();
  const e = new Embedder(cfg(over.embed), a.f, noSleep);
  const c = setup({ echoFallback: false, embedMinScore: over.minScore ?? 0 }, undefined, e);
  return { c, a, e };
}
async function addKb(c: ReturnType<typeof setup>, name = 'Harga') {
  const r = await api(c, 'POST', '/api/knowledge', { name, text: KB });
  await c.knowledge.idle();
  return r.body as { id: number; chunks: number };
}
const search = (c: ReturnType<typeof setup>, query: string, mode?: string, ids?: number[]) => api(c, 'POST', '/api/knowledge/search', { query, mode, source_ids: ids });
const SEMANTIC = 'berapa kos langganan bulanan'; // shares NO word with the matching chunk

describe('M10: embedding client', () => {
  it('sends an OpenAI-compatible request (auth, model, dimensions, input_type, prefixes)', async () => {
    const { e, api: a } = mk({ embedDims: 24, embedInputType: true, embedDocPrefix: 'passage: ', embedQueryPrefix: 'query: ' });
    await e.embedDocuments(['halo']);
    await e.embedQuery('soalan');
    expect(a.calls[0]).toMatchObject({ url: 'https://embed.example.test/v1/embeddings', auth: 'Bearer ek-1', body: { model: 'test-embed', input: ['passage: halo'], dimensions: 24, input_type: 'document' } });
    expect(a.calls[1].body).toMatchObject({ input: ['query: soalan'], input_type: 'query' });
  });

  it('batches, restores order by index and returns unit-length vectors', async () => {
    const { e, api: a } = mk({}, embedApi({ shuffle: true }));
    const texts = Array.from({ length: BATCH_SIZE * 2 + 6 }, (_, i) => `harga ${i} ${'x'.repeat(i)}`);
    const out = await e.embedDocuments(texts);
    expect(a.calls.map((c) => c.body.input.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 6]);
    expect(out).toHaveLength(texts.length);
    for (const v of out) expect(Math.hypot(...v)).toBeCloseTo(1, 5);
    const direct = normalize(Float32Array.from(vec(texts[3])));
    expect(dot(out[3], direct)).toBeCloseTo(1, 5); // index 3 really is text 3, despite the reversed response
  });

  it('retries 429/5xx for documents with backoff but never for queries', async () => {
    let n = 0;
    const { e, api: a } = mk({}, embedApi({ status: () => (n++ < 2 ? 429 : 200) }));
    expect(await e.embedDocuments(['harga'])).toHaveLength(1);
    expect(a.calls).toHaveLength(3);
    const failing = mk({}, embedApi({ status: () => 503 }));
    await expect(failing.e.embedQuery('x')).rejects.toThrow(/503/);
    expect(failing.api.calls).toHaveLength(1);
    const forbidden = mk({}, embedApi({ status: () => 401 }));
    await expect(forbidden.e.embedDocuments(['x'])).rejects.toThrow(/401/);
    expect(forbidden.api.calls).toHaveLength(1); // 4xx is not retried
  });

  it('times out slow queries and rejects malformed provider answers', async () => {
    await expect(mk({ embedQueryTimeoutMs: 40 }, embedApi({ delayMs: 400 })).e.embedQuery('x')).rejects.toThrow();
    await expect(mk({}, embedApi({ badCount: true })).e.embedDocuments(['a', 'b'])).rejects.toThrow(/1 embeddings for 2 inputs/);
    const bad = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 'x'] }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(new Embedder(cfg(), bad, noSleep).embedDocuments(['a'])).rejects.toThrow(/invalid embedding/);
    const zero = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0, 0] }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(new Embedder(cfg(), zero, noSleep).embedDocuments(['a'])).rejects.toThrow(/zero length/);
  });

  it('round-trips vectors through SQLite blobs regardless of alignment', () => {
    const v = normalize(Float32Array.from([3, 4, 12]));
    const blob = toBlob(v);
    expect(blob.byteLength).toBe(12);
    const shifted = new Uint8Array(13); shifted.set(blob, 1);
    expect(Array.from(fromBlob(shifted.subarray(1)))).toEqual(Array.from(v)); // misaligned view
    expect(dot(v, v)).toBeCloseTo(1, 6);
  });
});

describe('M10: ingestion and hybrid search', () => {
  it('embeds in the background: keywords work at once, vectors join when ready', async () => {
    const { c, a } = app();
    const added = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: KB });
    expect(added.body.embed_status).toBe('pending');
    expect((await search(c, 'premium', 'keyword')).body.hits.length).toBeGreaterThan(0); // BM25 needs no vectors
    await c.knowledge.idle();
    const src = c.store.getSource(added.body.id)!;
    expect(src).toMatchObject({ embed_status: 'done', embed_model: 'test-embed', embed_error: null });
    expect(c.store.embeddingProgress(src.id, 'test-embed')).toEqual({ done: src.chunks, total: src.chunks });
    const blob = c.store.embeddingsFor([src.id], 'test-embed')[0].embedding;
    expect(blob.byteLength).toBe(DIM * 4);
    expect(Math.hypot(...fromBlob(blob))).toBeCloseTo(1, 5);
    expect(a.calls.length).toBeGreaterThan(0);
  });

  it('finds the right chunk by MEANING when no keyword matches (and keyword mode finds nothing)', async () => {
    const { c } = app();
    await addKb(c);
    expect((await search(c, SEMANTIC, 'keyword')).body.hits).toHaveLength(0);
    const hybrid = await search(c, SEMANTIC);
    expect(hybrid.body.mode).toBe('hybrid');
    expect(hybrid.body.hits[0].text).toContain('Pakej Asas');
    expect(hybrid.body.hits[0].via).toEqual(['vector']);
    expect(hybrid.body.hits[0].vector_score).toBeGreaterThan(0.5);
    const vec_ = await search(c, 'bila kedai buka', 'vector');
    expect(vec_.body.hits[0].text).toContain('Isnin');
    const ship = await search(c, 'shipping delivery cost', 'vector');
    expect(ship.body.hits.some((h: { text: string }) => h.text.includes('kurier'))).toBe(true);
  });

  it('ranks chunks found by both methods first', async () => {
    const { c } = app();
    await addKb(c);
    const r = (await search(c, 'harga pakej premium')).body.hits;
    expect(r[0].text).toContain('Premium');
    expect(r[0].via).toEqual(expect.arrayContaining(['keyword', 'vector']));
    const kw = { chunk_id: 1, source_id: 1, source: 's', text: 'a' }, kw2 = { chunk_id: 2, source_id: 1, source: 's', text: 'b' };
    const ve = { chunk_id: 3, source_id: 1, source: 's', text: 'c' }, both = { chunk_id: 2, source_id: 1, source: 's', text: 'b' };
    expect(fuse([kw, kw2], [ve, both], 3).map((h) => h.chunk_id)).toEqual([2, 1, 3]); // 2 is in both lists
    expect(fuse([], [], 5)).toEqual([]);
  });

  it('only searches the selected sources and forgets deleted ones', async () => {
    const { c } = app();
    const a = await addKb(c, 'Harga');
    const b = (await api(c, 'POST', '/api/knowledge', { name: 'Lain', text: 'Alamat pejabat kami di Johor Bahru. Parkir percuma untuk pelanggan.' })).body;
    await c.knowledge.idle();
    expect((await search(c, SEMANTIC, 'vector', [b.id])).body.hits.every((h: { source_id: number }) => h.source_id === b.id)).toBe(true);
    expect((await search(c, SEMANTIC, 'vector', [a.id])).body.hits.length).toBeGreaterThan(0);
    await api(c, 'DELETE', `/api/knowledge/${a.id}`);
    expect((await search(c, SEMANTIC, 'vector', [a.id])).body.hits).toHaveLength(0);
    expect(c.store.embeddingsFor([a.id], 'test-embed')).toHaveLength(0);
  });

  it('applies the minimum similarity cut-off', async () => {
    const { c } = app({ minScore: 0.999 });
    await addKb(c);
    expect((await search(c, SEMANTIC, 'vector')).body.hits).toHaveLength(0);
  });

  it('degrades to keywords when the provider is down or slow, but says so in vector mode', async () => {
    let down = false;
    const a = embedApi({ status: () => (down ? 500 : 200) });
    const { c } = app({ api: a });
    await addKb(c);
    down = true;
    const r = await search(c, 'harga pakej premium');
    expect(r.status).toBe(200);
    expect(r.body.hits[0].via).toEqual(['keyword']); // still answers
    expect((await search(c, SEMANTIC)).body.hits).toHaveLength(0);
    const v = await search(c, SEMANTIC, 'vector');
    expect(v.status).toBe(502);
    const slow = app({ api: embedApi({ delayMs: 500 }), embed: { embedQueryTimeoutMs: 50 } });
    c.knowledge.idle();
    expect(await slow.c.knowledge.search([], 'x')).toEqual([]); // no sources: no provider call at all
    expect(slow.a.calls).toHaveLength(0);
  });

  it('marks a failed embedding run, keeps BM25 working, and recovers with reindex', async () => {
    let st = 401;
    const a = embedApi({ status: () => st });
    const { c } = app({ api: a });
    const kb = await addKb(c);
    const src = c.store.getSource(kb.id)!;
    expect(src).toMatchObject({ embed_status: 'failed', embed_error: expect.stringContaining('401') });
    expect((await search(c, 'premium', 'keyword')).body.hits.length).toBeGreaterThan(0);
    st = 200;
    expect((await api(c, 'POST', '/api/knowledge/reindex', {})).body.queued).toBe(1);
    await c.knowledge.idle();
    expect(c.store.getSource(kb.id)).toMatchObject({ embed_status: 'done', embed_error: null });
    expect((await search(c, SEMANTIC)).body.hits[0].text).toContain('Pakej Asas');
    expect((await api(c, 'POST', '/api/knowledge/reindex', {})).body.queued).toBe(0); // nothing left to do
  });

  it('re-embeds when the model changes and never mixes vectors of different models', async () => {
    const one = app();
    const kb = await addKb(one.c);
    const store = one.c.store;
    const v2 = new Embedder(cfg({ embedModel: 'test-embed-v2' }), embedApi().f, noSleep);
    const { Knowledge } = await import('../src/knowledge/ingest.js');
    const k2 = new Knowledge(store, undefined, v2);
    expect((await k2.search([kb.id], SEMANTIC, { mode: 'vector' })).length).toBe(0); // v1 vectors are ignored by v2
    expect(k2.reindex()).toBe(1);
    await k2.idle();
    expect(store.getSource(kb.id)).toMatchObject({ embed_model: 'test-embed-v2', embed_status: 'done' });
    expect((await k2.search([kb.id], SEMANTIC, { mode: 'vector' }))[0].text).toContain('Pakej Asas');
    expect(k2.reindex(true)).toBe(1); // force recomputes everything
    await k2.idle();
  });

  it('adds nothing and refuses vector modes when embeddings are not configured', async () => {
    const c = setup({ echoFallback: false });
    const a = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: KB });
    expect(a.body.embed_status).toBe('none');
    expect((await search(c, SEMANTIC)).body).toMatchObject({ mode: 'keyword', hits: [] });
    expect((await search(c, SEMANTIC, 'vector')).status).toBe(400);
    expect((await search(c, 'x', 'bogus')).status).toBe(400);
    expect((await api(c, 'POST', '/api/knowledge/reindex', {})).status).toBe(400);
    expect((await api(c, 'GET', '/api/config')).body.embedding).toEqual({ configured: false, model: null });
  });

  it('reports the embedding configuration', async () => {
    const { c } = app();
    expect((await api(c, 'GET', '/api/config')).body.embedding).toEqual({ configured: true, model: 'test-embed' });
  });
});

describe('M10: the AI uses hybrid search', () => {
  it('answers a question that shares no keywords with the document', async () => {
    const { c } = app();
    const kb = await addKb(c);
    const ag = await publishAgent(c, 'Support', { knowledge_ids: [kb.id], skills: {} });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: ag.id });
    c.steps.push(() => toolResponse('search_knowledge_base', { query: SEMANTIC }, 's1'));
    c.steps.push((req) => {
      const r = req.messages.at(-1)!.content as unknown as { content: string }[];
      expect(r[0].content).toContain('Pakej Asas');
      expect(r[0].content).toContain('source: Harga');
      return textResponse('Pakej Asas RM100 sebulan.');
    });
    await inbound(c, '601', 'berapa bayaran langganan?');
    expect(c.store.runs(ag.id)[0].error).toBeNull();
    expect(c.sender.sent.at(-1)!.body).toBe('Pakej Asas RM100 sebulan.');
  });

  it('without embeddings the same question finds nothing (the behaviour before this milestone)', async () => {
    const c = setup({ echoFallback: false });
    const kb = (await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: KB })).body;
    const ag = await publishAgent(c, 'Support', { knowledge_ids: [kb.id], skills: {} });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: ag.id });
    c.steps.push(() => toolResponse('search_knowledge_base', { query: SEMANTIC }, 's1'));
    c.steps.push((req) => { expect(JSON.stringify(req.messages.at(-1)!.content)).toContain('No matching content'); return textResponse('Tiada maklumat.'); });
    await inbound(c, '601', 'berapa bayaran langganan?');
    expect(c.store.runs(ag.id)[0].error).toBeNull();
  });
});

describe('M10: storage migration', () => {
  it('adds the new columns to an existing database without losing data', async () => {
    const { createRequire } = await import('node:module');
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const path = join(mkdtempSync(join(tmpdir(), 'wa-mig-')), 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE knowledge_source (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, uri TEXT, status TEXT NOT NULL, error TEXT, chars INTEGER NOT NULL DEFAULT 0, chunks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE knowledge_chunk (id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL, ord INTEGER NOT NULL, text TEXT NOT NULL);
      INSERT INTO knowledge_source (id, name, type, status, chars, chunks, created_at) VALUES (7, 'Lama', 'text', 'completed', 5, 1, 1);
      INSERT INTO knowledge_chunk (source_id, ord, text) VALUES (7, 0, 'kandungan lama');`);
    old.close();
    const db = openDb(path);
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((r) => r.name);
    expect(cols('knowledge_source')).toEqual(expect.arrayContaining(['embed_status', 'embed_model', 'embed_error']));
    expect(cols('knowledge_chunk')).toEqual(expect.arrayContaining(['embedding', 'embed_model']));
    expect(db.prepare('SELECT embed_status, name FROM knowledge_source WHERE id = 7').get()).toMatchObject({ embed_status: 'none', name: 'Lama' });
    openDb(path); // idempotent
  });
});
