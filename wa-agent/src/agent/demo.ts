import type { LlmBlock, LlmProvider, LlmRequest, LlmResponse } from './llm.js';
import { TOOL_NAMES } from './skills.js';

const textOf = (c: string | LlmBlock[]): string => (typeof c === 'string' ? c : c.map((b) => (b.type === 'tool_result' ? String(b.content) : String(b.text ?? ''))).join('\n'));

/**
 * Keyword-driven stand-in used when ANTHROPIC_API_KEY is not set, so the inbox, skills and knowledge
 * search can be exercised end to end without a real model. It is NOT a language model.
 */
export class DemoProvider implements LlmProvider {
  readonly name = 'demo (no ANTHROPIC_API_KEY - keyword rules, not a real model)';
  constructor(private firstTeam: string | null) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const last = req.messages[req.messages.length - 1];
    const usage = { input: 0, output: 0 };
    const has = (n: string) => req.tools.some((t) => t.name === n);
    const tool = (name: string, input: Record<string, unknown>): LlmResponse => ({ stopReason: 'tool_use', content: [{ type: 'tool_use', id: `demo_${Date.now()}`, name, input }], usage });
    const say = (text: string): LlmResponse => ({ stopReason: 'end_turn', content: [{ type: 'text', text }], usage });

    if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
      const out = textOf(last.content);
      if (/^No matching/i.test(out)) return say('Maaf, saya tiada maklumat tentang itu. Saya akan minta pasukan kami bantu.');
      if (/^\[1\]/.test(out)) return say(`Berdasarkan maklumat kami:\n${out.replace(/^\[1\] \(source: [^)]*\)\n/, '').split(/\n\[2\]/)[0].replace(/\n{2,}/g, '\n').slice(0, 500)}`);
      return say('Baik, saya dah uruskan. Ada apa-apa lagi yang saya boleh bantu?');
    }
    const text = textOf(last.content).toLowerCase();
    if (/(orang sebenar|manusia|human|agent sebenar|cakap dengan)/.test(text) && has(TOOL_NAMES.assign) && this.firstTeam) {
      return tool(TOOL_NAMES.assign, { target: this.firstTeam });
    }
    if (has(TOOL_NAMES.search) && /(harga|price|pakej|package|berapa|how much|cost|waktu|hours|buka)/.test(text)) {
      return tool(TOOL_NAMES.search, { query: textOf(last.content) });
    }
    return say(`(demo) Terima kasih, mesej anda diterima: "${textOf(last.content).slice(0, 80)}". Tetapkan ANTHROPIC_API_KEY untuk jawapan AI sebenar.`);
  }
}
