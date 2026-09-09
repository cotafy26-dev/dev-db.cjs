import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './inventory.service';

export const inventoryRouter = Router();

const moveBody = z.object({
  productId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'ADJUST', 'RETURN']),
  quantity: z.number(),
  reason: z.string().max(240).optional(),
  reference: z.string().max(120).optional(),
});

inventoryRouter.get(
  '/movements',
  requirePermission('inventory.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ productId: z.string().optional() }), req.query);
    const { items, total } = await service.listMovements(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

inventoryRouter.get(
  '/:productId',
  requirePermission('inventory.read'),
  asyncHandler(async (req, res) => ok(res, await service.getStock(param(req, 'productId')))),
);

inventoryRouter.post(
  '/movement',
  requirePermission('inventory.move'),
  asyncHandler(async (req, res) => {
    created(res, await service.registerMovement(parseBody(moveBody, req.body)));
  }),
);

// alias plural
inventoryRouter.post(
  '/movements',
  requirePermission('inventory.move'),
  asyncHandler(async (req, res) => {
    created(res, await service.registerMovement(parseBody(moveBody, req.body)));
  }),
);
