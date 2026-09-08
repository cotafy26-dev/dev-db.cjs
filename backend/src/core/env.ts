import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Carrega o .env da raiz do monorepo (um nivel acima de backend/) e o local, se houver.
loadDotenv({ path: path.resolve(process.cwd(), '../.env') });
loadDotenv({ path: path.resolve(process.cwd(), '.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatorio'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter >= 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter >= 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  AI_PROVIDER: z.enum(['ollama', 'openai', 'openrouter', 'together', 'vllm', 'stub']).default('ollama'),
  AI_BASE_URL: z.string().default('http://localhost:11434/v1'),
  AI_API_KEY: z.string().default('ollama'),
  AI_MODEL: z.string().default('hermes3:8b'),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().max(20).default(6),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_WEBHOOK_URL: z.string().optional().default(''),
  TELEGRAM_MODE: z.enum(['polling', 'webhook', 'off']).default('polling'),

  WHATSAPP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WHATSAPP_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[HERMES IA] Configuracao de ambiente invalida:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
