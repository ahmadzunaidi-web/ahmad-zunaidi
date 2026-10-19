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

export interface SafeResponse { status: number; url: string; contentType: string; body: string; truncated: boolean }

/**
 * Public-web-only HTTP request: validates the host (and every redirect hop) against private ranges,
 * caps time and size. Used for knowledge crawling and the HTTP-request skill/step.
 */
export async function safeRequest(raw: string, opts: {
  method?: string; headers?: Record<string, string>; body?: string;
  maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch; truncate?: boolean;
} = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const f = opts.fetchImpl ?? fetch;
  let url = (await assertPublicUrl(raw)).toString();
  let method = (opts.method ?? 'GET').toUpperCase();
  let body = opts.body;
  for (let hop = 0; hop < 5; hop++) {
    const res = await f(url, {
      method, redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), body: method === 'GET' || method === 'HEAD' ? undefined : body,
      headers: { 'user-agent': 'wa-agent/0.2', accept: 'application/json,text/html,text/plain;q=0.9,*/*;q=0.5', ...(opts.headers ?? {}) },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = (await assertPublicUrl(new URL(res.headers.get('location')!, url).toString())).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          if (!opts.truncate) { await reader.cancel(); throw new Error('Response too large'); }
          truncated = true; await reader.cancel(); break;
        }
        chunks.push(value);
      }
    }
    return { status: res.status, url, contentType, body: Buffer.concat(chunks).toString('utf8'), truncated };
  }
  throw new Error('Too many redirects');
}

/** Fetch a text/HTML page for knowledge ingestion. */
export async function safeFetchText(raw: string, opts: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<FetchedPage> {
  const r = await safeRequest(raw, { ...opts, headers: { accept: 'text/html,text/plain,text/markdown,*/*;q=0.5' } }).catch((e: Error) => {
    throw new Error(e.message === 'Response too large' ? 'Page too large' : e.message);
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} for ${r.url}`);
  if (!/^(text\/|application\/(xhtml|json|xml))/i.test(r.contentType)) throw new Error(`Unsupported content type "${r.contentType}" (only text/HTML pages are supported)`);
  return { url: r.url, contentType: r.contentType, body: r.body };
}
