import type { Store } from '../store.js';
import type { KnowledgeHit } from '../types.js';
import { dot, fromBlob } from './embed.js';

export const MAX_VECTOR_ROWS = 150_000;

interface Loaded { model: string; dim: number; ids: number[]; texts: string[]; name: string; mat: Float32Array }

/**
 * In-memory brute-force cosine index over the chunks of the selected sources (vectors are persisted in SQLite and
 * loaded lazily per source). Fine up to ~100k chunks; beyond that use a real vector store (sqlite-vec / pgvector).
 */
export class VectorIndex {
  private cache = new Map<number, Loaded>();
  constructor(private store: Store) {}

  invalidate(sourceId?: number): void {
    if (sourceId === undefined) this.cache.clear(); else this.cache.delete(sourceId);
  }

  private load(sourceId: number, model: string): Loaded | null {
    const hit = this.cache.get(sourceId);
    if (hit && hit.model === model) return hit;
    const rows = this.store.embeddingsFor([sourceId], model);
    if (!rows.length) { this.cache.delete(sourceId); return null; }
    const dim = fromBlob(rows[0].embedding).length;
    const mat = new Float32Array(rows.length * dim);
    const ids: number[] = [], texts: string[] = [];
    rows.forEach((r, i) => {
      const v = fromBlob(r.embedding);
      if (v.length !== dim) return; // a stray vector of another size is ignored
      mat.set(v, i * dim); ids.push(r.id); texts.push(r.text);
    });
    const l = { model, dim, ids, texts, name: rows[0].source, mat };
    this.cache.set(sourceId, l);
    return l;
  }

  search(sourceIds: number[], model: string, q: Float32Array, k: number, minScore = 0): KnowledgeHit[] {
    const loaded = sourceIds.map((id) => ({ id, l: this.load(id, model) })).filter((x): x is { id: number; l: Loaded } => !!x.l && x.l.dim === q.length);
    if (loaded.reduce((n, x) => n + x.l.ids.length, 0) > MAX_VECTOR_ROWS) throw new Error(`too many chunks for the in-memory vector index (> ${MAX_VECTOR_ROWS})`);
    const top: KnowledgeHit[] = [];
    for (const { id, l } of loaded) {
      for (let i = 0; i < l.ids.length; i++) {
        const score = dot(q, l.mat, i * l.dim);
        if (score < minScore) continue;
        if (top.length === k && score <= (top[top.length - 1].vector_score ?? 0)) continue;
        top.push({ chunk_id: l.ids[i], source_id: id, source: l.name, text: l.texts[i], vector_score: score, via: ['vector'] });
        top.sort((a, b) => (b.vector_score ?? 0) - (a.vector_score ?? 0));
        if (top.length > k) top.pop();
      }
    }
    return top;
  }
}

/** Reciprocal Rank Fusion: a chunk found by BOTH methods outranks one found by a single method. */
export function fuse(keyword: KnowledgeHit[], vector: KnowledgeHit[], limit: number, k = 60): KnowledgeHit[] {
  const merged = new Map<string, { hit: KnowledgeHit; score: number }>();
  const add = (list: KnowledgeHit[], via: 'keyword' | 'vector') => list.forEach((h, rank) => {
    const key = h.chunk_id !== undefined ? `c${h.chunk_id}` : `t${h.source_id}:${h.text}`;
    const cur = merged.get(key);
    const add = 1 / (k + rank + 1);
    if (cur) { cur.score += add; cur.hit = { ...cur.hit, ...h, via: [...new Set([...(cur.hit.via ?? []), via])], vector_score: h.vector_score ?? cur.hit.vector_score }; }
    else merged.set(key, { hit: { ...h, via: [via] }, score: add });
  });
  add(keyword, 'keyword');
  add(vector, 'vector');
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.hit);
}
