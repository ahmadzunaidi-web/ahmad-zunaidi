import type { Store } from '../store.js';
import type { KnowledgeHit, KnowledgeSource } from '../types.js';
import { chunkText, htmlToText } from './chunk.js';
import { BATCH_SIZE, toBlob, type Embedder } from './embed.js';
import { safeFetchText } from './safe-fetch.js';
import { fuse, VectorIndex } from './vector.js';

export const MAX_SOURCES = 100;
export const MAX_TEXT_CHARS = 2_000_000;
export const MAX_CRAWL_DEPTH = 3;
export const MAX_CRAWL_PAGES = 30;

export class KnowledgeError extends Error {}

export type SearchMode = 'hybrid' | 'keyword' | 'vector';

export class Knowledge {
  readonly index: VectorIndex;
  private chain: Promise<void> = Promise.resolve();
  private inflight = 0;

  constructor(private store: Store, private fetchImpl?: typeof fetch, readonly embedder?: Embedder, private opts: { minScore?: number; log?: (m: string, extra?: unknown) => void } = {}) {
    this.index = new VectorIndex(store);
  }

  get embeddingModel(): string | null { return this.embedder?.model ?? null; }

  // ---- embeddings ------------------------------------------------------------------------------
  /** Embed a source's chunks in the background; BM25 search works immediately, vectors join when ready. */
  queueEmbed(sourceId: number): void {
    if (!this.embedder) return;
    this.store.setEmbedStatus(sourceId, 'pending', null, this.embedder.model);
    this.inflight++;
    this.chain = this.chain.then(() => this.embedSource(sourceId)).catch((e) => this.opts.log?.('embedding crashed', (e as Error).message)).finally(() => { this.inflight--; });
  }

  private async embedSource(sourceId: number): Promise<void> {
    const emb = this.embedder!;
    try {
      for (;;) {
        if (!this.store.getSource(sourceId)) return; // deleted meanwhile
        const rows = this.store.chunksNeedingEmbedding(sourceId, emb.model, BATCH_SIZE);
        if (!rows.length) break;
        const vecs = await emb.embedDocuments(rows.map((r) => r.text));
        if (!this.store.getSource(sourceId)) return;
        rows.forEach((r, i) => this.store.setChunkEmbedding(r.id, toBlob(vecs[i]), emb.model));
      }
      this.store.setEmbedStatus(sourceId, 'done', null, emb.model);
    } catch (e) {
      this.store.setEmbedStatus(sourceId, 'failed', (e as Error).message, emb.model);
      this.opts.log?.(`embedding source ${sourceId} failed`, (e as Error).message);
    } finally {
      this.index.invalidate(sourceId);
    }
  }

  /** (Re)embed every source whose chunks lack a vector for the current model. `force` recomputes all. */
  reindex(force = false): number {
    if (!this.embedder) throw new KnowledgeError('Embeddings are not configured (set EMBED_URL)');
    if (force) this.store.clearEmbeddings();
    let n = 0;
    for (const s of this.store.listSources()) {
      if (s.status !== 'completed' || !s.chunks) continue;
      if (this.store.chunksNeedingEmbedding(s.id, this.embedder.model, 1).length) { this.queueEmbed(s.id); n++; }
      else if (s.embed_status !== 'done') this.store.setEmbedStatus(s.id, 'done', null, this.embedder.model);
    }
    if (force) this.index.invalidate();
    return n;
  }

  /** Resolves when all queued embedding work has finished (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.inflight) await this.chain;
  }

  remove(id: number): void {
    this.store.deleteSource(id);
    this.index.invalidate(id);
  }

  // ---- search ----------------------------------------------------------------------------------
  /**
   * Hybrid search: BM25 over the text + cosine over embeddings, fused by rank. Always degrades to keywords
   * if the embedding provider is slow or down: a customer's reply must never depend on it.
   */
  async search(sourceIds: number[], query: string, o: { mode?: SearchMode; limit?: number } = {}): Promise<KnowledgeHit[]> {
    const limit = o.limit ?? 5;
    const mode: SearchMode = o.mode ?? (this.embedder ? 'hybrid' : 'keyword');
    if (mode !== 'keyword' && !this.embedder) throw new KnowledgeError('Embeddings are not configured (set EMBED_URL)');
    const keyword = mode === 'vector' ? [] : this.store.searchKnowledge(sourceIds, query, 20);
    let vector: KnowledgeHit[] = [];
    if (this.embedder && mode !== 'keyword' && sourceIds.length && query.trim()) {
      try {
        const q = await this.embedder.embedQuery(query);
        vector = this.index.search(sourceIds, this.embedder.model, q, 20, this.opts.minScore ?? 0);
      } catch (e) {
        if (mode === 'vector') throw e;
        this.opts.log?.('vector search unavailable, using keywords only', (e as Error).message);
      }
    }
    if (mode === 'keyword') return keyword.slice(0, limit);
    if (mode === 'vector') return vector.slice(0, limit);
    return fuse(keyword, vector, limit);
  }

  addText(name: string, text: string): KnowledgeSource {
    this.guard(name);
    if (!text.trim()) throw new KnowledgeError('Text is empty');
    if (text.length > MAX_TEXT_CHARS) throw new KnowledgeError(`Text too large (max ${MAX_TEXT_CHARS} characters)`);
    const src = this.store.addSource(name, 'text', null, chunkText(text));
    this.queueEmbed(src.id);
    return this.store.getSource(src.id)!;
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
    const src = this.store.addSource(name, 'url', url, chunks, null);
    this.queueEmbed(src.id);
    return this.store.getSource(src.id)!;
  }

  private guard(name: string): void {
    if (!name.trim()) throw new KnowledgeError('Name is required');
    if (this.store.countSources() >= MAX_SOURCES) throw new KnowledgeError(`Limit of ${MAX_SOURCES} knowledge sources reached`);
  }
}
