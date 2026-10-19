import Anthropic from '@anthropic-ai/sdk';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}
export interface LlmBlock {
  type: string;
  [k: string]: any;
}
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmBlock[];
}
export interface LlmRequest {
  model: string;
  system: SystemBlock[];
  tools: ToolDef[];
  messages: LlmMessage[];
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
}
export interface LlmResponse {
  stopReason: string | null;
  content: LlmBlock[];
  usage?: { input: number; output: number; cacheRead?: number };
}
export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** `output_config.effort` is accepted by the 4.6+ model families; older models reject it. */
export function supportsEffort(model: string): boolean {
  return /^claude-(opus-(4-[6-9]|5)|sonnet-(4-6|5)|fable|mythos|haiku-5)/.test(model);
}

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  private client: Anthropic;
  constructor(apiKey?: string, opts: { fetch?: typeof fetch } = {}) {
    this.client = new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const params: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
    };
    if (req.tools.length) params.tools = req.tools;
    // Thinking is left to the model's default (adaptive); sampling params are not sent (rejected on current models).
    if (supportsEffort(req.model)) params.output_config = { effort: req.effort };
    const res = await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
    return {
      stopReason: res.stop_reason,
      // Content is returned verbatim (incl. thinking blocks) so it can be replayed unchanged on the next turn.
      content: res.content as unknown as LlmBlock[],
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? undefined },
    };
  }
}

/** Test double: each step receives the request and returns a response. */
export class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted';
  readonly requests: LlmRequest[] = [];
  constructor(private steps: ((req: LlmRequest) => LlmResponse)[]) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(req));
    const step = this.steps.shift();
    if (!step) throw new Error('ScriptedProvider: no more scripted responses');
    return step(req);
  }
}

export const textResponse = (text: string): LlmResponse => ({ stopReason: 'end_turn', content: [{ type: 'text', text }], usage: { input: 10, output: 5 } });
export const toolResponse = (name: string, input: Record<string, unknown>, id = `tu_${Math.random().toString(36).slice(2, 8)}`): LlmResponse => ({
  stopReason: 'tool_use', content: [{ type: 'tool_use', id, name, input }], usage: { input: 10, output: 5 },
});
