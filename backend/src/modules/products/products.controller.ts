import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './products.service';
import * as categories from './categories.service';

export const productsRouter = Router();

const productBody = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(60).nullish(),
  barcode: z.string().max(60).nullish(),
  description: z.string().max(2000).nullish(),
  categoryId: z.string().nullish(),
  categoryName: z.string().max(80).nullish(),
  supplierId: z.string().nullish(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().nullish(),
  unit: z.string().max(12).optional(),
  stock: z.number().optional(),
  minStock: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

// ----- Categorias -----
productsRouter.get(
  '/categories',
  requirePermission('category.read', 'product.read'),
  asyncHandler(async (_req, res) => ok(res, await categories.listCategories())),
);
productsRouter.post(
  '/categories',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    const { name } = parseBody(z.object({ name: z.string().min(1).max(80) }), req.body);
    created(res, await categories.createCategory(name));
  }),
);
productsRouter.put(
  '/categories/:id',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    const { name } = parseBody(z.object({ name: z.string().min(1).max(80) }), req.body);
    ok(res, await categories.updateCategory(param(req, 'id'), name));
  }),
);
productsRouter.delete(
  '/categories/:id',
  requirePermission('category.manage'),
  asyncHandler(async (req, res) => {
    await categories.deleteCategory(param(req, 'id'));
    ok(res, { ok: true });
  }),
);

// ----- Produtos -----
productsRouter.get(
  '/',
  requirePermission('product.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({ categoryId: z.string().optional(), lowStock: z.coerce.boolean().optional() }),
      req.query,
    );
    const { items, total } = await service.listProducts(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

productsRouter.get(
  '/low-stock',
  requirePermission('product.read', 'inventory.read'),
  asyncHandler(async (_req, res) => ok(res, await service.lowStockProducts())),
);

productsRouter.get(
  '/:id',
  requirePermission('product.read'),
  asyncHandler(async (req, res) => ok(res, await service.getProduct(param(req, 'id')))),
);

productsRouter.post(
  '/',
  requirePermission('product.create'),
  asyncHandler(async (req, res) => created(res, await service.createProduct(parseBody(productBody, req.body)))),
);

productsRouter.put(
  '/:id',
  requirePermission('product.update'),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateProduct(param(req, 'id'), parseBody(productBody.partial(), req.body))),
  ),
);

productsRouter.delete(
  '/:id',
  requirePermission('product.delete'),
  asyncHandler(async (req, res) => {
    await service.deleteProduct(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
