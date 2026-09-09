import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, paginated, param, parseBody } from '../../core/http';
import { paginationSchema } from '../../core/pagination';
import { parseNaturalDate, monthRange } from '../../core/dates';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './finance.service';

export const financeRouter = Router();

const method = z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BOLETO', 'TRANSFER', 'OTHER']).nullish();
const entryBody = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(240),
  categoryName: z.string().max(80).optional(),
  method,
  date: z.coerce.date().optional(),
});
const dateRangeQuery = paginationSchema.extend({ from: z.string().optional(), to: z.string().optional() });
const range = (p: { from?: string; to?: string }) => ({
  from: p.from ? parseNaturalDate(p.from) ?? undefined : undefined,
  to: p.to ? parseNaturalDate(p.to) ?? undefined : undefined,
});

// ----- Receitas / Despesas -----
financeRouter.get(
  '/incomes',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(dateRangeQuery, req.query);
    const { items, total } = await service.listIncomes({ ...p, ...range(p) });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);
financeRouter.post(
  '/incomes',
  requirePermission('finance.create'),
  asyncHandler(async (req, res) => created(res, await service.createIncome(parseBody(entryBody, req.body)))),
);
financeRouter.get(
  '/expenses',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(dateRangeQuery, req.query);
    const { items, total } = await service.listExpenses({ ...p, ...range(p) });
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);
financeRouter.post(
  '/expenses',
  requirePermission('finance.create'),
  asyncHandler(async (req, res) => created(res, await service.createExpense(parseBody(entryBody, req.body)))),
);

// ----- Fluxo de caixa / saldo -----
financeRouter.get(
  '/cashflow',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ month: z.string().optional() }), req.query);
    const ref = q.month ? parseNaturalDate(q.month) ?? new Date() : new Date();
    ok(res, { ...(await service.cashFlow(monthRange(ref))), month: ref });
  }),
);
financeRouter.get(
  '/balance',
  requirePermission('finance.read'),
  asyncHandler(async (_req, res) => ok(res, { balance: await service.balance() })),
);
financeRouter.get(
  '/categories',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ direction: z.enum(['IN', 'OUT']).optional() }), req.query);
    ok(res, await service.listCategories(q.direction));
  }),
);

// ----- Contas a receber -----
financeRouter.get(
  '/receivables',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({ status: z.string().optional(), customerId: z.string().optional() }),
      req.query,
    );
    const { items, total } = await service.listReceivables(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);
financeRouter.get(
  '/receivables/total',
  requirePermission('finance.read'),
  asyncHandler(async (_req, res) => ok(res, await service.totalReceivable())),
);
financeRouter.get(
  '/debtors',
  requirePermission('finance.read'),
  asyncHandler(async (_req, res) => ok(res, await service.debtorsSummary())),
);
financeRouter.post(
  '/receivables',
  requirePermission('finance.create'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        customerId: z.string().nullish(),
        description: z.string().min(1).max(240),
        amount: z.number().positive(),
        dueDate: z.coerce.date().nullish(),
      }),
      req.body,
    );
    created(res, await service.createReceivable(body));
  }),
);

// ----- Contas a pagar -----
financeRouter.get(
  '/payables',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(paginationSchema.extend({ status: z.string().optional() }), req.query);
    const { items, total } = await service.listPayables(p);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);
financeRouter.get(
  '/payables/total',
  requirePermission('finance.read'),
  asyncHandler(async (_req, res) => ok(res, await service.totalPayable())),
);
financeRouter.post(
  '/payables',
  requirePermission('finance.create'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        supplierId: z.string().nullish(),
        description: z.string().min(1).max(240),
        amount: z.number().positive(),
        dueDate: z.coerce.date().nullish(),
      }),
      req.body,
    );
    created(res, await service.createPayable(body));
  }),
);

// ----- Pagamentos -----
financeRouter.post(
  '/payments',
  requirePermission('finance.manage'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        amount: z.number().positive(),
        direction: z.enum(['IN', 'OUT']).optional(),
        accountReceivableId: z.string().optional(),
        customerId: z.string().optional(),
        accountPayableId: z.string().optional(),
        method,
        date: z.coerce.date().optional(),
      }),
      req.body,
    );
    ok(res, await service.registerPayment(body));
  }),
);

// ----- Vencimentos -----
financeRouter.get(
  '/overdue',
  requirePermission('finance.read'),
  asyncHandler(async (_req, res) => ok(res, await service.overdueAccounts())),
);
financeRouter.get(
  '/due',
  requirePermission('finance.read'),
  asyncHandler(async (req, res) => {
    const q = parseBody(z.object({ until: z.string().optional() }), req.query);
    const date = q.until ? parseNaturalDate(q.until) ?? new Date() : new Date();
    ok(res, await service.dueUntil(date));
  }),
);
