/** Split text into ~maxLen char chunks on paragraph/sentence boundaries, with a small overlap. */
export function chunkText(text: string, maxLen = 800, overlap = 100): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };
  for (const p of paras) {
    if (p.length > maxLen) {
      flush();
      // long paragraph: split by sentences, then hard-split
      const parts = p.split(/(?<=[.!?])\s+/);
      for (const s of parts) {
        if (s.length > maxLen) {
          flush();
          for (let i = 0; i < s.length; i += maxLen - overlap) chunks.push(s.slice(i, i + maxLen).trim());
        } else if ((cur + ' ' + s).length > maxLen) {
          flush();
          cur = s;
        } else cur = cur ? cur + ' ' + s : s;
      }
      continue;
    }
    if ((cur + '\n\n' + p).length > maxLen) {
      const tail = cur.slice(-overlap);
      flush();
      cur = tail && p.length + tail.length < maxLen ? `${tail}\n\n${p}` : p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  flush();
  return chunks.filter(Boolean);
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

export function htmlToText(html: string): { title: string; text: string; links: string[] } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const links = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const body = decode(html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br|ul|ol|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: body, links };
}
