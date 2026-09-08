import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, parseBody } from '../../core/http';
import * as service from './reports.service';

export const reportsRouter = Router();

reportsRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    ok(res, await service.overview());
  }),
);

reportsRouter.get(
  '/sales-by-day',
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ days: z.coerce.number().int().positive().max(90).default(14) }), req.query);
    ok(res, await service.salesByDay(q.days));
  }),
);

reportsRouter.get(
  '/top-products',
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ limit: z.coerce.number().int().positive().max(20).default(5) }), req.query);
    ok(res, await service.topProducts(q.limit));
  }),
);
