import { env } from './core/env';
import { logger } from './core/logger';
import { connectDatabase, disconnectDatabase } from './core/prisma';
import { bootstrapGlobalData } from './core/bootstrap';
import { createApp } from './http/app';
import { startTelegram, stopTelegram } from './integrations/telegram/telegram.bot';
import { startScheduler, stopScheduler } from './core/scheduler';

async function main(): Promise<void> {
  await connectDatabase();
  await bootstrapGlobalData();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`HERMES IA API on ${env.API_URL} (porta ${env.PORT})  [${env.NODE_ENV}]`);
  });

  await startTelegram();
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

main().catch((err) => {
  logger.fatal(err, 'Falha ao iniciar o servidor');
  process.exit(1);
});
