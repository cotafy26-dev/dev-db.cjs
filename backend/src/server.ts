import { env } from './core/env';
import { logger } from './core/logger';
import { connectDatabase, disconnectDatabase } from './core/prisma';
import { bootstrapGlobalData } from './core/bootstrap';
import { createApp } from './http/app';
import { startTelegram, stopTelegram } from './integrations/telegram/telegram.bot';
import { startScheduler, stopScheduler } from './core/scheduler';

// Log cru no stdout - garante visibilidade nos logs do host mesmo se o pino falhar.
// eslint-disable-next-line no-console
const raw = (m: string) => console.log(`[hermes] ${m}`);

async function main(): Promise<void> {
  const app = createApp();

  // 1) Sobe o listener IMEDIATAMENTE (o proxy do host precisa da porta de pe).
  const server = app.listen(env.PORT, env.HOST, () => {
    raw(`ouvindo em ${env.HOST}:${env.PORT}  [${env.NODE_ENV}]`);
    logger.info(`HERMES IA API on ${env.HOST}:${env.PORT}  [${env.NODE_ENV}]`);
  });
  server.on('error', (err) => {
    raw(`ERRO no listener: ${(err as Error).message}`);
    logger.fatal(err, 'Falha no listener HTTP');
    process.exit(1);
  });

  // 2) Inicializacoes que podem demorar/falhar - NAO derrubam o servidor.
  try {
    await connectDatabase();
    await bootstrapGlobalData();
  } catch (err) {
    raw(`banco indisponivel no boot: ${(err as Error).message}`);
    logger.error({ err }, 'Banco indisponivel no boot - a API sobe mesmo assim (/api/health mostra db down)');
  }

  try {
    await startTelegram();
  } catch (err) {
    logger.error({ err }, 'Falha ao iniciar Telegram');
  }
  startScheduler();

  const shutdown = (signal: string) => {
    logger.info(`${signal} recebido, encerrando...`);
    stopScheduler();
    server.close(async () => {
      await stopTelegram();
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  raw(`unhandledRejection: ${String(reason)}`);
  logger.error({ reason }, 'unhandledRejection');
});

main().catch((err) => {
  raw(`FALHA FATAL ao iniciar: ${(err as Error)?.message ?? err}`);
  logger.fatal(err, 'Falha ao iniciar o servidor');
  process.exit(1);
});
