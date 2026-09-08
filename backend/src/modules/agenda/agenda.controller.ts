import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { parseNaturalDate, parseNaturalDateTime } from '../../core/dates';
import * as service from './agenda.service';

export const agendaRouter = Router();

const eventBody = z.object({
  title: z.string().min(1).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  description: z.string().max(2000).nullish(),
  location: z.string().max(200).nullish(),
  customerId: z.string().nullish(),
  remindAt: z.coerce.date().nullish(),
});

agendaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
      }),
      req.query,
    );
    const { items, total } = await service.listEvents({
      ...p,
      from: p.from ? parseNaturalDateTime(p.from) ?? undefined : undefined,
      to: p.to ? parseNaturalDate(p.to) ?? undefined : undefined,
    });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

agendaRouter.get(
  '/upcoming',
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ days: z.coerce.number().int().positive().max(90).default(7) }), req.query);
    ok(res, await service.upcomingEvents(q.days));
  }),
);

agendaRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    created(res, await service.createEvent(parseBody(eventBody, req.body)));
  }),
);

agendaRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ok(res, await service.updateEvent(param(req, 'id'), parseBody(eventBody.partial().extend({ status: z.string().optional() }), req.body)));
  }),
);

agendaRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteEvent(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
