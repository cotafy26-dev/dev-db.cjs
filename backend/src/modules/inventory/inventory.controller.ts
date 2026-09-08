import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { prisma } from '../../core/prisma';
import * as service from './inventory.service';

export const inventoryRouter = Router();

const moveBody = z.object({
  productId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.number().positive(),
  reason: z.string().max(240).optional(),
});

inventoryRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ productId: z.string().optional() }), req.query);
    const { items, total } = await service.listMovements(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

inventoryRouter.post(
  '/movements',
  asyncHandler(async (req, res) => {
    const input = parseBody(moveBody, req.body);
    const result = await prisma.$transaction((tx) => service.applyStockMovement(input, tx));
    created(res, result);
  }),
);
