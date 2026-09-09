import { Prisma, type FinanceDirection, type PaymentMethod } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { scope } from '../../core/tenant';
import { OPEN_ACCOUNTS } from '../../core/constants';
import { money, toNumber } from '../../core/money';
import { dayjs, DEFAULT_TZ, monthRange } from '../../core/dates';
import { audit } from '../../core/audit';
import { notify } from '../notifications/notifications.service';
import { toSkipTake, type Pagination } from '../../core/pagination';

// ---------------------------------------------------------------- Categorias

export async function listCategories(direction?: FinanceDirection) {
  return prisma.financialCategory.findMany({
    where: { ...scope(), deletedAt: null, ...(direction ? { direction } : {}) },
    orderBy: { name: 'asc' },
  });
}

async function resolveCategoryId(name: string | undefined, direction: FinanceDirection): Promise<string | null> {
  if (!name?.trim()) return null;
  const companyId = currentCompanyId();
  const cat = await prisma.financialCategory.upsert({
    where: { companyId_name_direction: { companyId, name: name.trim(), direction } },
    update: {},
    create: { companyId, name: name.trim(), direction },
  });
  return cat.id;
}

// ---------------------------------------------------------------- Receita/Despesa

export interface EntryInput {
  amount: number;
  description: string;
  categoryName?: string;
  method?: PaymentMethod | null;
  date?: Date;
}

export async function createIncome(input: EntryInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  const companyId = currentCompanyId();
  const categoryId = await resolveCategoryId(input.categoryName, 'IN');
  const income = await prisma.income.create({
    data: {
      companyId,
      amount: money(input.amount),
      description: input.description,
      categoryId,
      method: input.method ?? null,
      receivedAt: input.date ?? new Date(),
      createdById: currentUserId(),
    },
    include: { category: true },
  });
  await audit({ action: 'income.create', entityType: 'Income', entityId: income.id, summary: `${input.description} ${input.amount}` });
  return income;
}

export async function createExpense(input: EntryInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  const companyId = currentCompanyId();
  const categoryId = await resolveCategoryId(input.categoryName, 'OUT');
  const expense = await prisma.expense.create({
    data: {
      companyId,
      amount: money(input.amount),
      description: input.description,
      categoryId,
      method: input.method ?? null,
      paidAt: input.date ?? new Date(),
      createdById: currentUserId(),
    },
    include: { category: true },
  });
  await audit({ action: 'expense.create', entityType: 'Expense', entityId: expense.id, summary: `${input.description} ${input.amount}` });
  return expense;
}

export async function listIncomes(p: Pagination & { from?: Date; to?: Date }) {
  const where: Prisma.IncomeWhereInput = {
    ...scope(),
    canceledAt: null,
    ...(p.from || p.to ? { receivedAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.income.findMany({ where, orderBy: { receivedAt: 'desc' }, include: { category: { select: { name: true } } }, ...toSkipTake(p) }),
    prisma.income.count({ where }),
  ]);
  return { items, total };
}

export async function listExpenses(p: Pagination & { from?: Date; to?: Date }) {
  const where: Prisma.ExpenseWhereInput = {
    ...scope(),
    canceledAt: null,
    ...(p.from || p.to ? { paidAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { paidAt: 'desc' }, include: { category: { select: { name: true } } }, ...toSkipTake(p) }),
    prisma.expense.count({ where }),
  ]);
  return { items, total };
}

// ---------------------------------------------------------------- Fluxo de caixa

export async function cashFlow(range: { from: Date; to: Date }) {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.income.aggregate({ _sum: { amount: true }, where: { ...scope(), canceledAt: null, receivedAt: { gte: range.from, lt: range.to } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { ...scope(), canceledAt: null, paidAt: { gte: range.from, lt: range.to } } }),
  ]);
  const income = toNumber(incomeAgg._sum.amount ?? 0);
  const expense = toNumber(expenseAgg._sum.amount ?? 0);
  return { income, expense, net: income - expense };
}

export async function monthRevenue(ref: Date = new Date(), tz = DEFAULT_TZ) {
  return cashFlow(monthRange(ref, tz));
}

/** Saldo acumulado (todas as entradas menos saidas). */
export async function balance() {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.income.aggregate({ _sum: { amount: true }, where: { ...scope(), canceledAt: null } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { ...scope(), canceledAt: null } }),
  ]);
  return toNumber(incomeAgg._sum.amount ?? 0) - toNumber(expenseAgg._sum.amount ?? 0);
}

// ---------------------------------------------------------------- Contas a receber

export interface ReceivableInput {
  customerId?: string | null;
  description: string;
  amount: number;
  dueDate?: Date | null;
}

export async function createReceivable(input: ReceivableInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  const r = await prisma.accountReceivable.create({
    data: {
      companyId: currentCompanyId(),
      customerId: input.customerId ?? null,
      description: input.description,
      amount: money(input.amount),
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
      createdById: currentUserId(),
    },
  });
  await audit({ action: 'receivable.create', entityType: 'AccountReceivable', entityId: r.id });
  return r;
}

export async function listReceivables(p: Pagination & { status?: string; customerId?: string }) {
  const where: Prisma.AccountReceivableWhereInput = {
    ...scope(),
    ...(p.status ? { status: p.status as never } : { status: { in: OPEN_ACCOUNTS } }),
    ...(p.customerId ? { customerId: p.customerId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.accountReceivable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { customer: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.accountReceivable.count({ where }),
  ]);
  return { items, total };
}

export async function totalReceivable(): Promise<{ total: number; overdue: number }> {
  const rows = await prisma.accountReceivable.findMany({
    where: { ...scope(), status: { in: OPEN_ACCOUNTS } },
    select: { amount: true, paidAmount: true, dueDate: true },
  });
  const now = new Date();
  let total = 0;
  let overdue = 0;
  for (const r of rows) {
    const open = toNumber(r.amount) - toNumber(r.paidAmount);
    total += open;
    if (r.dueDate && r.dueDate < now) overdue += open;
  }
  return { total, overdue };
}

export async function debtorsSummary() {
  const rows = await prisma.accountReceivable.findMany({
    where: { ...scope(), status: { in: OPEN_ACCOUNTS } },
    include: { customer: { select: { id: true, name: true } } },
  });
  const byCustomer = new Map<string, { customerId: string | null; name: string; total: number; count: number }>();
  for (const r of rows) {
    const key = r.customerId ?? 'sem-cliente';
    const open = toNumber(r.amount) - toNumber(r.paidAmount);
    const cur = byCustomer.get(key) ?? { customerId: r.customerId, name: r.customer?.name ?? 'Sem cliente', total: 0, count: 0 };
    cur.total += open;
    cur.count += 1;
    byCustomer.set(key, cur);
  }
  return [...byCustomer.values()].sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- Contas a pagar

export interface PayableInput {
  supplierId?: string | null;
  description: string;
  amount: number;
  dueDate?: Date | null;
}

export async function createPayable(input: PayableInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  const p = await prisma.accountPayable.create({
    data: {
      companyId: currentCompanyId(),
      supplierId: input.supplierId ?? null,
      description: input.description,
      amount: money(input.amount),
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
      createdById: currentUserId(),
    },
  });
  await audit({ action: 'payable.create', entityType: 'AccountPayable', entityId: p.id });
  return p;
}

export async function listPayables(p: Pagination & { status?: string }) {
  const where: Prisma.AccountPayableWhereInput = {
    ...scope(),
    ...(p.status ? { status: p.status as never } : { status: { in: OPEN_ACCOUNTS } }),
  };
  const [items, total] = await Promise.all([
    prisma.accountPayable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { supplier: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.accountPayable.count({ where }),
  ]);
  return { items, total };
}

export async function totalPayable(): Promise<{ total: number; overdue: number }> {
  const rows = await prisma.accountPayable.findMany({
    where: { ...scope(), status: { in: OPEN_ACCOUNTS } },
    select: { amount: true, paidAmount: true, dueDate: true },
  });
  const now = new Date();
  let total = 0;
  let overdue = 0;
  for (const r of rows) {
    const open = toNumber(r.amount) - toNumber(r.paidAmount);
    total += open;
    if (r.dueDate && r.dueDate < now) overdue += open;
  }
  return { total, overdue };
}

export async function findPayable(search: string) {
  return prisma.accountPayable.findMany({
    where: {
      ...scope(),
      status: { in: OPEN_ACCOUNTS },
      OR: [
        { description: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ],
    },
    orderBy: { dueDate: 'asc' },
    take: 6,
    include: { supplier: { select: { name: true } } },
  });
}

// ---------------------------------------------------------------- Pagamentos

export interface RegisterPaymentInput {
  amount: number;
  direction?: FinanceDirection; // IN = recebimento (padrao), OUT = pagamento a fornecedor
  accountReceivableId?: string;
  customerId?: string;
  accountPayableId?: string;
  method?: PaymentMethod | null;
  date?: Date;
}

export async function registerPayment(input: RegisterPaymentInput) {
  const direction = input.direction ?? (input.accountPayableId ? 'OUT' : 'IN');
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  return direction === 'OUT' ? payPayable(input) : receivePayment(input);
}

async function receivePayment(input: RegisterPaymentInput) {
  const companyId = currentCompanyId();
  let remaining = money(input.amount);

  const targets = input.accountReceivableId
    ? await prisma.accountReceivable.findMany({ where: { ...scope(), id: input.accountReceivableId } })
    : await prisma.accountReceivable.findMany({
        where: { ...scope(), status: { in: OPEN_ACCOUNTS }, ...(input.customerId ? { customerId: input.customerId } : {}) },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });
  if (targets.length === 0) throw new NotFoundError('Conta a receber em aberto');

  const applied: { id: string; description: string; applied: number; status: string }[] = [];

  await prisma.$transaction(async (tx) => {
    const category = await tx.financialCategory.findFirst({ where: { ...scope(), direction: 'IN', name: 'Vendas' } });
    for (const r of targets) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const open = money(toNumber(r.amount) - toNumber(r.paidAmount));
      const pay = remaining.greaterThanOrEqualTo(open) ? open : remaining;
      const newPaid = money(toNumber(r.paidAmount) + toNumber(pay));
      const status = newPaid.greaterThanOrEqualTo(r.amount) ? 'PAID' : 'PARTIAL';

      await tx.accountReceivable.update({ where: { id: r.id }, data: { paidAmount: newPaid, status } });

      if (r.saleId) {
        const sale = await tx.sale.findFirst({ where: { ...scope(), id: r.saleId } });
        if (sale) {
          const salePaid = money(toNumber(sale.paidAmount) + toNumber(pay));
          await tx.sale.update({
            where: { id: sale.id },
            data: { paidAmount: salePaid, status: salePaid.greaterThanOrEqualTo(sale.total) ? 'PAID' : 'PARTIAL' },
          });
        }
      }

      await tx.income.create({
        data: {
          companyId,
          amount: pay,
          description: `Recebimento: ${r.description}`,
          categoryId: category?.id ?? null,
          method: input.method ?? null,
          receivedAt: input.date ?? new Date(),
          accountReceivableId: r.id,
          createdById: currentUserId(),
        },
      });
      await tx.payment.create({
        data: {
          companyId,
          amount: pay,
          method: input.method ?? 'OTHER',
          direction: 'IN',
          paidAt: input.date ?? new Date(),
          accountReceivableId: r.id,
          createdById: currentUserId(),
        },
      });

      applied.push({ id: r.id, description: r.description, applied: toNumber(pay), status });
      remaining = money(toNumber(remaining) - toNumber(pay));
    }
  });

  await audit({ action: 'payment.register', entityType: 'Payment', summary: `Recebido ${input.amount}`, after: { applied } });
  await notify({ type: 'SYSTEM', title: 'Pagamento recebido', body: `R$ ${input.amount.toFixed(2)}` });
  return { direction: 'IN' as const, applied, leftover: toNumber(remaining) };
}

async function payPayable(input: RegisterPaymentInput) {
  const companyId = currentCompanyId();
  if (!input.accountPayableId) throw new ValidationError('accountPayableId obrigatorio para pagamento');
  const payable = await prisma.accountPayable.findFirst({ where: { ...scope(), id: input.accountPayableId } });
  if (!payable) throw new NotFoundError('Conta a pagar', input.accountPayableId);

  const open = money(toNumber(payable.amount) - toNumber(payable.paidAmount));
  const pay = money(input.amount);
  if (pay.lessThanOrEqualTo(0) || pay.greaterThan(open)) {
    throw new ValidationError(`Valor invalido. Em aberto: ${open.toNumber()}`);
  }
  const newPaid = money(toNumber(payable.paidAmount) + toNumber(pay));
  const status = newPaid.greaterThanOrEqualTo(payable.amount) ? 'PAID' : 'PARTIAL';

  await prisma.$transaction(async (tx) => {
    await tx.accountPayable.update({ where: { id: payable.id }, data: { paidAmount: newPaid, status } });
    const category = await tx.financialCategory.findFirst({ where: { ...scope(), direction: 'OUT', name: 'Fornecedores' } });
    await tx.expense.create({
      data: {
        companyId,
        amount: pay,
        description: `Pagamento: ${payable.description}`,
        categoryId: category?.id ?? null,
        method: input.method ?? null,
        paidAt: input.date ?? new Date(),
        accountPayableId: payable.id,
        createdById: currentUserId(),
      },
    });
    await tx.payment.create({
      data: {
        companyId,
        amount: pay,
        method: input.method ?? 'OTHER',
        direction: 'OUT',
        paidAt: input.date ?? new Date(),
        accountPayableId: payable.id,
        createdById: currentUserId(),
      },
    });
  });

  await audit({ action: 'payment.register', entityType: 'Payment', entityId: payable.id, summary: `Pago ${input.amount}` });
  return { direction: 'OUT' as const, payableId: payable.id, status };
}

// ---------------------------------------------------------------- Vencimentos

export async function overdueAccounts() {
  const now = new Date();
  const [receivables, payables] = await Promise.all([
    prisma.accountReceivable.findMany({
      where: { ...scope(), status: { in: OPEN_ACCOUNTS }, dueDate: { not: null, lt: now } },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountPayable.findMany({
      where: { ...scope(), status: { in: OPEN_ACCOUNTS }, dueDate: { not: null, lt: now } },
      include: { supplier: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);
  return {
    receivables: receivables.map((r) => ({
      id: r.id,
      description: r.description,
      customer: r.customer?.name ?? null,
      amount: toNumber(r.amount) - toNumber(r.paidAmount),
      dueDate: r.dueDate,
    })),
    payables: payables.map((p) => ({
      id: p.id,
      description: p.description,
      supplier: p.supplier?.name ?? null,
      amount: toNumber(p.amount) - toNumber(p.paidAmount),
      dueDate: p.dueDate,
    })),
  };
}

export async function dueUntil(date: Date) {
  const [payables, receivables] = await Promise.all([
    prisma.accountPayable.findMany({
      where: { ...scope(), status: { in: OPEN_ACCOUNTS }, dueDate: { not: null, lte: date } },
      include: { supplier: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountReceivable.findMany({
      where: { ...scope(), status: { in: OPEN_ACCOUNTS }, dueDate: { not: null, lte: date } },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);
  return {
    payables: payables.map((p) => ({
      id: p.id,
      description: p.description,
      supplier: p.supplier?.name ?? null,
      amount: toNumber(p.amount) - toNumber(p.paidAmount),
      dueDate: p.dueDate,
    })),
    receivables: receivables.map((r) => ({
      id: r.id,
      description: r.description,
      customer: r.customer?.name ?? null,
      amount: toNumber(r.amount) - toNumber(r.paidAmount),
      dueDate: r.dueDate,
    })),
  };
}

export { dayjs };
