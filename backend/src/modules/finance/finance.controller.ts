import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { parseNaturalDate, monthRange } from '../../core/dates';
import * as service from './finance.service';

export const financeRouter = Router();

const paymentMethod = z
  .enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'TRANSFER', 'BOLETO', 'OTHER'])
  .nullish();

// ----- Transacoes -----
financeRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({
        type: z.enum(['INCOME', 'EXPENSE']).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      req.query,
    );
    const { items, total } = await service.listTransactions({
      ...p,
      from: p.from ? parseNaturalDate(p.from) ?? undefined : undefined,
      to: p.to ? parseNaturalDate(p.to) ?? undefined : undefined,
    });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

financeRouter.post(
  '/transactions',
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        type: z.enum(['INCOME', 'EXPENSE']),
        amount: z.number().positive(),
        description: z.string().min(1).max(240),
        categoryName: z.string().max(60).optional(),
        paymentMethod,
        occurredAt: z.coerce.date().optional(),
      }),
      req.body,
    );
    created(res, await service.createTransaction(input));
  }),
);

financeRouter.get(
  '/cashflow',
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ month: z.string().optional() }), req.query);
    const ref = q.month ? parseNaturalDate(q.month) ?? new Date() : new Date();
    ok(res, { ...(await service.cashFlow(monthRange(ref))), month: ref });
  }),
);

financeRouter.get('/categories', asyncHandler(async (_req, res) => ok(res, await service.listCategories())));

// ----- Recebiveis -----
financeRouter.get(
  '/receivables',
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({ status: z.string().optional(), customerId: z.string().optional() }),
      req.query,
    );
    const { items, total } = await service.listReceivables(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

financeRouter.get('/receivables/total', asyncHandler(async (_req, res) => ok(res, { total: await service.totalReceivable() })));
financeRouter.get('/debtors', asyncHandler(async (_req, res) => ok(res, await service.debtorsSummary())));

financeRouter.post(
  '/receivables',
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        customerId: z.string().nullish(),
        description: z.string().min(1).max(240),
        amount: z.number().positive(),
        dueDate: z.coerce.date().nullish(),
      }),
      req.body,
    );
    created(res, await service.createReceivable(input));
  }),
);

financeRouter.post(
  '/receivables/receive',
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        amount: z.number().positive(),
        receivableId: z.string().optional(),
        customerId: z.string().optional(),
        paymentMethod,
        occurredAt: z.coerce.date().optional(),
      }),
      req.body,
    );
    ok(res, await service.receivePayment(input));
  }),
);

// ----- Contas a pagar -----
financeRouter.get(
  '/payables',
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ status: z.string().optional() }), req.query);
    const { items, total } = await service.listPayables(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);

financeRouter.get('/payables/total', asyncHandler(async (_req, res) => ok(res, { total: await service.totalPayable() })));

financeRouter.post(
  '/payables',
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        supplierName: z.string().max(120).nullish(),
        description: z.string().min(1).max(240),
        amount: z.number().positive(),
        dueDate: z.coerce.date().nullish(),
      }),
      req.body,
    );
    created(res, await service.createPayable(input));
  }),
);

financeRouter.post(
  '/payables/pay',
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        payableId: z.string().min(1),
        amount: z.number().positive().optional(),
        paymentMethod,
        occurredAt: z.coerce.date().optional(),
      }),
      req.body,
    );
    ok(res, await service.payBill(input));
  }),
);

financeRouter.get(
  '/due',
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ until: z.string().optional() }), req.query);
    const date = q.until ? parseNaturalDate(q.until) ?? new Date() : new Date();
    ok(res, await service.dueUntil(date));
  }),
);
