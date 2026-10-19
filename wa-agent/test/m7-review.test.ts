import { describe, expect, it } from 'vitest';
import { reviewAgent, summarize, type ReviewInput } from '../src/agent/review.js';
import { emptyDraft } from '../src/store.js';
import { api, setup } from './helpers.js';

function input(over: Partial<ReviewInput['draft']> = {}, extra: Partial<ReviewInput> = {}): ReviewInput {
  const c = setup();
  const draft = { ...emptyDraft('claude-opus-5-5'), ...over, skills: { ...emptyDraft('').skills, ...((over.skills ?? {}) as object) } } as ReviewInput['draft'];
  return { draft, workspace: c.workspace, agents: ['Support Agent'], workflows: [{ name: 'refund_processing', status: 'published', triggerType: 'manual' }, { name: 'draft_flow', status: 'draft', triggerType: 'manual' }, { name: 'on_open', status: 'published', triggerType: 'conversation_opened' }], templates: ['promo_hello'], ...extra };
}
const on = (prompt = '') => ({ enabled: true, prompt });
const codes = (i: ReviewInput) => reviewAgent(i).map((x) => x.code);

const GOOD = `# CONTEXT
* Anda bercakap dengan prospek yang berminat. Matlamat: layakkan lead.
# ROLE & COMMUNICATION STYLE
* Mesra, ringkas.
# TOP-LEVEL FLOW
1. Sapa $contact.firstname.
2. Simpan bajet dalam field Budget.
3. Jika Budget > 100, kemas kini lifecycle kepada Hot Lead dan assign ke @Sales Team.
4. Jika pelanggan kata tiada soalan, close the conversation.
# BOUNDARIES
* Jangan tawar diskaun.`;

describe('M7: prompt review (linter)', () => {
  it('passes a well-formed prompt whose skills are on', () => {
    const issues = reviewAgent(input({ instructions: GOOD, skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on() } as never }));
    expect(issues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(summarize(issues).errors).toBe(0);
  });

  it('catches wrong-case names and offers an exact fix', () => {
    const issues = reviewAgent(input({ instructions: GOOD.replace('@Sales Team', '@sales team'), skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on() } as never }));
    const m = issues.find((i) => i.code === 'unknown_mention')!;
    expect(m.severity).toBe('error');
    expect(m.fix).toEqual({ find: '@sales team', replace: '@Sales Team' });
    const unknown = reviewAgent(input({ instructions: 'Assign to @Billing Squad when asked.', skills: { assign: on() } as never }));
    expect(unknown.find((i) => i.code === 'unknown_mention')!.message).toContain('Sales Team');
  });

  it('checks $contact variables, %tags and !workflows', () => {
    const issues = reviewAgent(input({ instructions: 'Hai $contact.firstnme, simpan %vip dan %Ghost. Jalankan !Refund_Processing dan !refund_processing dan !missing_flow dan !draft_flow dan !on_open.', skills: { tags: on(), trigger_workflow: on() } as never }));
    const by = (c: string) => issues.filter((i) => i.code === c);
    expect(by('unknown_variable')[0].fix!.replace).toBe('$contact.firstname');
    expect(by('unknown_tag').map((i) => i.fix?.replace)).toEqual(expect.arrayContaining(['%VIP', undefined]));
    expect(by('unknown_workflow').map((i) => i.fix?.replace)).toEqual(expect.arrayContaining(['!refund_processing', undefined]));
    expect(by('workflow_unpublished')).toHaveLength(1);
    expect(by('workflow_not_manual')).toHaveLength(1);
    // prose punctuation is not mistaken for references
    expect(codes(input({ instructions: GOOD + '\nAmazing! Diskaun 50% hari ini. Email a@b.com' }))).not.toContain('unknown_workflow');
  });

  it('flags skills that are mentioned but off, and on but never explained', () => {
    const off = reviewAgent(input({ instructions: GOOD, skills: {} as never }));
    expect(off.filter((i) => i.code === 'skill_disabled').map((i) => i.message).join(' ')).toMatch(/assign|close|lifecycle|field/i);
    const silent = reviewAgent(input({ instructions: '# CONTEXT\nHelp customers. Boundaries: never promise.\nHand over to @Support Agent when unsure.', skills: { assign: on(), tags: on(), comment: on() } as never }));
    expect(silent.filter((i) => i.code === 'skill_no_instructions').map((i) => i.location)).toEqual(expect.arrayContaining(['skill:tags', 'skill:comment']));
  });

  it('validates skill configuration: assign destination, comment mentions, HTTP actions', () => {
    expect(codes(input({ instructions: GOOD, skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on() } as never }, { workspace: { ...setup().workspace, teams: [], users: [] }, agents: [] }))).toContain('assign_no_destination');
    expect(codes(input({ instructions: GOOD, skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on(), comment: on('Tulis nota dan @Sales Team') } as never }))).toContain('comment_mention_target');
    expect(codes(input({ instructions: GOOD, skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on(), http: on() } as never }))).toContain('http_no_actions');
  });

  it('warns about things the platform cannot do', () => {
    const c = codes(input({ instructions: GOOD + '\nBaca nota dalaman. Check the Pricing Guide document. Send the video demo. Assign to Sales at 5pm. Review the last 50 messages.', skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on() } as never }));
    expect(c).toEqual(expect.arrayContaining(['search_by_title', 'unsupported_media', 'scheduled_assign', 'long_history']));
  });

  it('enforces follow-up limits: within 24h, skill on', () => {
    const base = { skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on() } } as unknown as { skills: never };
    expect(codes(input({ instructions: GOOD + '\nJika tiada balasan selepas 2 hari, follow up.', ...base }))).toEqual(expect.arrayContaining(['followup_too_long', 'skill_disabled']));
    expect(codes(input({ instructions: GOOD + '\nIf the contact does not reply after 3 hours, follow up.', skills: { assign: on(), close: on(), set_field: on(), set_lifecycle: on(), followup: on() } as never }))).not.toContain('followup_too_long');
  });

  it('gives guidance on structure: exit condition, goal, boundaries, length', () => {
    const c = codes(input({ instructions: 'Be nice to people and chat about stuff.' }));
    expect(c).toEqual(expect.arrayContaining(['no_exit', 'no_goal', 'no_boundaries']));
    expect(codes(input({ instructions: 'x'.repeat(10_001) }))).toContain('too_long');
    expect(codes(input({ instructions: '' }))).toContain('empty');
  });

  it('serves reviews over the API using unsaved editor state, and exposes the tool list', async () => {
    const c = setup();
    const a = await api(c, 'POST', '/api/agents', { name: 'Reviewer', draft: { instructions: GOOD } });
    const r = await api(c, 'POST', `/api/agents/${a.body.id}/review`, { draft: { instructions: 'Assign to @nobody' } });
    expect(r.body.summary.errors).toBeGreaterThan(0);
    const stored = await api(c, 'POST', `/api/agents/${a.body.id}/review`);
    expect(stored.body.issues.some((i: { code: string }) => i.code === 'skill_disabled')).toBe(true);
    await api(c, 'PUT', `/api/agents/${a.body.id}`, { draft: { skills: { assign: { enabled: true, prompt: 'to @Sales Team' } } } });
    const tools = await api(c, 'GET', `/api/agents/${a.body.id}/tools`);
    expect(tools.body.map((t: { name: string }) => t.name)).toEqual(['assign_conversation']);
  });
});
