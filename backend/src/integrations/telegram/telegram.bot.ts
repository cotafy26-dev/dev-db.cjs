import TelegramBot from 'node-telegram-bot-api';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import { handleInboundMessage } from '../inbound';

let bot: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return bot;
}

export async function startTelegram(): Promise<void> {
  if (env.TELEGRAM_MODE === 'off' || !env.TELEGRAM_BOT_TOKEN) {
    logger.info('Telegram desativado (sem TELEGRAM_BOT_TOKEN ou TELEGRAM_MODE=off)');
    return;
  }

  const usePolling = env.TELEGRAM_MODE === 'polling';
  bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: usePolling });

  if (!usePolling && env.TELEGRAM_WEBHOOK_URL) {
    await bot.setWebHook(`${env.TELEGRAM_WEBHOOK_URL.replace(/\/$/, '')}/api/integrations/telegram/webhook`);
    logger.info('Telegram webhook configurado');
  }

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ?? '';
    if (!text) return;

    try {
      const reply = await handleInboundMessage({
        channel: 'TELEGRAM',
        externalId: String(chatId),
        text,
        displayName:
          msg.from?.first_name || msg.from?.username || msg.chat.title || null,
      });
      await bot!.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error({ err }, 'Erro no handler do Telegram');
      await bot!.sendMessage(chatId, 'Ocorreu um erro ao processar sua mensagem.');
    }
  });

  bot.on('polling_error', (err) => logger.warn({ err: err.message }, 'Telegram polling_error'));

  logger.info(`Telegram ativo (modo ${env.TELEGRAM_MODE})`);
}

/** Processa update recebido via webhook (quando TELEGRAM_MODE=webhook). */
export function processTelegramUpdate(update: TelegramBot.Update): void {
  bot?.processUpdate(update);
}

export async function stopTelegram(): Promise<void> {
  if (bot) {
    try {
      await bot.stopPolling();
    } catch {
      /* noop */
    }
    bot = null;
  }
}
