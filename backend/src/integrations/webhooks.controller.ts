import { Router } from 'express';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { asyncHandler } from '../core/http';
import { processTelegramUpdate } from './telegram/telegram.bot';
import { handleInboundMessage } from './inbound';
import { getMessagingProvider } from './messaging';

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

async function handleWhatsappInbound(req: import('express').Request, res: import('express').Response): Promise<void> {
  res.sendStatus(200); // ack imediato (exigencia da Meta)
  if (!env.WHATSAPP_ENABLED) return;
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== 'text') return;

    const from = message.from as string;
    const text = message.text?.body as string;
    const displayName = value?.contacts?.[0]?.profile?.name ?? null;

    const reply = await handleInboundMessage({ channel: 'WHATSAPP', externalId: from, text, displayName });
    const provider = getMessagingProvider('WHATSAPP');
    await provider?.sendText(from, reply);
  } catch (err) {
    logger.error({ err }, 'Erro no webhook do WhatsApp');
  }
}
