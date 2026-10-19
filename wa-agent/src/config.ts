export interface Config {
  port: number;
  dbPath: string;
  workspacePath: string;
  waVerifyToken: string;
  waAppSecret: string;
  waAccessToken: string;
  waPhoneNumberId: string;
  waApiVersion: string;
  /** Skip X-Hub-Signature-256 verification (dev only). */
  allowUnsigned: boolean;
  adminToken: string;
  /** Echo inbound text back when no AI agent is handling the conversation (milestone 1 behaviour). */
  echoFallback: boolean;
  devSimulator: boolean;
  anthropicKey: string;
  defaultModel: string;
  /** WhatsApp free-form messages only allowed within this window after the last inbound message. */
  windowMs: number;
  /** Circuit breaker: max AI runs per conversation per hour. */
  aiMaxRunsPerHour: number;
  /** Where inbound media is stored (private, never served from a public path). */
  mediaDir: string;
  mediaMaxBytes: number;
  /** Media (and transcripts) older than this are deleted. 0 = keep forever. */
  mediaRetentionDays: number;
  /** Optional speech-to-text (OpenAI-compatible /audio/transcriptions). Audio is sent to this provider. */
  transcribeUrl: string;
  transcribeKey: string;
  transcribeModel: string;
}

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? 'data/wa-agent.db',
    workspacePath: env.WORKSPACE_CONFIG ?? 'config/workspace.json',
    waVerifyToken: env.WA_VERIFY_TOKEN ?? '',
    waAppSecret: env.WA_APP_SECRET ?? '',
    waAccessToken: env.WA_ACCESS_TOKEN ?? '',
    waPhoneNumberId: env.WA_PHONE_NUMBER_ID ?? '',
    waApiVersion: env.WA_API_VERSION ?? 'v21.0',
    allowUnsigned: bool(env.ALLOW_UNSIGNED, false),
    adminToken: env.ADMIN_TOKEN ?? '',
    echoFallback: bool(env.ECHO_FALLBACK, !prod),
    devSimulator: bool(env.DEV_SIMULATOR, !prod),
    anthropicKey: env.ANTHROPIC_API_KEY ?? '',
    defaultModel: env.AGENT_MODEL ?? 'claude-opus-5-5',
    windowMs: 24 * 60 * 60 * 1000,
    aiMaxRunsPerHour: Number(env.AI_MAX_RUNS_PER_HOUR ?? 40),
    mediaDir: env.MEDIA_DIR ?? 'data/media',
    mediaMaxBytes: Number(env.MEDIA_MAX_MB ?? 16) * 1024 * 1024,
    mediaRetentionDays: Number(env.MEDIA_RETENTION_DAYS ?? 30),
    transcribeUrl: env.TRANSCRIBE_URL ?? '',
    transcribeKey: env.TRANSCRIBE_API_KEY ?? '',
    transcribeModel: env.TRANSCRIBE_MODEL ?? 'whisper-1',
  };
}
