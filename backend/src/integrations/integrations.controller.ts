import { Router } from 'express';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { asyncHandler } from '../core/http';
import { processTelegramUpdate } from './telegram/telegram.bot';
import { handleInboundMessage } from './inbound';

/** Rotas publicas de webhook (sem autenticacao JWT). Montadas em /api/integrations. */
export const integrationsRouter = Router();

// ---- Telegram (modo webhook) ----
integrationsRouter.post('/telegram/webhook', (req, res) => {
  processTelegramUpdate(req.body);
  res.sendStatus(200);
});

// ---- WhatsApp Cloud API (estrutura pronta; ativa com WHATSAPP_ENABLED=true) ----
integrationsRouter.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
});

integrationsRouter.post(
  '/whatsapp/webhook',
  asyncHandler(async (req, res) => {
    res.sendStatus(200); // ack imediato (exigencia da Meta)
    if (!env.WHATSAPP_ENABLED) return;

    try {
      const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = entry?.messages?.[0];
      if (!message || message.type !== 'text') return;

      const from = message.from as string;
      const text = message.text?.body as string;
      const displayName = entry?.contacts?.[0]?.profile?.name ?? null;

      const reply = await handleInboundMessage({
        channel: 'WHATSAPP',
        externalId: from,
        text,
        displayName,
      });
      await sendWhatsappText(from, reply);
    } catch (err) {
      logger.error({ err }, 'Erro no webhook do WhatsApp');
    }
  }),
);

async function sendWhatsappText(to: string, body: string): Promise<void> {
  if (!env.WHATSAPP_ENABLED || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;
  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  }).catch((err) => logger.error({ err }, 'Falha ao enviar mensagem no WhatsApp'));
}
