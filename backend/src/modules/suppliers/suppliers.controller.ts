import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './suppliers.service';

export const suppliersRouter = Router();

const body = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).nullish(),
  email: z.string().email().max(160).nullish(),
  document: z.string().max(20).nullish(),
  addressLine: z.string().max(240).nullish(),
  notes: z.string().max(2000).nullish(),
});

suppliersRouter.get(
  '/',
  requirePermission('supplier.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema, req.query);
    const { items, total } = await service.listSuppliers(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

suppliersRouter.get(
  '/:id',
  requirePermission('supplier.read'),
  asyncHandler(async (req, res) => ok(res, await service.getSupplier(param(req, 'id')))),
);

suppliersRouter.post(
  '/',
  requirePermission('supplier.create'),
  asyncHandler(async (req, res) => created(res, await service.createSupplier(parseBody(body, req.body)))),
);

suppliersRouter.put(
  '/:id',
  requirePermission('supplier.update'),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateSupplier(param(req, 'id'), parseBody(body.partial(), req.body))),
  ),
);

suppliersRouter.delete(
  '/:id',
  requirePermission('supplier.delete'),
  asyncHandler(async (req, res) => {
    await service.deleteSupplier(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
