import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import * as service from './products.service';

export const productsRouter = Router();

const productBody = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(60).nullish(),
  description: z.string().max(2000).nullish(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullish(),
  stock: z.number().optional(),
  minStock: z.number().nonnegative().optional(),
  unit: z.string().max(12).optional(),
  active: z.boolean().optional(),
});

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ lowStock: z.coerce.boolean().optional() }), req.query);
    const { items, total } = await service.listProducts(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

productsRouter.get(
  '/low-stock',
  asyncHandler(async (_req, res) => {
    ok(res, await service.lowStockProducts());
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    ok(res, await service.getProduct(param(req, 'id')));
  }),
);

productsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    created(res, await service.createProduct(parseBody(productBody, req.body)));
  }),
);

productsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ok(res, await service.updateProduct(param(req, 'id'), parseBody(productBody.partial(), req.body)));
  }),
);

productsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteProduct(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
