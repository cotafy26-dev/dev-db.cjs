import { Router } from 'express';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { asyncHandler } from '../core/http';
import { processTelegramUpdate } from './telegram/telegram.bot';
import { handleInboundMessage } from './inbound';
import { getMessagingProvider } from './messaging';
import { sttEnabled, synthesizeSpeech, transcribeAudio } from '../ai/audio';

/** Webhooks publicos (sem JWT). Montado em /api/webhooks e /api/integrations. */
export const webhooksRouter = Router();

// ---- Telegram (modo webhook) ----
webhooksRouter.post('/telegram', (req, res) => {
  processTelegramUpdate(req.body);
  res.sendStatus(200);
});
webhooksRouter.post('/telegram/webhook', (req, res) => {
  processTelegramUpdate(req.body);
  res.sendStatus(200);
});

// ---- WhatsApp Cloud API ----
webhooksRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
});
webhooksRouter.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(req.query['hub.challenge']));
    return;
  }
  res.sendStatus(403);
});

webhooksRouter.post(
  '/whatsapp',
  asyncHandler(handleWhatsappInbound),
);
webhooksRouter.post(
  '/whatsapp/webhook',
  asyncHandler(handleWhatsappInbound),
);

async function downloadWhatsappMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const meta = await fetch(`${env.WHATSAPP_API_URL.replace(/\/$/, '')}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` },
  });
  const info = (await meta.json()) as { url?: string; mime_type?: string };
  if (!info.url) throw new Error('media url ausente');
  const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` } });
  return { buffer: Buffer.from(await bin.arrayBuffer()), mime: info.mime_type || 'audio/ogg' };
}

async function handleWhatsappInbound(req: import('express').Request, res: import('express').Response): Promise<void> {
  res.sendStatus(200); // ack imediato (exigencia da Meta)
  if (!env.WHATSAPP_ENABLED) return;
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from as string;
    const displayName = value?.contacts?.[0]?.profile?.name ?? null;
    let text = '';
    let wasVoice = false;

    if (message.type === 'text') {
      text = message.text?.body ?? '';
    } else if (message.type === 'audio' && sttEnabled()) {
      wasVoice = true;
      const mediaId = message.audio?.id as string | undefined;
      if (mediaId) {
        try {
          const media = await downloadWhatsappMedia(mediaId);
          text = await transcribeAudio({ buffer: media.buffer, filename: 'audio.ogg', mime: media.mime });
        } catch (err) {
          logger.warn({ err }, 'WhatsApp: falha ao transcrever audio');
        }
      }
    } else {
      return; // tipo nao suportado (imagem, documento, etc.)
    }

    const provider = getMessagingProvider('WHATSAPP');
    if (!text.trim()) {
      if (wasVoice) await provider?.sendText(from, 'Nao consegui entender o audio. Pode repetir ou escrever?');
      return;
    }

    const reply = await handleInboundMessage({ channel: 'WHATSAPP', externalId: from, text, displayName });
    await provider?.sendText(from, reply);

    if (wasVoice && provider?.sendVoice) {
      const speech = await synthesizeSpeech(reply);
      if (speech) await provider.sendVoice(from, speech.buffer, speech.mime);
    }
  } catch (err) {
    logger.error({ err }, 'Erro no webhook do WhatsApp');
  }
}
