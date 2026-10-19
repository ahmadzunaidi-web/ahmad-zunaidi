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
  };
}
