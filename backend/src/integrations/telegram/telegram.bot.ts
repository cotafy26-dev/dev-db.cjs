import TelegramBot from 'node-telegram-bot-api';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import { handleInboundMessage } from '../inbound';
import { sttEnabled, synthesizeSpeech, transcribeAudio } from '../../ai/audio';

let bot: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return bot;
}

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const link = await bot!.getFileLink(fileId);
  const res = await fetch(link);
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Extrai o texto da mensagem: texto, legenda, ou transcricao de audio/voz. */
async function extractText(msg: TelegramBot.Message): Promise<{ text: string; wasVoice: boolean }> {
  if (msg.text) return { text: msg.text, wasVoice: false };

  const voice = msg.voice ?? msg.audio ?? (msg as unknown as { video_note?: { file_id: string } }).video_note;
  if (voice?.file_id && sttEnabled()) {
    try {
      const buffer = await downloadTelegramFile(voice.file_id);
      const text = await transcribeAudio({ buffer, filename: 'audio.ogg', mime: 'audio/ogg' });
      logger.info({ chars: text.length }, 'Telegram: audio transcrito');
      return { text, wasVoice: true };
    } catch (err) {
      logger.warn({ err }, 'Telegram: falha ao transcrever audio');
      return { text: '', wasVoice: true };
    }
  }
  return { text: msg.caption ?? '', wasVoice: false };
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
    try {
      const { text, wasVoice } = await extractText(msg);
      if (!text.trim()) {
        if (wasVoice) await bot!.sendMessage(chatId, 'Nao consegui entender o audio. Pode repetir ou escrever?');
        return;
      }

      const reply = await handleInboundMessage({
        channel: 'TELEGRAM',
        externalId: String(chatId),
        text,
        displayName: msg.from?.first_name || msg.from?.username || msg.chat.title || null,
      });

      await bot!.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

      // Espelha a modalidade: se veio audio e TTS ligado, responde tambem em audio.
      if (wasVoice) {
        const speech = await synthesizeSpeech(reply);
        if (speech) {
          await bot!.sendVoice(chatId, speech.buffer, {}, { filename: 'resposta.ogg', contentType: speech.mime });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erro no handler do Telegram');
      await bot!.sendMessage(chatId, 'Ocorreu um erro ao processar sua mensagem.');
    }
  });

  bot.on('polling_error', (err) => logger.warn({ err: err.message }, 'Telegram polling_error'));

  logger.info(`Telegram ativo (modo ${env.TELEGRAM_MODE})${sttEnabled() ? ' + audio' : ''}`);
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
