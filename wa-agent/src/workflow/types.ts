export type StepType =
  | 'send_message' | 'ask_question' | 'branch' | 'assign_to' | 'update_field' | 'update_tag' | 'update_lifecycle'
  | 'open_conversation' | 'close_conversation' | 'add_comment' | 'jump_to' | 'wait' | 'trigger_workflow'
  | 'date_time' | 'http_request' | 'send_template';

export const STEP_TYPES: StepType[] = [
  'send_message', 'ask_question', 'branch', 'assign_to', 'update_field', 'update_tag', 'update_lifecycle',
  'open_conversation', 'close_conversation', 'add_comment', 'jump_to', 'wait', 'trigger_workflow', 'date_time', 'http_request', 'send_template',
];

export type TriggerType =
  | 'conversation_opened' | 'conversation_closed' | 'contact_tag_updated' | 'contact_field_updated'
  | 'lifecycle_updated' | 'shortcut' | 'incoming_webhook' | 'click_to_chat_ad' | 'manual';

export const TRIGGER_TYPES: TriggerType[] = [
  'conversation_opened', 'conversation_closed', 'contact_tag_updated', 'contact_field_updated',
  'lifecycle_updated', 'shortcut', 'incoming_webhook', 'click_to_chat_ad', 'manual',
];

export type Condition = {
  source: 'field' | 'lifecycle' | 'tag' | 'var' | 'trigger' | 'conversation';
  key?: string;
  op: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_empty' | 'is_not_empty' | 'has_tag' | 'not_has_tag';
  value?: string;
};

export interface Step {
  id: string;
  type: StepType;
  name?: string;
  config: Record<string, any>;
  /** Continue-with pointer (success path). null/undefined = end of this path. */
  next?: string | null;
  /** Extra outputs: failure, timeout, else, b0..bN (branch / date_time). */
  outputs?: Record<string, string | null>;
}

export interface Graph {
  start: string | null;
  steps: Record<string, Step>;
}

export interface Trigger {
  type: TriggerType;
  /** Per-type options: sources[], tag, action, field, stage, label, campaign. */
  config?: Record<string, any>;
  /** Extra conditions that must all hold when the trigger fires. */
  conditions?: Condition[];
}

export interface WorkflowSettings {
  exit_on_outgoing?: boolean;
  exit_on_incoming?: boolean;
  exit_on_manual_assign?: boolean;
}

export interface WorkflowRecord {
  id: number;
  name: string;
  status: 'draft' | 'published' | 'stopped';
  trigger: Trigger;
  graph: Graph;
  settings: WorkflowSettings;
  hook_token: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

export type RunStatus = 'running' | 'waiting' | 'completed' | 'exited' | 'failed';
export type WaitKind = 'question' | 'wait' | 'assign';

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  contact_id: number;
  conversation_id: number | null;
  status: RunStatus;
  step_id: string | null;
  wait_kind: WaitKind | null;
  wait_until: number | null;
  vars: Record<string, unknown>;
  trigger_vars: Record<string, unknown>;
  steps_run: number;
  is_test: boolean;
  ended_reason: string | null;
  created_at: number;
  updated_at: number;
}

export type EventSource = 'user' | 'contact' | 'workflow' | 'ai_agent' | 'api' | 'system';

export interface WorkflowEvent {
  type: Exclude<TriggerType, 'manual' | 'shortcut' | 'incoming_webhook'>;
  contactId: number;
  conversationId: number | null;
  source: EventSource;
  /** Set when a workflow caused the event (loop protection). */
  originWorkflowId?: number;
  data?: { tag?: string; action?: 'added' | 'removed'; field?: string; stage?: string; referral?: Record<string, string> };
}

export const LIMITS = {
  maxSteps: 100,
  maxWorkflows: 150,
  maxChoices: 10,
  maxChoiceLen: 20,
  maxTimeoutMs: 7 * 24 * 3600_000,
  maxRunSteps: 300,
  maxRunsPerMinute: 5,
};
