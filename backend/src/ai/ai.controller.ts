import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, param, parseBody } from '../core/http';
import { prisma } from '../core/prisma';
import { scope } from '../core/tenant';
import { NotFoundError } from '../core/errors';
import { requirePermission } from '../http/middlewares/auth';
import { getAIProvider } from './provider';
import { allTools } from './tools';
import { runOrchestrator } from './orchestrator';
import { getMessages, listConversations } from './conversations.service';

export const aiRouter = Router();

aiRouter.post(
  '/chat',
  requirePermission('ai.use'),
  asyncHandler(async (req, res) => {
    const { message } = parseBody(z.object({ message: z.string().min(1).max(4000) }), req.body);
    const auth = req.auth!;
    const company = await prisma.company.findUnique({ where: { id: auth.companyId } });

    const result = await runOrchestrator({
      text: message,
      channel: 'WEB',
      externalId: `web:${auth.userId}`,
      companyName: company?.name ?? 'Empresa',
      segment: company?.segment,
      currency: company?.currency,
      timezone: company?.timezone,
      userName: auth.email,
      role: auth.role,
    });
    ok(res, result);
  }),
);

aiRouter.get(
  '/conversations',
  requirePermission('ai.use'),
  asyncHandler(async (_req, res) => ok(res, await listConversations())),
);

aiRouter.get(
  '/conversations/:id/messages',
  requirePermission('ai.use'),
  asyncHandler(async (req, res) => {
    const msgs = await getMessages(param(req, 'id'));
    if (!msgs) throw new NotFoundError('Conversa', param(req, 'id'));
    ok(res, msgs);
  }),
);

aiRouter.get(
  '/executions',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ limit: z.coerce.number().int().max(100).default(50) }), req.query);
    ok(res, await prisma.aIExecution.findMany({ where: scope(), orderBy: { createdAt: 'desc' }, take: q.limit }));
  }),
);

aiRouter.get(
  '/tools',
  requirePermission('ai.use'),
  asyncHandler(async (_req, res) =>
    ok(
      res,
      allTools().map((t) => ({
        name: t.name,
        description: t.description,
        permission: t.permission,
        destructive: !!t.destructive,
      })),
    ),
  ),
);

aiRouter.get(
  '/health',
  requirePermission('ai.use'),
  asyncHandler(async (_req, res) => {
    const provider = getAIProvider();
    const health = await provider.health();
    ok(res, { provider: provider.id, model: provider.model, ...health });
  }),
);
