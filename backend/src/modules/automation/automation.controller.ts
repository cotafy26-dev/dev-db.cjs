import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, param, parseBody } from '../../core/http';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './automation.service';

export const automationRouter = Router();

const body = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(service.TRIGGERS),
  action: z.enum(service.ACTIONS),
  config: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
});

automationRouter.get(
  '/',
  requirePermission('automation.read'),
  asyncHandler(async (_req, res) => ok(res, await service.listAutomations())),
);

automationRouter.get(
  '/options',
  requirePermission('automation.read'),
  asyncHandler(async (_req, res) => ok(res, { triggers: service.TRIGGERS, actions: service.ACTIONS })),
);

automationRouter.post(
  '/',
  requirePermission('automation.manage'),
  asyncHandler(async (req, res) => created(res, await service.createAutomation(parseBody(body, req.body)))),
);

automationRouter.put(
  '/:id',
  requirePermission('automation.manage'),
  asyncHandler(async (req, res) => ok(res, await service.updateAutomation(param(req, 'id'), parseBody(body.partial(), req.body)))),
);

automationRouter.delete(
  '/:id',
  requirePermission('automation.manage'),
  asyncHandler(async (req, res) => {
    await service.deleteAutomation(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
