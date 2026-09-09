import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { parseNaturalDate, parseNaturalDateTime } from '../../core/dates';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './appointments.service';

export const appointmentsRouter = Router();

const body = z.object({
  title: z.string().min(1).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  description: z.string().max(2000).nullish(),
  location: z.string().max(200).nullish(),
  customerId: z.string().nullish(),
  remindAt: z.coerce.date().nullish(),
});

appointmentsRouter.get(
  '/',
  requirePermission('appointment.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({ from: z.string().optional(), to: z.string().optional(), status: z.string().optional() }),
      req.query,
    );
    const { items, total } = await service.listAppointments({
      ...p,
      from: p.from ? parseNaturalDateTime(p.from) ?? undefined : undefined,
      to: p.to ? parseNaturalDate(p.to) ?? undefined : undefined,
    });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

appointmentsRouter.get(
  '/today',
  requirePermission('appointment.read'),
  asyncHandler(async (_req, res) => ok(res, await service.todayAppointments())),
);

appointmentsRouter.get(
  '/upcoming',
  requirePermission('appointment.read'),
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ days: z.coerce.number().int().positive().max(90).default(7) }), req.query);
    ok(res, await service.upcomingAppointments(q.days));
  }),
);

appointmentsRouter.post(
  '/',
  requirePermission('appointment.manage'),
  asyncHandler(async (req, res) => created(res, await service.createAppointment(parseBody(body, req.body)))),
);

appointmentsRouter.put(
  '/:id',
  requirePermission('appointment.manage'),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateAppointment(param(req, 'id'), parseBody(body.partial().extend({ status: z.string().optional() }), req.body))),
  ),
);

appointmentsRouter.post(
  '/:id/cancel',
  requirePermission('appointment.manage'),
  asyncHandler(async (req, res) => ok(res, await service.cancelAppointment(param(req, 'id')))),
);
