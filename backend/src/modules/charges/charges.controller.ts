import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './charges.service';

export const chargesRouter = Router();

chargesRouter.get(
  '/overdue-customers',
  requirePermission('charge.read'),
  asyncHandler(async (_req, res) => ok(res, await service.overdueCustomers())),
);

chargesRouter.get(
  '/',
  requirePermission('charge.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ status: z.string().optional() }), req.query);
    const { items, total } = await service.listCharges(p);
    ok(res, { items, total });
  }),
);

chargesRouter.post(
  '/',
  requirePermission('charge.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        accountReceivableId: z.string().min(1),
        channel: z.enum(['TELEGRAM', 'WHATSAPP']).nullish(),
        autoReminder: z.boolean().optional(),
        message: z.string().max(2000).optional(),
      }),
      req.body,
    );
    created(res, await service.createCharge(body));
  }),
);

chargesRouter.post(
  '/:id/send',
  requirePermission('charge.manage'),
  asyncHandler(async (req, res) => ok(res, await service.sendCharge(param(req, 'id')))),
);

chargesRouter.post(
  '/:id/cancel',
  requirePermission('charge.manage'),
  asyncHandler(async (req, res) => {
    await service.cancelCharge(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
