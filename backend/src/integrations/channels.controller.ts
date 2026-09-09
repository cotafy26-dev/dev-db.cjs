import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, param, parseBody } from '../core/http';
import { env } from '../core/env';
import { requirePermission } from '../http/middlewares/auth';
import * as service from './channels.service';

export const channelsRouter = Router();

channelsRouter.get(
  '/',
  requirePermission('integration.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await service.listLinks());
  }),
);

channelsRouter.post(
  '/pairing',
  requirePermission('integration.manage'),
  asyncHandler(async (req, res) => {
    const { channel } = parseBody(
      z.object({ channel: z.enum(['TELEGRAM', 'WHATSAPP']).default('TELEGRAM') }),
      req.body,
    );
    const result = await service.createPairingCode(channel);
    const botHint =
      channel === 'TELEGRAM'
        ? env.TELEGRAM_BOT_TOKEN
          ? 'Abra o bot no Telegram e envie: /start ' + result.code
          : 'Configure TELEGRAM_BOT_TOKEN no servidor para ativar o bot.'
        : 'Envie o codigo pela conversa do WhatsApp quando a integracao estiver ativa.';
    created(res, { ...result, instructions: botHint });
  }),
);

channelsRouter.delete(
  '/:id',
  requirePermission('integration.manage'),
  asyncHandler(async (req, res) => {
    await service.deactivateLink(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
