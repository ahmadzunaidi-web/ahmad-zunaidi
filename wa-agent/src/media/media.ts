import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { InboundMedia } from '../channels/whatsapp.js';
import type { Config } from '../config.js';
import { assertPublicUrl, safeRequestRaw } from '../knowledge/safe-fetch.js';
import type { MediaRow, Store } from '../store.js';

/** What we accept, how it is stored, and the magic bytes that must match the declared type. */
const TYPES: Record<string, { kind: 'image' | 'audio' | 'document'; ext: string; sig: (b: Buffer) => boolean }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg', sig: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', ext: 'png', sig: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/gif': { kind: 'image', ext: 'gif', sig: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  'image/webp': { kind: 'image', ext: 'webp', sig: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'application/pdf': { kind: 'document', ext: 'pdf', sig: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'audio/ogg': { kind: 'audio', ext: 'ogg', sig: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3', sig: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/mp4': { kind: 'audio', ext: 'm4a', sig: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'audio/aac': { kind: 'audio', ext: 'aac', sig: (b) => (b[0] === 0xff && (b[1] & 0xf0) === 0xf0) || b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'audio/amr': { kind: 'audio', ext: 'amr', sig: (b) => b.subarray(0, 5).toString('latin1') === '#!AMR' },
  'audio/wav': { kind: 'audio', ext: 'wav', sig: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE' },
};

/** "audio/ogg; codecs=opus" -> "audio/ogg" */
export const baseMime = (m: string | null | undefined) => String(m ?? '').split(';')[0].trim().toLowerCase();
export const SERVABLE_MIMES = new Set(Object.keys(TYPES));

export interface IngestResult { status: MediaRow['status']; transcript?: string; error?: string }

export class MediaService {
  constructor(private d: { store: Store; cfg: Config; fetchImpl?: typeof fetch; log?: (msg: string, extra?: unknown) => void }) {}

  private get cfg() { return this.d.cfg; }
  private log(m: string, extra?: unknown) { this.d.log?.(`[media] ${m}`, extra); }

  /** Absolute path of a stored file, guaranteed to be inside the media directory. */
  fileFor(row: Pick<MediaRow, 'path'>): string | null {
    if (!row.path) return null;
    const root = resolve(this.cfg.mediaDir);
    const full = resolve(root, row.path);
    return full.startsWith(root + sep) ? full : null;
  }

  readBytes(row: MediaRow): Buffer | null {
    const f = this.fileFor(row);
    return f && existsSync(f) ? readFileSync(f) : null;
  }

  private fail(messageId: number, m: InboundMedia, status: 'failed' | 'skipped', error: string): IngestResult {
    this.d.store.addMedia({ message_id: messageId, wa_media_id: m.id, kind: m.kind, mime: baseMime(m.mime) || null, status, caption: m.caption, filename: m.filename, error });
    if (status === 'failed') this.log(`download failed: ${error}`);
    return { status, error };
  }

  /** Download (or accept pre-fetched bytes), validate, store, and transcribe audio when configured. Never throws. */
  async ingest(messageId: number, m: InboundMedia): Promise<IngestResult> {
    try {
      if (m.kind === 'video' || m.kind === 'sticker') return this.fail(messageId, m, 'skipped', `${m.kind} is not supported (shown as a placeholder only)`);
      let bytes = m.bytes ?? null;
      let mime = baseMime(m.mime);
      if (!bytes) {
        if (!this.cfg.waAccessToken) return this.fail(messageId, m, 'skipped', 'WhatsApp credentials are not configured, so media cannot be downloaded');
        const got = await this.download(m.id);
        bytes = got.bytes; mime = baseMime(got.mime) || mime;
      }
      const t = TYPES[mime];
      if (!t) return this.fail(messageId, m, 'skipped', `unsupported file type "${mime || 'unknown'}"`);
      if (t.kind !== m.kind && !(m.kind === 'document' && t.kind === 'image')) return this.fail(messageId, m, 'failed', `file type ${mime} does not match a ${m.kind} message`);
      if (bytes.length === 0) return this.fail(messageId, m, 'failed', 'empty file');
      if (bytes.length > this.cfg.mediaMaxBytes) return this.fail(messageId, m, 'failed', `file is larger than ${Math.round(this.cfg.mediaMaxBytes / 1048576)} MB`);
      if (!t.sig(bytes)) return this.fail(messageId, m, 'failed', 'file content does not match its declared type');

      const sha = createHash('sha256').update(bytes).digest('hex');
      const existing = this.d.store.mediaBySha(sha);
      let rel = existing?.path ?? join(sha.slice(0, 2), `${sha}.${t.ext}`); // name derives from the content hash only
      if (!existing || !this.fileFor({ path: rel }) || !existsSync(this.fileFor({ path: rel })!)) {
        const full = this.fileFor({ path: rel });
        if (!full) throw new Error('invalid storage path');
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, bytes, { mode: 0o600 });
      }
      rel = rel.split(sep).join('/');
      const row = this.d.store.addMedia({ message_id: messageId, wa_media_id: m.id, kind: t.kind, mime, size: bytes.length, sha256: sha, path: rel, status: 'stored', caption: m.caption, filename: m.filename });

      if (t.kind === 'audio' && this.cfg.transcribeUrl) {
        try {
          const text = (await this.transcribe(bytes, mime)).trim();
          if (text) { this.d.store.updateMedia(row.id, { transcript: text }); return { status: 'stored', transcript: text }; }
        } catch (e) {
          this.d.store.updateMedia(row.id, { error: `transcription failed: ${(e as Error).message}` });
          this.log(`transcription failed: ${(e as Error).message}`);
        }
      }
      return { status: 'stored' };
    } catch (e) {
      return this.fail(messageId, m, 'failed', (e as Error).message);
    }
  }

  /** Two-step Graph API download: resolve the media id to a short-lived URL, then fetch it with the same token. */
  private async download(mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
    const f = this.d.fetchImpl ?? fetch;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(mediaId)) throw new Error('invalid media id');
    const auth = { authorization: `Bearer ${this.cfg.waAccessToken}` };
    const meta = await f(`https://graph.facebook.com/${this.cfg.waApiVersion}/${mediaId}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
    const info: { url?: string; mime_type?: string; file_size?: number; error?: { message?: string } } = await meta.json().catch(() => ({}));
    if (!meta.ok || !info.url) throw new Error(`could not resolve media (${meta.status}): ${info.error?.message ?? 'no url'}`);
    if (info.file_size && info.file_size > this.cfg.mediaMaxBytes) throw new Error(`file is larger than ${Math.round(this.cfg.mediaMaxBytes / 1048576)} MB`);
    const u = await assertPublicUrl(info.url);
    if (u.protocol !== 'https:') throw new Error('media URL must be https');
    const r = await safeRequestRaw(u.toString(), { headers: auth, maxBytes: this.cfg.mediaMaxBytes, timeoutMs: 30_000, fetchImpl: this.d.fetchImpl });
    if (r.status < 200 || r.status >= 300) throw new Error(`download failed (HTTP ${r.status})`);
    return { bytes: r.body, mime: info.mime_type ?? r.contentType };
  }

  /** OpenAI-compatible speech-to-text. Claude cannot take audio, so this is a separate, opt-in provider. */
  async transcribe(bytes: Buffer, mime: string): Promise<string> {
    const f = this.d.fetchImpl ?? fetch;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), `audio.${TYPES[mime]?.ext ?? 'ogg'}`);
    form.append('model', this.cfg.transcribeModel);
    const res = await f(this.cfg.transcribeUrl, {
      method: 'POST',
      headers: this.cfg.transcribeKey ? { authorization: `Bearer ${this.cfg.transcribeKey}` } : {},
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const data: { text?: string; error?: { message?: string } } = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message ?? 'transcription request failed'}`);
    return String(data.text ?? '');
  }

  /** Delete files (and forget transcripts) older than the retention period. */
  cleanup(now = Date.now()): number {
    const days = this.cfg.mediaRetentionDays;
    if (!days || days <= 0) return 0;
    let n = 0;
    for (const row of this.d.store.expiredMedia(now - days * 86_400_000)) {
      const file = this.fileFor(row);
      if (file && row.path && !this.d.store.pathInUse(row.path, row.id)) rmSync(file, { force: true });
      this.d.store.updateMedia(row.id, { status: 'expired', path: null, transcript: null });
      n++;
    }
    return n;
  }
}
