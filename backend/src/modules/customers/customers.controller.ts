import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './customers.service';

export const customersRouter = Router();

const customerBody = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).nullish(),
  whatsapp: z.string().max(20).nullish(),
  email: z.string().email().max(160).nullish(),
  document: z.string().max(20).nullish(),
  addressLine: z.string().max(240).nullish(),
  city: z.string().max(120).nullish(),
  state: z.string().max(40).nullish(),
  zip: z.string().max(12).nullish(),
  notes: z.string().max(2000).nullish(),
});

customersRouter.get(
  '/',
  requirePermission('customer.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema, req.query);
    const { items, total } = await service.listCustomers(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

customersRouter.get(
  '/:id',
  requirePermission('customer.read'),
  asyncHandler(async (req, res) => {
    const customer = await service.getCustomer(param(req, 'id'));
    const balance = await service.customerBalance(customer.id);
    ok(res, { ...customer, balance });
  }),
);

customersRouter.get(
  '/:id/history',
  requirePermission('customer.read'),
  asyncHandler(async (req, res) => {
    ok(res, await service.customerHistory(param(req, 'id')));
  }),
);

customersRouter.post(
  '/',
  requirePermission('customer.create'),
  asyncHandler(async (req, res) => {
    created(res, await service.createCustomer(parseBody(customerBody, req.body)));
  }),
);

customersRouter.put(
  '/:id',
  requirePermission('customer.update'),
  asyncHandler(async (req, res) => {
    ok(res, await service.updateCustomer(param(req, 'id'), parseBody(customerBody.partial(), req.body)));
  }),
);

customersRouter.delete(
  '/:id',
  requirePermission('customer.delete'),
  asyncHandler(async (req, res) => {
    await service.deleteCustomer(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
