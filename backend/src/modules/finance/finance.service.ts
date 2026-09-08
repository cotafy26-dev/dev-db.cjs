import { Prisma, type FinanceType, type PaymentMethod } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { scope, tenantWhere } from '../../core/tenant';
import { OPEN_SETTLEMENTS } from '../../core/constants';
import { money, toNumber } from '../../core/money';
import { dayjs, DEFAULT_TZ, monthRange } from '../../core/dates';
import { toSkipTake, type Pagination } from '../../core/pagination';

// ---------- Transacoes ----------

export interface TransactionInput {
  type: FinanceType;
  amount: number;
  description: string;
  categoryName?: string;
  paymentMethod?: PaymentMethod | null;
  occurredAt?: Date;
}

export async function createTransaction(input: TransactionInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  const companyId = currentCompanyId();

  let categoryId: string | null = null;
  if (input.categoryName) {
    const category = await prisma.financeCategory.upsert({
      where: {
        companyId_name_type: { companyId, name: input.categoryName, type: input.type },
      },
      update: {},
      create: { companyId, name: input.categoryName, type: input.type },
    });
    categoryId = category.id;
  }

  return prisma.financeTransaction.create({
    data: {
      companyId,
      type: input.type,
      amount: money(input.amount),
      description: input.description,
      categoryId,
      paymentMethod: input.paymentMethod ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      createdBy: currentUserId(),
    },
    include: { category: true },
  });
}

export async function listTransactions(
  p: Pagination & { type?: FinanceType; from?: Date; to?: Date },
) {
  const where = tenantWhere({
    ...(p.type ? { type: p.type } : {}),
    ...(p.from || p.to
      ? { occurredAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } }
      : {}),
  });
  const [items, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: { category: { select: { name: true } } },
      ...toSkipTake(p),
    }),
    prisma.financeTransaction.count({ where }),
  ]);
  return { items, total };
}

// ---------- Fluxo de caixa ----------

export async function cashFlow(range: { from: Date; to: Date }) {
  const rows = await prisma.financeTransaction.groupBy({
    by: ['type'],
    where: tenantWhere({ occurredAt: { gte: range.from, lt: range.to } }),
    _sum: { amount: true },
  });
  const income = toNumber(rows.find((r) => r.type === 'INCOME')?._sum.amount ?? 0);
  const expense = toNumber(rows.find((r) => r.type === 'EXPENSE')?._sum.amount ?? 0);
  return { income, expense, net: income - expense };
}

export async function monthRevenue(ref: Date = new Date(), tz = DEFAULT_TZ) {
  return cashFlow(monthRange(ref, tz));
}

// ---------- Categorias ----------

export async function listCategories() {
  return prisma.financeCategory.findMany({ where: tenantWhere(), orderBy: { name: 'asc' } });
}

// ---------- Recebiveis ----------

export interface ReceivableInput {
  customerId?: string | null;
  description: string;
  amount: number;
  dueDate?: Date | null;
}

export async function createReceivable(input: ReceivableInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  return prisma.receivable.create({
    data: {
      companyId: currentCompanyId(),
      customerId: input.customerId ?? null,
      description: input.description,
      amount: money(input.amount),
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
    },
  });
}

/** Registra pagamento recebido de um cliente. Abate do recebivel mais antigo se id nao informado. */
export async function receivePayment(input: {
  amount: number;
  receivableId?: string;
  customerId?: string;
  paymentMethod?: PaymentMethod | null;
  occurredAt?: Date;
}) {
  const companyId = currentCompanyId();
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  let remaining = money(input.amount);

  const targets = input.receivableId
    ? await prisma.receivable.findMany({ where: tenantWhere({ id: input.receivableId }) })
    : await prisma.receivable.findMany({
        where: tenantWhere({
          status: { in: OPEN_SETTLEMENTS },
          ...(input.customerId ? { customerId: input.customerId } : {}),
        }),
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

  if (targets.length === 0) throw new NotFoundError('Recebivel em aberto');

  const applied: { id: string; description: string; applied: number; status: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const r of targets) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const open = money(toNumber(r.amount) - toNumber(r.paidAmount));
      const pay = remaining.greaterThanOrEqualTo(open) ? open : remaining;
      const newPaid = money(toNumber(r.paidAmount) + toNumber(pay));
      const status = newPaid.greaterThanOrEqualTo(r.amount) ? 'PAID' : 'PARTIAL';

      await tx.receivable.update({
        where: { id: r.id },
        data: { paidAmount: newPaid, status },
      });

      if (r.saleId) {
        const sale = await tx.sale.findFirst({ where: tenantWhere({ id: r.saleId }) });
        if (sale) {
          const salePaid = money(toNumber(sale.paidAmount) + toNumber(pay));
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              paidAmount: salePaid,
              status: salePaid.greaterThanOrEqualTo(sale.total) ? 'PAID' : 'PARTIAL',
            },
          });
        }
      }

      const category = await tx.financeCategory.findFirst({
        where: tenantWhere({ type: 'INCOME', name: 'Vendas' }),
      });
      await tx.financeTransaction.create({
        data: {
          companyId,
          type: 'INCOME',
          amount: pay,
          description: `Recebimento: ${r.description}`,
          categoryId: category?.id ?? null,
          paymentMethod: input.paymentMethod ?? null,
          occurredAt: input.occurredAt ?? new Date(),
          receivableId: r.id,
          createdBy: currentUserId(),
        },
      });

      applied.push({ id: r.id, description: r.description, applied: toNumber(pay), status });
      remaining = money(toNumber(remaining) - toNumber(pay));
    }
  });

  return { applied, unappliedChange: toNumber(remaining) };
}

export async function listReceivables(p: Pagination & { status?: string; customerId?: string }) {
  const where = tenantWhere({
    ...(p.status ? { status: p.status as never } : { status: { in: OPEN_SETTLEMENTS } }),
    ...(p.customerId ? { customerId: p.customerId } : {}),
  });
  const [items, total] = await Promise.all([
    prisma.receivable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { customer: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.receivable.count({ where }),
  ]);
  return { items, total };
}

export async function totalReceivable(): Promise<number> {
  const rows = await prisma.receivable.findMany({
    where: tenantWhere({ status: { in: OPEN_SETTLEMENTS } }),
    select: { amount: true, paidAmount: true },
  });
  return rows.reduce((a, r) => a + (toNumber(r.amount) - toNumber(r.paidAmount)), 0);
}

/** Quem esta devendo: recebiveis em aberto agrupados por cliente. */
export async function debtorsSummary() {
  const rows = await prisma.receivable.findMany({
    where: tenantWhere({ status: { in: OPEN_SETTLEMENTS } }),
    include: { customer: { select: { id: true, name: true } } },
  });
  const byCustomer = new Map<string, { customerId: string | null; name: string; total: number; count: number }>();
  for (const r of rows) {
    const key = r.customerId ?? 'sem-cliente';
    const open = toNumber(r.amount) - toNumber(r.paidAmount);
    const cur = byCustomer.get(key) ?? {
      customerId: r.customerId,
      name: r.customer?.name ?? 'Sem cliente',
      total: 0,
      count: 0,
    };
    cur.total += open;
    cur.count += 1;
    byCustomer.set(key, cur);
  }
  return [...byCustomer.values()].sort((a, b) => b.total - a.total);
}

// ---------- Contas a pagar ----------

export interface PayableInput {
  supplierName?: string | null;
  description: string;
  amount: number;
  dueDate?: Date | null;
}

export async function createPayable(input: PayableInput) {
  if (input.amount <= 0) throw new ValidationError('Valor deve ser positivo');
  return prisma.payable.create({
    data: {
      companyId: currentCompanyId(),
      supplierName: input.supplierName ?? null,
      description: input.description,
      amount: money(input.amount),
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
    },
  });
}

/** Localiza uma unica conta a pagar em aberto por trecho da descricao/fornecedor. */
export async function findPayableForPayment(search: string) {
  const where: Prisma.PayableWhereInput = {
    ...scope(),
    status: { in: OPEN_SETTLEMENTS },
    OR: [
      { description: { contains: search, mode: 'insensitive' } },
      { supplierName: { contains: search, mode: 'insensitive' } },
    ],
  };
  const rows = await prisma.payable.findMany({ where, orderBy: { dueDate: 'asc' }, take: 6 });
  return rows;
}

export async function payBill(input: {
  payableId: string;
  amount?: number;
  paymentMethod?: PaymentMethod | null;
  occurredAt?: Date;
}) {
  const companyId = currentCompanyId();
  const payable = await prisma.payable.findFirst({ where: tenantWhere({ id: input.payableId }) });
  if (!payable) throw new NotFoundError('Conta a pagar', input.payableId);

  const open = money(toNumber(payable.amount) - toNumber(payable.paidAmount));
  const pay = input.amount != null ? money(input.amount) : open;
  if (pay.lessThanOrEqualTo(0) || pay.greaterThan(open)) {
    throw new ValidationError(`Valor invalido. Em aberto: ${open.toNumber()}`);
  }
  const newPaid = money(toNumber(payable.paidAmount) + toNumber(pay));
  const status = newPaid.greaterThanOrEqualTo(payable.amount) ? 'PAID' : 'PARTIAL';

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payable.update({
      where: { id: payable.id },
      data: { paidAmount: newPaid, status },
    });
    const category = await tx.financeCategory.findFirst({
      where: tenantWhere({ type: 'EXPENSE', name: 'Fornecedores' }),
    });
    await tx.financeTransaction.create({
      data: {
        companyId,
        type: 'EXPENSE',
        amount: pay,
        description: `Pagamento: ${payable.description}`,
        categoryId: category?.id ?? null,
        paymentMethod: input.paymentMethod ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        payableId: payable.id,
        createdBy: currentUserId(),
      },
    });
    return updated;
  });
}

export async function listPayables(p: Pagination & { status?: string }) {
  const where = tenantWhere(
    p.status ? { status: p.status as never } : { status: { in: OPEN_SETTLEMENTS } },
  );
  const [items, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      ...toSkipTake(p),
    }),
    prisma.payable.count({ where }),
  ]);
  return { items, total };
}

/** Contas (a pagar e a receber) que vencem ate a data informada. */
export async function dueUntil(date: Date) {
  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({
      where: tenantWhere({ status: { in: OPEN_SETTLEMENTS }, dueDate: { not: null, lte: date } }),
      orderBy: { dueDate: 'asc' },
    }),
    prisma.receivable.findMany({
      where: tenantWhere({ status: { in: OPEN_SETTLEMENTS }, dueDate: { not: null, lte: date } }),
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);
  return {
    payables: payables.map((p) => ({
      id: p.id,
      description: p.description,
      supplier: p.supplierName,
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

export async function totalPayable(): Promise<number> {
  const rows = await prisma.payable.findMany({
    where: tenantWhere({ status: { in: OPEN_SETTLEMENTS } }),
    select: { amount: true, paidAmount: true },
  });
  return rows.reduce((a, r) => a + (toNumber(r.amount) - toNumber(r.paidAmount)), 0);
}

export { dayjs };
