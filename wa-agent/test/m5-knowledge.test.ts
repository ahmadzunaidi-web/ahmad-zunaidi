import { describe, expect, it } from 'vitest';
import { textResponse, toolResponse } from '../src/agent/llm.js';
import { chunkText, htmlToText } from '../src/knowledge/chunk.js';
import { assertPublicUrl, isPrivateAddress, safeFetchText } from '../src/knowledge/safe-fetch.js';
import { api, inbound, publishAgent, setup } from './helpers.js';

const PRICING = `Harga Pakej

Pakej Asas berharga RM100 sebulan termasuk 1 pengguna dan sokongan emel.

Pakej Premium berharga RM300 sebulan termasuk 5 pengguna dan sokongan WhatsApp 24 jam.

Waktu operasi

Kami dibuka Isnin hingga Jumaat, 9 pagi hingga 5 petang. Tutup pada hujung minggu dan cuti umum.`;

describe('M5: knowledge + retrieval', () => {
  it('chunks text on paragraph boundaries and keeps chunks bounded', () => {
    const chunks = chunkText(PRICING, 120, 20);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 140)).toBe(true);
    expect(chunks.join(' ')).toContain('RM300');
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('a'.repeat(2000), 500, 50).every((c) => c.length <= 500)).toBe(true);
  });

  it('extracts readable text, title and links from HTML and drops scripts/nav', () => {
    const { title, text, links } = htmlToText('<html><head><title>Harga &amp; Pakej</title><script>evil()</script></head><body><nav>menu</nav><h1>Pakej</h1><p>RM100 <b>sebulan</b></p><a href="/lagi">lagi</a></body></html>');
    expect(title).toBe('Harga & Pakej');
    expect(text).toContain('RM100 sebulan');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('menu');
    expect(links).toEqual(['/lagi']);
  });

  it('ingests text, finds it by content keywords (BM25) and ignores unselected sources', async () => {
    const c = setup();
    const a = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: PRICING });
    const b = await api(c, 'POST', '/api/knowledge', { name: 'Lain-lain', text: 'Alamat pejabat kami di Johor Bahru. Parking percuma.' });
    expect(a.body).toMatchObject({ status: 'completed', type: 'text' });
    expect(a.body.chunks).toBeGreaterThan(0);

    const hit = await api(c, 'POST', '/api/knowledge/search', { query: 'berapa harga pakej premium' });
    expect(hit.body.hits[0].text).toContain('Pakej Premium');
    expect(hit.body.hits[0].source).toBe('Harga');

    const scoped = await api(c, 'POST', '/api/knowledge/search', { query: 'parking', source_ids: [a.body.id] });
    expect(scoped.body.hits).toHaveLength(0); // the agent only sees the sources selected for it
    const other = await api(c, 'POST', '/api/knowledge/search', { query: 'parking', source_ids: [b.body.id] });
    expect(other.body.hits[0].source).toBe('Lain-lain');
    // searching by document TITLE does not work: only keywords inside the content do
    expect((await api(c, 'POST', '/api/knowledge/search', { query: 'Lain-lain' })).body.hits).toHaveLength(0);
    // FTS syntax characters in a question must not break the query
    expect((await api(c, 'POST', '/api/knowledge/search', { query: 'harga" OR (pakej*' })).status).toBe(200);
  });

  it('deletes a source with its chunks and validates input', async () => {
    const c = setup();
    const a = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: PRICING });
    expect((await api(c, 'DELETE', `/api/knowledge/${a.body.id}`)).status).toBe(204);
    expect((await api(c, 'POST', '/api/knowledge/search', { query: 'premium' })).body.hits).toHaveLength(0);
    expect((await api(c, 'DELETE', `/api/knowledge/${a.body.id}`)).status).toBe(404);
    expect((await api(c, 'POST', '/api/knowledge', { name: 'x', text: '   ' })).status).toBe(400);
    expect((await api(c, 'POST', '/api/knowledge', { name: '', text: 'abc' })).status).toBe(400);
    expect((await api(c, 'POST', '/api/knowledge', { name: 'x' })).status).toBe(400);
  });

  it('lets the agent answer from the knowledge base using the search tool and reports sources', async () => {
    const c = setup({ echoFallback: false });
    const k = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: PRICING });
    const agent = await publishAgent(c, 'Support Agent', { knowledge_ids: [k.body.id], skills: {} });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => toolResponse('search_knowledge_base', { query: 'harga pakej premium' }, 's1'));
    c.steps.push((req) => {
      const r = req.messages.at(-1)!.content as unknown as { content: string }[];
      expect(r[0].content).toContain('RM300');
      expect(r[0].content).toContain('source: Harga');
      return textResponse('Pakej Premium RM300 sebulan.');
    });
    await inbound(c, '601', 'berapa harga premium?');
    expect(c.sender.sent.at(-1)!.body).toBe('Pakej Premium RM300 sebulan.');
    expect(c.provider.requests[0].tools.map((t) => t.name)).toContain('search_knowledge_base');

    // sources are visible in the Test panel
    const t = await api(c, 'POST', `/api/agents/${agent.id}/test`, { history: [{ role: 'user', text: 'harga?' }] });
    c.steps.push(() => toolResponse('search_knowledge_base', { query: 'harga' }));
    c.steps.push(() => textResponse('RM100'));
    const t2 = await api(c, 'POST', `/api/agents/${agent.id}/test`, { history: [{ role: 'user', text: 'harga?' }] });
    expect(t.status).toBe(500); // no scripted step left for the first call -> surfaced as an error, not a crash
    expect(t2.body.sources[0].source).toBe('Harga');
  });

  it('tells the model when nothing matches, and omits the tool when the agent has no knowledge', async () => {
    const c = setup({ echoFallback: false });
    const k = await api(c, 'POST', '/api/knowledge', { name: 'Harga', text: PRICING });
    const withKb = await publishAgent(c, 'A', { knowledge_ids: [k.body.id], skills: {} });
    const noKb = await publishAgent(c, 'B', { skills: {} });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: withKb.id });
    c.steps.push(() => toolResponse('search_knowledge_base', { query: 'kereta terbang' }));
    c.steps.push((req) => {
      expect(JSON.stringify(req.messages.at(-1)!.content)).toContain('No matching content');
      return textResponse('Maaf, saya tiada maklumat tentang itu.');
    });
    await inbound(c, '601', 'ada kereta terbang?');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: noKb.id });
    c.steps.push(() => textResponse('ok'));
    await inbound(c, '602', 'hi');
    expect(c.provider.requests.at(-1)!.tools.map((t) => t.name)).not.toContain('search_knowledge_base');
  });

  it('rejects knowledge ids that do not exist when saving an agent', async () => {
    const c = setup();
    expect((await api(c, 'POST', '/api/agents', { name: 'X', draft: { knowledge_ids: [42] } })).status).toBe(400);
  });
});

describe('M5: URL ingestion is SSRF-safe', () => {
  it('classifies private/loopback/link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('blocks internal targets before any request is made', async () => {
    for (const u of ['http://localhost/x', 'http://127.0.0.1:3000/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'file:///etc/passwd', 'ftp://example.com', 'http://user:pw@93.184.216.34/', 'http://metadata.internal/']) {
      await expect(assertPublicUrl(u), u).rejects.toThrow();
    }
    await expect(assertPublicUrl('http://93.184.216.34/')).resolves.toBeInstanceOf(URL);
  });

  it('re-validates every redirect hop', async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })) as unknown as typeof fetch;
    await expect(safeFetchText('http://93.184.216.34/', { fetchImpl: f })).rejects.toThrow(/Private/);
  });

  it('rejects non-text content and oversized pages', async () => {
    const png = (async () => new Response('x', { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
    await expect(safeFetchText('http://93.184.216.34/a.png', { fetchImpl: png })).rejects.toThrow(/Unsupported content type/);
    const big = (async () => new Response('x'.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
    await expect(safeFetchText('http://93.184.216.34/', { fetchImpl: big, maxBytes: 1000 })).rejects.toThrow(/too large/);
  });

  it('crawls same-host links to the requested depth and records failures instead of throwing', async () => {
    const pages: Record<string, string> = {
      'http://93.184.216.34/': '<title>Home</title><p>Selamat datang</p><a href="/harga">harga</a><a href="http://8.8.8.8/luar">external</a>',
      'http://93.184.216.34/harga': '<title>Harga</title><p>Pakej Asas RM100</p><a href="/dalam">dalam</a>',
      'http://93.184.216.34/dalam': '<p>Kandungan rahsia kedalaman dua</p>',
      'http://8.8.8.8/luar': '<p>Halaman luaran unik</p>',
    };
    const f = (async (u: string) => (pages[u] ? new Response(pages[u], { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nope', { status: 404 }))) as unknown as typeof fetch;
    const c = setup({}, f);
    const src = await api(c, 'POST', '/api/knowledge', { name: 'Site', url: 'http://93.184.216.34/', depth: 1 });
    expect(src.body.status).toBe('completed');
    const q = async (query: string) => (await api(c, 'POST', '/api/knowledge/search', { query })).body.hits.length;
    expect(await q('Pakej Asas')).toBeGreaterThan(0);
    expect(await q('rahsia')).toBe(0); // depth 2 not crawled
    expect(await q('luaran')).toBe(0); // other hosts not followed

    const fail = await api(c, 'POST', '/api/knowledge', { name: 'Broken', url: 'http://93.184.216.34/missing' });
    expect(fail.body).toMatchObject({ status: 'error', chunks: 0 });
    expect(fail.body.error).toContain('404');
    const priv = await api(c, 'POST', '/api/knowledge', { name: 'Internal', url: 'http://127.0.0.1:3000/api/conversations' });
    expect(priv.body.status).toBe('error');
    expect(priv.body.error).toMatch(/Private/);
  });
});
