import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { parseNaturalDate } from '../../core/dates';
import * as service from './sales.service';

export const salesRouter = Router();

const saleItemBody = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().max(200).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
});

const createSaleBody = z.object({
  items: z.array(saleItemBody).min(1),
  customerId: z.string().min(1).nullish(),
  paymentMethod: z
    .enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'TRANSFER', 'BOLETO', 'OTHER'])
    .nullish(),
  discount: z.number().nonnegative().optional(),
  status: z.enum(['PAID', 'PENDING', 'PARTIAL']).optional(),
  paidAmount: z.number().nonnegative().optional(),
  note: z.string().max(500).nullish(),
  soldAt: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullish(),
});

salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({
        from: z.string().optional(),
        to: z.string().optional(),
        customerId: z.string().optional(),
      }),
      req.query,
    );
    const { items, total } = await service.listSales({
      ...p,
      from: p.from ? parseNaturalDate(p.from) ?? undefined : undefined,
      to: p.to ? parseNaturalDate(p.to) ?? undefined : undefined,
    });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

salesRouter.get(
  '/summary/today',
  asyncHandler(async (_req, res) => {
    ok(res, await service.salesToday());
  }),
);

salesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    ok(res, await service.getSale(param(req, 'id')));
  }),
);

salesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseBody(createSaleBody, req.body);
    created(res, await service.createSale(input));
  }),
);
