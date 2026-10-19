import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True for loopback, private, link-local (incl. cloud metadata), CGNAT and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateAddress(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new Error('Private URLs are not allowed');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error(`Cannot resolve host ${host}`); });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('Private URLs are not allowed');
  return u;
}

export interface FetchedPage { url: string; contentType: string; body: string }

/** Public-web-only fetch: re-validates every redirect hop, caps size and time. */
export async function safeFetchText(raw: string, opts: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<FetchedPage> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const f = opts.fetchImpl ?? fetch;
  let url = (await assertPublicUrl(raw)).toString();
  for (let hop = 0; hop < 5; hop++) {
    const res = await f(url, { redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), headers: { 'user-agent': 'wa-agent-knowledge/0.1', accept: 'text/html,text/plain,text/markdown,*/*;q=0.5' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = (await assertPublicUrl(new URL(res.headers.get('location')!, url).toString())).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!/^(text\/|application\/(xhtml|json|xml))/i.test(contentType)) throw new Error(`Unsupported content type "${contentType}" (only text/HTML pages are supported)`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Page too large'); }
        chunks.push(value);
      }
    }
    return { url, contentType, body: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Too many redirects');
}
