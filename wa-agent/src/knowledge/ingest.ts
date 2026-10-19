import type { Store } from '../store.js';
import type { KnowledgeSource } from '../types.js';
import { chunkText, htmlToText } from './chunk.js';
import { safeFetchText } from './safe-fetch.js';

export const MAX_SOURCES = 100;
export const MAX_TEXT_CHARS = 2_000_000;
export const MAX_CRAWL_DEPTH = 3;
export const MAX_CRAWL_PAGES = 30;

export class KnowledgeError extends Error {}

export class Knowledge {
  constructor(private store: Store, private fetchImpl?: typeof fetch) {}

  addText(name: string, text: string): KnowledgeSource {
    this.guard(name);
    if (!text.trim()) throw new KnowledgeError('Text is empty');
    if (text.length > MAX_TEXT_CHARS) throw new KnowledgeError(`Text too large (max ${MAX_TEXT_CHARS} characters)`);
    return this.store.addSource(name, 'text', null, chunkText(text));
  }

  /** Crawl a public site (same host, breadth-first) and index the text of each page. */
  async addUrl(name: string, url: string, depth = 1): Promise<KnowledgeSource> {
    this.guard(name);
    const maxDepth = Math.max(0, Math.min(MAX_CRAWL_DEPTH, depth));
    const seen = new Set<string>();
    const queue: { url: string; d: number }[] = [{ url, d: 0 }];
    const chunks: string[] = [];
    let host = '';
    let firstError: string | null = null;
    while (queue.length && seen.size < MAX_CRAWL_PAGES) {
      const { url: u, d } = queue.shift()!;
      const key = u.split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const page = await safeFetchText(u, { fetchImpl: this.fetchImpl });
        host ||= new URL(page.url).host;
        const isHtml = /html/i.test(page.contentType);
        const { title, text, links } = isHtml ? htmlToText(page.body) : { title: '', text: page.body, links: [] as string[] };
        const header = title ? `# ${title} (${page.url})\n\n` : `# ${page.url}\n\n`;
        chunks.push(...chunkText(header + text));
        if (d < maxDepth) {
          for (const l of links) {
            try {
              const abs = new URL(l, page.url);
              if (abs.host === host && /^https?:$/.test(abs.protocol)) queue.push({ url: abs.toString(), d: d + 1 });
            } catch { /* ignore bad link */ }
          }
        }
      } catch (e) {
        firstError ??= (e as Error).message;
        if (seen.size === 1) break; // the entry page itself failed
      }
    }
    if (!chunks.length) return this.store.addSource(name, 'url', url, [], firstError ?? 'No readable content');
    return this.store.addSource(name, 'url', url, chunks, null);
  }

  private guard(name: string): void {
    if (!name.trim()) throw new KnowledgeError('Name is required');
    if (this.store.countSources() >= MAX_SOURCES) throw new KnowledgeError(`Limit of ${MAX_SOURCES} knowledge sources reached`);
  }
}
