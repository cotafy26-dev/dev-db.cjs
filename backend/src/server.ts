import { env } from './core/env';
import { logger } from './core/logger';
import { connectDatabase, disconnectDatabase } from './core/prisma';
import { createApp } from './http/app';
import { startTelegram, stopTelegram } from './integrations/telegram/telegram.bot';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`HERMES IA API on http://localhost:${env.PORT}  [${env.NODE_ENV}]`);
  });

  await startTelegram();

  const shutdown = (signal: string) => {
    logger.info(`${signal} recebido, encerrando...`);
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
