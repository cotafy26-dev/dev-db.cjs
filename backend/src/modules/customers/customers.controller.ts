import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import * as service from './customers.service';

export const customersRouter = Router();

const customerBody = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).nullish(),
  email: z.string().email().max(160).nullish(),
  document: z.string().max(20).nullish(),
  notes: z.string().max(2000).nullish(),
});

customersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema, req.query);
    const { items, total } = await service.listCustomers(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await service.getCustomer(param(req, 'id'));
    const balance = await service.customerBalance(customer.id);
    ok(res, { ...customer, balance });
  }),
);

customersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseBody(customerBody, req.body);
    created(res, await service.createCustomer(input));
  }),
);

customersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = parseBody(customerBody.partial(), req.body);
    ok(res, await service.updateCustomer(param(req, 'id'), input));
  }),
);

customersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteCustomer(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
