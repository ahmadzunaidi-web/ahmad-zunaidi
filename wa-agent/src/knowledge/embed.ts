import type { Config } from '../config.js';

export type EmbedConfig = Pick<Config, 'embedUrl' | 'embedKey' | 'embedModel' | 'embedDims' | 'embedInputType' | 'embedDocPrefix' | 'embedQueryPrefix' | 'embedQueryTimeoutMs'>;

export const BATCH_SIZE = 32;

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (!n) throw new Error('embedding has zero length');
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export const dot = (a: Float32Array, b: Float32Array, bOffset = 0): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[bOffset + i];
  return s;
};

export const toBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
/** SQLite hands back an arbitrarily aligned Uint8Array: copy before viewing it as floats. */
export const fromBlob = (b: Uint8Array): Float32Array => new Float32Array(b.slice().buffer);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI-compatible embeddings client (OpenAI, Voyage, Ollama /v1, Hugging Face TEI, ...).
 * Vectors are validated and unit-normalised, so cosine similarity is a plain dot product.
 */
export class Embedder {
  constructor(private cfg: EmbedConfig, private fetchImpl: typeof fetch = fetch, private sleepMs: (ms: number) => Promise<unknown> = sleep) {}

  get model(): string { return this.cfg.embedModel; }

  private async request(inputs: string[], kind: 'document' | 'query', timeoutMs: number, retries: number): Promise<Float32Array[]> {
    const body: Record<string, unknown> = { model: this.cfg.embedModel, input: inputs };
    if (this.cfg.embedDims > 0) body.dimensions = this.cfg.embedDims;
    if (this.cfg.embedInputType) body.input_type = kind;
    let lastErr = new Error('embedding request failed');
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.fetchImpl(this.cfg.embedUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(this.cfg.embedKey ? { authorization: `Bearer ${this.cfg.embedKey}` } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data: { data?: { index?: number; embedding?: unknown }[]; error?: { message?: string } } = await res.json().catch(() => ({}));
        if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}: ${data.error?.message ?? 'provider busy'}`), { retry: true });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message ?? 'embedding request rejected'}`);
        const rows = [...(data.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        if (rows.length !== inputs.length) throw new Error(`provider returned ${rows.length} embeddings for ${inputs.length} inputs`);
        const out = rows.map((r) => {
          const arr = r.embedding;
          if (!Array.isArray(arr) || !arr.length || arr.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('provider returned an invalid embedding');
          return normalize(Float32Array.from(arr as number[]));
        });
        if (out.some((v) => v.length !== out[0].length)) throw new Error('provider returned embeddings of different sizes');
        return out;
      } catch (e) {
        lastErr = e as Error;
        if (!(e as { retry?: boolean }).retry || attempt === retries) break;
        await this.sleepMs(500 * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  /** Embed document chunks in batches (retries on 429/5xx). */
  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map((t) => this.cfg.embedDocPrefix + t);
      out.push(...(await this.request(batch, 'document', 30_000, 3)));
    }
    return out;
  }

  /** One short query: tight time budget, no retries (a slow provider must never stall a customer's reply). */
  async embedQuery(text: string): Promise<Float32Array> {
    return (await this.request([this.cfg.embedQueryPrefix + text], 'query', this.cfg.embedQueryTimeoutMs, 0))[0];
  }
}
