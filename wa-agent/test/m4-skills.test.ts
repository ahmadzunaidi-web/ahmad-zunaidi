import { describe, expect, it } from 'vitest';
import { textResponse, toolResponse } from '../src/agent/llm.js';
import { simEnv } from '../src/agent/sim.js';
import { buildTools, executeTool, type ConvState } from '../src/agent/skills.js';
import type { AgentSnapshot } from '../src/types.js';
import { api, inbound, publishAgent, setup } from './helpers.js';

const allOn = (): AgentSnapshot => ({
  id: 1, name: 'Sales Agent', version: 1, instructions: 'x', model: 'claude-opus-5-5', wait_seconds: 0, knowledge_ids: [], http_actions: [],
  skills: Object.fromEntries(['assign', 'close', 'set_field', 'set_lifecycle', 'tags', 'comment'].map((k) => [k, { enabled: true, prompt: '' }])) as never,
});

function sim(extra: Partial<ConvState['contact']> = {}) {
  const c = setup();
  const state: ConvState = { contact: { name: 'Aina', phone: '601', email: null, lifecycle: null, tags: [], fields: {}, ...extra }, status: 'open', handler: 'ai', assignee_team: null, assignee_user: null };
  const s = simEnv({ workspace: c.workspace, state, selfName: 'Sales Agent', selfId: 1, agents: [{ id: 1, name: 'Sales Agent' }, { id: 2, name: 'Support Agent' }], search: () => [] });
  return { ...s, state, snap: allOn(), run: (name: string, input: Record<string, unknown>) => executeTool(name, input, s.env, allOn()) };
}

describe('M4: skills validate exact workspace names', () => {
  it('only exposes enabled skills, with valid names and the owner prompt in the description', () => {
    const c = setup();
    const snap = allOn();
    snap.skills.tags.enabled = false;
    snap.skills.assign.prompt = 'If the contact asks for a human, assign to Sales Team';
    const { env } = simEnv({ workspace: c.workspace, state: { contact: { name: 'A', phone: '1', email: null, lifecycle: null, tags: [], fields: {} }, status: 'open', handler: 'ai', assignee_team: null, assignee_user: null }, selfName: 'Sales Agent', selfId: 1, agents: [{ id: 2, name: 'Support Agent' }], search: () => [] });
    const tools = buildTools(snap, env);
    expect(tools.map((t) => t.name)).toEqual(['assign_conversation', 'close_conversation', 'update_contact_field', 'update_lifecycle_stage', 'add_internal_comment']);
    const assign = tools[0].description;
    expect(assign).toContain('"Sales Team"');
    expect(assign).toContain('"Support Agent"');
    expect(assign).toContain('If the contact asks for a human');
  });

  it('assign: team round robin, user, AI agent; rejects unknown targets and self-assignment', async () => {
    const t = sim();
    expect((await t.run('assign_conversation', { target: 'Sales Team' }))).toMatchObject({ ok: true });
    expect(t.state).toMatchObject({ handler: 'human', assignee_team: 'Sales Team', assignee_user: 'Aisyah' });
    expect((await t.run('assign_conversation', { target: '@Nur' }))).toMatchObject({ ok: true });
    expect(t.state.assignee_team).toBe('Support Team');
    const unknown = await t.run('assign_conversation', { target: 'sales team' }); // exact match required (case-sensitive)
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toContain('"Sales Team"');
    expect((await t.run('assign_conversation', { target: 'Sales Agent' }))).toMatchObject({ ok: false, message: expect.stringContaining('yourself') });
    expect((await t.run('assign_conversation', { target: 'Support Agent' }))).toMatchObject({ ok: true });
    expect(t.state.handler).toBe('ai');
  });

  it('update_contact_field: numeric coercion, builtin fields, unknown field', async () => {
    const t = sim();
    expect((await t.run('update_contact_field', { field: 'Budget', value: 'RM 5,000' })).ok).toBe(false);
    expect((await t.run('update_contact_field', { field: 'Budget', value: '5,000' })).ok).toBe(true);
    expect(t.state.contact.fields.Budget).toBe(5000);
    expect((await t.run('update_contact_field', { field: 'Location', value: 'Johor' })).ok).toBe(true);
    expect((await t.run('update_contact_field', { field: 'Email', value: 'a@b.my' })).ok).toBe(true);
    expect(t.state.contact.email).toBe('a@b.my');
    expect((await t.run('update_contact_field', { field: 'budget', value: '1' })).ok).toBe(false);
    expect((await t.run('update_contact_field', { field: 'Budget', value: '' })).ok).toBe(false);
  });

  it('lifecycle, tags, close and comments reject names that are not in the workspace', async () => {
    const t = sim();
    expect((await t.run('update_lifecycle_stage', { stage: 'Hot Lead' })).ok).toBe(true);
    expect((await t.run('update_lifecycle_stage', { stage: 'hot lead' }))).toMatchObject({ ok: false, message: expect.stringContaining('Valid:') });
    expect((await t.run('update_tags', { add: ['Pricing', 'VIP'], remove: [] })).ok).toBe(true);
    expect(t.state.contact.tags).toEqual(['Pricing', 'VIP']);
    expect((await t.run('update_tags', { remove: ['VIP'] })).ok).toBe(true);
    expect(t.state.contact.tags).toEqual(['Pricing']);
    expect((await t.run('update_tags', { add: ['Nope'] })).ok).toBe(false);
    expect((await t.run('update_tags', {})).ok).toBe(false);
    expect((await t.run('close_conversation', { closing_note: 'Whatever' })).ok).toBe(false);
    expect((await t.run('add_internal_comment', { text: 'handoff', mention: 'Sales Team' })).ok).toBe(false); // only users can be mentioned
    expect((await t.run('add_internal_comment', { text: 'handoff', mention: 'Aisyah' })).ok).toBe(true);
    expect((await t.run('add_internal_comment', { text: 'x'.repeat(2001) })).ok).toBe(false);
    expect((await t.run('close_conversation', { closing_note: 'Issue Resolved', summary: 'done' })).ok).toBe(true);
    expect(t.state.status).toBe('closed');
    expect((await t.run('nonexistent_tool', {})).ok).toBe(false);
  });

  it('disabled skills cannot be executed even if the model asks for them', async () => {
    const t = sim();
    const snap = allOn();
    snap.skills.close.enabled = false;
    expect(await executeTool('close_conversation', {}, t.env, snap)).toMatchObject({ ok: false, message: expect.stringContaining('disabled') });
  });
});

describe('M4: skills end to end (qualification flow)', () => {
  const qualification = '# FLOW\nAsk budget and location. If Budget > 100 and Location is Malaysia -> Hot Lead, assign to Sales Team, close.';

  it('captures data, moves the lifecycle, hands off to a human with a note and still sends the reply', async () => {
    const c = setup({ echoFallback: false });
    const agent = await publishAgent(c, 'Sales Agent', { instructions: qualification });
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => toolResponse('update_contact_field', { field: 'Budget', value: '500' }, 'a'));
    c.steps.push(() => toolResponse('update_contact_field', { field: 'Location', value: 'Malaysia' }, 'b'));
    c.steps.push(() => toolResponse('update_lifecycle_stage', { stage: 'Hot Lead' }, 'c'));
    c.steps.push(() => toolResponse('add_internal_comment', { text: 'Budget RM500, Malaysia. Wants a demo.', mention: 'Aisyah' }, 'd'));
    c.steps.push(() => toolResponse('assign_conversation', { target: 'Sales Team' }, 'e'));
    c.steps.push(() => textResponse('Terima kasih! Pasukan Sales kami akan hubungi anda sebentar lagi.'));
    await inbound(c, '601', 'Bajet saya RM500, saya di Malaysia');

    const conv = c.store.listConversations()[0];
    const contact = c.store.getContact(conv.contact_id)!;
    expect(contact.fields).toEqual({ Budget: 500, Location: 'Malaysia' });
    expect(contact.lifecycle).toBe('Hot Lead');
    expect(conv).toMatchObject({ handler: 'human', assignee_team: 'Sales Team', assignee_user: 'Aisyah', agent_id: null });
    expect(c.store.comments(conv.id)[0]).toMatchObject({ author: 'Sales Agent', body: '@Aisyah Budget RM500, Malaysia. Wants a demo.' });
    expect(c.sender.sent.at(-1)!.body).toContain('Pasukan Sales');
    // every tool result goes back to the model in a SINGLE user message per turn
    const last = c.provider.requests.at(-1)!;
    expect(last.messages.at(-1)!.content).toEqual([expect.objectContaining({ type: 'tool_result', tool_use_id: 'e' })]);
    const run = c.store.runs(agent.id)[0] as { tool_calls: { name: string; ok: boolean }[] };
    expect(run.tool_calls.map((t) => t.name)).toEqual(['update_contact_field', 'update_contact_field', 'update_lifecycle_stage', 'add_internal_comment', 'assign_conversation']);

    // after hand-off the AI stays silent: a human owns the thread
    const before = c.provider.requests.length;
    await inbound(c, '601', 'ok terima kasih');
    expect(c.provider.requests).toHaveLength(before);
  });

  it('lets the model self-correct after a wrong name (error result lists valid names)', async () => {
    const c = setup({ echoFallback: false });
    const agent = await publishAgent(c, 'Sales Agent');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => toolResponse('update_lifecycle_stage', { stage: 'Hot lead' }, 'x1'));
    c.steps.push((req) => {
      const res = req.messages.at(-1)!.content as unknown as { is_error?: boolean; content: string }[];
      expect(res[0].is_error).toBe(true);
      expect(res[0].content).toContain('"Hot Lead"');
      return toolResponse('update_lifecycle_stage', { stage: 'Hot Lead' }, 'x2');
    });
    c.steps.push(() => textResponse('Noted'));
    await inbound(c, '601', 'saya nak beli');
    expect(c.store.getContact(c.store.listConversations()[0].contact_id)!.lifecycle).toBe('Hot Lead');
  });

  it('closes the conversation, still sends the goodbye, then reopens on the next message with a Reopened event', async () => {
    const c = setup({ echoFallback: false });
    const agent = await publishAgent(c, 'Support Agent');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    c.steps.push(() => toolResponse('close_conversation', { closing_note: 'Issue Resolved', summary: 'Asked opening hours' }));
    c.steps.push(() => textResponse('Sama-sama! Jumpa lagi.'));
    await inbound(c, '601', 'terima kasih, itu sahaja');
    const id = c.store.listConversations()[0].id;
    expect(c.store.getConversation(id)).toMatchObject({ status: 'closed', closing_note: 'Issue Resolved', summary: 'Asked opening hours', handler: 'none' });
    expect(c.sender.sent.at(-1)!.body).toBe('Sama-sama! Jumpa lagi.');

    c.steps.push((req) => {
      expect(req.system.map((s) => s.text).join('\n')).toContain('Conversation Reopened Event');
      return textResponse('Ya, ada apa lagi?');
    });
    await inbound(c, '601', 'eh satu lagi soalan');
    expect(c.store.getConversation(id)).toMatchObject({ status: 'open', handler: 'ai' });
    expect(c.sender.sent.at(-1)!.body).toBe('Ya, ada apa lagi?');
  });

  it('hands a conversation to another AI agent, which sees an Assignment Event; stops handoff loops', async () => {
    const c = setup({ echoFallback: false });
    const a = await publishAgent(c, 'Receptionist');
    const b = await publishAgent(c, 'Support Agent');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: a.id });
    c.steps.push(() => toolResponse('assign_conversation', { target: 'Support Agent' }));
    c.steps.push(() => textResponse('Saya sambungkan anda kepada pasukan sokongan.'));
    c.steps.push((req) => {
      expect(req.system.map((s) => s.text).join('\n')).toContain('Assignment Event');
      expect(req.system.map((s) => s.text).join('\n')).toContain('Receptionist'); // who assigned
      // the previous (assistant) message was sent by the first agent -> notice turn keeps the request valid
      expect(req.messages.at(-1)!.role).toBe('user');
      return textResponse('Hai, saya dari sokongan. Apa masalahnya?');
    });
    await inbound(c, '601', 'telefon saya rosak');
    expect(c.sender.sent.map((s) => s.body)).toEqual(['Saya sambungkan anda kepada pasukan sokongan.', 'Hai, saya dari sokongan. Apa masalahnya?']);
    const conv = c.store.listConversations()[0];
    expect(conv).toMatchObject({ handler: 'ai', agent_id: b.id });

    // ping-pong between two agents is cut off after 3 hops and a human is asked to step in
    const loop = setup({ echoFallback: false });
    const x = await publishAgent(loop, 'Agent X');
    const y = await publishAgent(loop, 'Agent Y');
    await api(loop, 'PUT', '/api/settings/default-agent', { agent_id: x.id });
    const other = (n: string) => () => toolResponse('assign_conversation', { target: n });
    loop.steps.push(other('Agent Y'), () => textResponse(''), other('Agent X'), () => textResponse(''), other('Agent Y'), () => textResponse(''));
    await inbound(loop, '601', 'hi');
    const lc = loop.store.listConversations()[0];
    expect(lc.handler).toBe('human');
    expect(loop.store.comments(lc.id).some((m) => m.body.includes('handoff chain stopped'))).toBe(true);
    expect(y.id).toBeGreaterThan(0);
  });

  it('balances team assignment: round robin across conversations and least-open when asked', async () => {
    const c = setup({ echoFallback: false });
    const agent = await publishAgent(c, 'Receptionist');
    await api(c, 'PUT', '/api/settings/default-agent', { agent_id: agent.id });
    for (const [n, strategy] of [['601', 'round_robin'], ['602', 'round_robin'], ['603', 'least_open']] as const) {
      c.steps.push(() => toolResponse('assign_conversation', { target: 'Sales Team', strategy }));
      c.steps.push(() => textResponse('ok'));
      await inbound(c, n, 'nak cakap dengan sales');
    }
    const owners = c.store.listConversations().reverse().map((x) => x.assignee_user);
    expect(owners.slice(0, 2)).toEqual(['Aisyah', 'Hafiz']);
    expect(owners[2]).toBe('Aisyah'); // Aisyah has 1 open, Hafiz has 1 open -> first member wins the tie
  });
});
