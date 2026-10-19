export type Handler = 'none' | 'ai' | 'human';
export type MessageSender = 'contact' | 'ai' | 'human' | 'echo' | 'system' | 'workflow';
export type MessageStatus = 'received' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Contact {
  id: number;
  wa_id: string;
  name: string | null;
  email: string | null;
  lifecycle: string | null;
  tags: string[];
  fields: Record<string, string | number>;
  created_at: number;
}

export interface Conversation {
  id: number;
  contact_id: number;
  status: 'open' | 'closed';
  handler: Handler;
  agent_id: number | null;
  assignee_team: string | null;
  assignee_user: string | null;
  last_inbound_at: number | null;
  opened_at: number;
  closed_at: number | null;
  closing_note: string | null;
  summary: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'in' | 'out';
  sender: MessageSender;
  type: string;
  body: string;
  wa_message_id: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: number;
}

export interface ConvEvent {
  id: number;
  conversation_id: number;
  type: 'assigned' | 'reopened';
  payload: Record<string, unknown>;
  after_message_id: number;
  created_at: number;
}

export interface Comment {
  id: number;
  conversation_id: number;
  author: string;
  body: string;
  created_at: number;
}

export type SkillKey = 'assign' | 'close' | 'set_field' | 'set_lifecycle' | 'tags' | 'comment' | 'http' | 'trigger_workflow' | 'followup' | 'attachment';

export interface SkillConfig {
  enabled: boolean;
  /** "When and how should this skill be performed?" (appended to the tool description). */
  prompt: string;
}

export interface HttpInput {
  name: string;
  format: 'text' | 'number' | 'boolean' | 'date';
  description: string;
  array?: boolean;
}

/** One "Make HTTP request" action (max 10 per agent). Values may use $agent.<input> and $contact.<field>. */
export interface HttpAction {
  name: string;
  description: string;
  inputs: HttpInput[];
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
}

export interface AgentDraft {
  instructions: string;
  model: string;
  wait_seconds: number;
  knowledge_ids: number[];
  skills: Record<SkillKey, SkillConfig>;
  http_actions: HttpAction[];
}

export interface AgentSnapshot extends AgentDraft {
  id: number;
  name: string;
  version: number;
}

export interface Agent {
  id: number;
  name: string;
  emoji: string;
  description: string;
  status: 'inactive' | 'active';
  published_version: number | null;
  draft: AgentDraft;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeSource {
  id: number;
  name: string;
  type: 'text' | 'url';
  uri: string | null;
  status: 'completed' | 'error';
  error: string | null;
  chars: number;
  chunks: number;
  created_at: number;
}

export interface KnowledgeHit {
  source_id: number;
  source: string;
  text: string;
}

export const INSTRUCTIONS_LIMIT = 10_000;
export const HISTORY_WINDOW = 20;
export const COMMENT_LIMIT = 2_000;
