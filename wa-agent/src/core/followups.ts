import { executeTool } from '../agent/skills.js';
import type { FollowupStep } from '../agent/skills.js';
import type { Pipeline } from './pipeline.js';

/**
 * Follow-up scheduler: the AI agent registers up to 5 steps; each step waits `after_minutes` after the previous
 * one. Steps are persisted, so they survive restarts, and cancelled when the contact replies or the conversation
 * is reassigned or closed.
 */
export class FollowUps {
  constructor(private p: Pipeline) { p.followups = this; }

  schedule(conversationId: number, agentId: number, steps: FollowupStep[]): void {
    this.p.d.store.addFollowups(conversationId, agentId, steps.map((s) => ({
      delay_minutes: s.after_minutes, message: s.message, template: s.template, params: s.params, actions: s.then,
    })));
  }

  /** Run everything that is due. Returns how many follow-ups were processed. */
  async tick(now = Date.now()): Promise<number> {
    const { store } = this.p.d;
    let n = 0;
    for (const job of store.dueFollowups(now)) {
      await this.run(job).catch((e) => {
        store.finishFollowup(job.id, 'failed', (e as Error).message);
        this.p.d.log?.('follow-up crashed', (e as Error).message);
      });
      n++;
    }
    return n;
  }

  private async run(job: ReturnType<Pipeline['d']['store']['dueFollowups']>[number]): Promise<void> {
    const { store } = this.p.d;
    const conv = store.getConversation(job.conversation_id);
    const snap = store.liveAgent(job.agent_id);
    if (!conv || !snap || conv.status !== 'open' || conv.handler !== 'ai' || conv.agent_id !== job.agent_id) {
      store.finishFollowup(job.id, 'failed', 'conversation changed');
      store.cancelFollowups(job.conversation_id, 'conversation changed');
      return;
    }
    let error: string | null = null;
    let text: string | null = null;
    if (job.message || job.template) {
      const open = this.p.windowOpen(conv);
      if (job.template && (!open || !job.message)) {
        try {
          const m = await this.p.sendTemplate(conv.id, job.template, null, job.params, 'ai');
          text = m.body;
          if (m.status === 'failed') error = m.error;
        } catch (e) { error = (e as Error).message; }
      } else if (job.message) {
        // inside the window this is delivered; outside it, a failed row records why (as WhatsApp itself would show)
        const [m] = await this.p.send(conv.id, job.message, 'ai');
        text = job.message;
        if (m?.status === 'failed') error = m.error;
      }
    }
    // skills that follow the final message (assign / close / lifecycle ...)
    const { env, effects } = this.p.makeEnv(conv, snap.name, snap.id, 0);
    const calls: { name: string; input: Record<string, unknown>; ok: boolean; message: string }[] = [];
    for (const a of job.actions.slice(0, 3)) {
      const r = await executeTool(a.tool, a.input ?? {}, env, snap);
      calls.push({ name: a.tool, input: a.input ?? {}, ok: r.ok, message: r.message });
    }
    store.finishFollowup(job.id, error && !job.actions.length ? 'failed' : 'sent', error);
    store.addRun({ conversation_id: conv.id, agent_id: snap.id, trigger: 'followup', reply: text, tool_calls: calls, usage: {}, error, latency_ms: 0 });
    this.p.d.hub.publish({ type: 'conversation', conversationId: conv.id });

    const after = store.getConversation(conv.id)!;
    if (after.status !== 'open' || after.handler !== 'ai' || after.agent_id !== job.agent_id) {
      store.cancelFollowups(conv.id, 'conversation changed');
      if (effects.handoffTo != null) this.p.scheduleAgent(conv.id, 'assignment', 0, 1);
    } else store.activateNextFollowup(conv.id, job.seq);
  }
}
