import { describe, expect, it } from 'vitest';
import { ClaudeProvider, supportsEffort } from '../src/agent/llm.js';

function fakeFetch(reply: object) {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const message = (content: object[], stop: string) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 80 },
});

describe('ClaudeProvider request shape (no network)', () => {
  const req = {
    model: 'claude-opus-5-5',
    system: [{ type: 'text' as const, text: 'rules', cache_control: { type: 'ephemeral' as const } }, { type: 'text' as const, text: 'instructions' }],
    tools: [{ name: 'update_tags', description: 'd', input_schema: { type: 'object', properties: {}, additionalProperties: false } }],
    messages: [{ role: 'user' as const, content: 'hi' }],
    maxTokens: 2000,
    effort: 'medium' as const,
  };

  it('sends model, system blocks, tools, messages and output_config.effort - and no thinking/sampling params', async () => {
    const { f, calls } = fakeFetch(message([{ type: 'text', text: 'Hai!' }], 'end_turn'));
    const res = await new ClaudeProvider('sk-test', { fetch: f }).complete(req);
    const b = calls[0].body;
    expect(calls[0].url).toContain('/v1/messages');
    expect(calls[0].headers.get('x-api-key')).toBe('sk-test');
    expect(b).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: 'hi' }] });
    expect(b.system).toHaveLength(2);
    expect(b.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(b.tools[0].name).toBe('update_tags');
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) expect(b).not.toHaveProperty(k);
    expect(res).toMatchObject({ stopReason: 'end_turn', content: [{ type: 'text', text: 'Hai!' }], usage: { input: 120, output: 30, cacheRead: 80 } });
  });

  it('returns tool_use and thinking blocks verbatim so they can be replayed unchanged', async () => {
    const blocks = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'update_tags', input: { add: ['VIP'] } }];
    const { f } = fakeFetch(message(blocks, 'tool_use'));
    const res = await new ClaudeProvider('sk-test', { fetch: f }).complete(req);
    expect(res.stopReason).toBe('tool_use');
    expect(res.content).toEqual(blocks);
  });

  it('omits tools when there are none and omits effort for models that reject it', async () => {
    const { f, calls } = fakeFetch(message([{ type: 'text', text: 'x' }], 'end_turn'));
    await new ClaudeProvider('sk-test', { fetch: f }).complete({ ...req, tools: [], model: 'claude-haiku-4-5' });
    expect(calls[0].body).not.toHaveProperty('tools');
    expect(calls[0].body).not.toHaveProperty('output_config');
    expect(supportsEffort('claude-opus-5-5')).toBe(true);
    expect(supportsEffort('claude-sonnet-5-5')).toBe(true);
    expect(supportsEffort('claude-fable-5-1')).toBe(true);
    expect(supportsEffort('claude-haiku-5-5')).toBe(true);
    expect(supportsEffort('claude-haiku-4-5')).toBe(false);
    expect(supportsEffort('claude-sonnet-4-5')).toBe(false);
  });
});
