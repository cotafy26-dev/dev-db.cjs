import type { ChannelType } from '@prisma/client';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import { getTelegramBot } from '../telegram/telegram.bot';
import type { MessagingProvider } from './provider';

export class TelegramProvider implements MessagingProvider {
  readonly channel: ChannelType = 'TELEGRAM';

  isEnabled(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN) && env.TELEGRAM_MODE !== 'off';
  }

  async sendText(to: string, text: string) {
    const bot = getTelegramBot();
    if (!bot) return { ok: false, error: 'Telegram bot inativo' };
    try {
      const msg = await bot.sendMessage(to, text, { parse_mode: 'Markdown' });
      return { ok: true, id: String(msg.message_id) };
    } catch (err) {
      logger.warn({ err }, 'Telegram sendText falhou');
      return { ok: false, error: err instanceof Error ? err.message : 'erro' };
    }
  }

  async sendDocument(to: string, url: string, filename?: string) {
    const bot = getTelegramBot();
    if (!bot) return { ok: false, error: 'Telegram bot inativo' };
    try {
      await bot.sendDocument(to, url, {}, { filename: filename ?? 'documento' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'erro' };
    }
  }
}
