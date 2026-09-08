import pino from 'pino';
import { env, isProd } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.passwordHash',
      '*.password',
      '*.token',
      '*.tokenHash',
      'AI_API_KEY',
      'TELEGRAM_BOT_TOKEN',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
