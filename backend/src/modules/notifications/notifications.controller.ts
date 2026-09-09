import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, param, paginated, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  requirePermission('notification.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ unreadOnly: z.coerce.boolean().optional() }), req.query);
    const { items, total, unread } = await service.listNotifications(p);
    res.json({ data: items, meta: { page: p.page, pageSize: p.pageSize, total, unread } });
  }),
);

notificationsRouter.post(
  '/:id/read',
  requirePermission('notification.read'),
  asyncHandler(async (req, res) => {
    await service.markRead(param(req, 'id'));
    ok(res, { ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  requirePermission('notification.read'),
  asyncHandler(async (_req, res) => {
    await service.markAllRead();
    ok(res, { ok: true });
  }),
);
