import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, param, parseBody } from '../core/http';
import { prisma } from '../core/prisma';
import { getAIProvider } from './provider';
import { getToolSchemas } from './tools';
import { runOrchestrator } from './orchestrator';
import { getMessages, listConversations } from './conversations.service';
import { NotFoundError } from '../core/errors';

export const aiRouter = Router();

aiRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message } = parseBody(z.object({ message: z.string().min(1).max(4000) }), req.body);
    const auth = req.auth!;
    const company = await prisma.company.findUnique({ where: { id: auth.companyId } });

    const result = await runOrchestrator({
      text: message,
      channel: 'WEB',
      externalId: `web:${auth.userId}`,
      companyName: company?.name ?? 'Empresa',
      userName: auth.email,
    });

    ok(res, result);
  }),
);

aiRouter.get(
  '/conversations',
  asyncHandler(async (_req, res) => {
    ok(res, await listConversations());
  }),
);

aiRouter.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const msgs = await getMessages(param(req, 'id'));
    if (!msgs) throw new NotFoundError('Conversa', param(req, 'id'));
    ok(res, msgs);
  }),
);

aiRouter.get(
  '/tools',
  asyncHandler(async (_req, res) => {
    ok(res, getToolSchemas());
  }),
);

aiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const provider = getAIProvider();
    const health = await provider.health();
    ok(res, { provider: provider.id, model: provider.model, ...health });
  }),
);
