import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';

export interface InboundMessage {
  waMessageId: string;
  from: string;
  name: string | null;
  timestamp: number;
  type: string;
  text: string;
}

export interface StatusUpdate {
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

/** Validate X-Hub-Signature-256 against the raw request body. */
export function verifySignature(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  let got: Buffer;
  try { got = Buffer.from(header.slice(7), 'hex'); } catch { return false; }
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Flatten a WhatsApp Cloud API message into the text the platform (and the AI) can read. */
function toText(m: Record<string, any>): { type: string; text: string } {
  switch (m.type) {
    case 'text': return { type: 'text', text: String(m.text?.body ?? '') };
    case 'button': return { type: 'button', text: String(m.button?.text ?? '') };
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return { type: 'interactive', text: String(r?.title ?? '[Unsupported message]') };
    }
    case 'location': {
      const l = m.location ?? {};
      return { type: 'location', text: `[Location] ${[l.name, l.address].filter(Boolean).join(', ')} (${l.latitude}, ${l.longitude})`.replace('  ', ' ') };
    }
    case 'image': return { type: 'image', text: `[Image]${m.image?.caption ? ' ' + m.image.caption : ''}` };
    case 'document': return { type: 'document', text: `[Document] ${m.document?.filename ?? ''}${m.document?.caption ? ' ' + m.document.caption : ''}`.trim() };
    case 'audio': return { type: 'audio', text: '[Audio message]' };
    case 'video': return { type: 'video', text: `[Video]${m.video?.caption ? ' ' + m.video.caption : ''}` };
    case 'sticker': return { type: 'sticker', text: '[Sticker]' };
    case 'contacts': {
      const c = m.contacts?.[0];
      return { type: 'contacts', text: `[Contact card] ${c?.name?.formatted_name ?? ''} ${c?.phones?.[0]?.phone ?? ''}`.trim() };
    }
    default: return { type: String(m.type ?? 'unknown'), text: '[Unsupported message]' };
  }
}

export function parseWebhook(body: any): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  if (body?.object !== 'whatsapp_business_account') return { messages, statuses };
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const v = change.value ?? {};
      const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), String(c.profile?.name ?? '')]));
      for (const m of v.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const t = toText(m);
        messages.push({
          waMessageId: String(m.id),
          from: String(m.from),
          name: names.get(String(m.from)) || null,
          timestamp: Number(m.timestamp ?? 0) * 1000 || Date.now(),
          ...t,
        });
      }
      for (const s of v.statuses ?? []) {
        if (!s?.id) continue;
        statuses.push({ waMessageId: String(s.id), status: s.status, error: s.errors?.[0]?.title ?? s.errors?.[0]?.message });
      }
    }
  }
  return { messages, statuses };
}

export interface Sender {
  sendText(to: string, body: string): Promise<{ id: string }>;
}

export const WA_MAX_TEXT = 4096;

/** Split long replies on paragraph/line/space boundaries so each part fits WhatsApp's 4096 char limit. */
export function splitText(text: string, max = WA_MAX_TEXT): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export class CloudApiSender implements Sender {
  constructor(private cfg: Pick<Config, 'waAccessToken' | 'waPhoneNumberId' | 'waApiVersion'>, private fetchImpl: typeof fetch = fetch) {}

  async sendText(to: string, body: string): Promise<{ id: string }> {
    const res = await this.fetchImpl(`https://graph.facebook.com/${this.cfg.waApiVersion}/${this.cfg.waPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.waAccessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body, preview_url: false } }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${data?.error?.message ?? JSON.stringify(data)}`);
    const id = data?.messages?.[0]?.id;
    if (!id) throw new Error('WhatsApp send returned no message id');
    return { id: String(id) };
  }
}

/** Used when WA credentials are not configured: logs instead of sending. */
export class DryRunSender implements Sender {
  readonly sent: { to: string; body: string }[] = [];
  private n = 0;
  async sendText(to: string, body: string): Promise<{ id: string }> {
    this.sent.push({ to, body });
    console.log(`[dry-run WhatsApp] -> ${to}: ${body.slice(0, 120)}`);
    return { id: `dryrun.${Date.now()}.${this.n++}` };
  }
}
