import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData } from '../../core/tenant';
import { OPEN_ACCOUNTS } from '../../core/constants';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { toNumber } from '../../core/money';

export interface CustomerInput {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  document?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
}

export async function listCustomers(p: Pagination) {
  const where: Prisma.CustomerWhereInput = {
    ...scope(),
    deletedAt: null,
    ...(p.search
      ? {
          OR: [
            { name: { contains: p.search, mode: 'insensitive' } },
            { phone: { contains: p.search } },
            { whatsapp: { contains: p.search } },
            { email: { contains: p.search, mode: 'insensitive' } },
            { document: { contains: p.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(p) }),
    prisma.customer.count({ where }),
  ]);
  return { items, total };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findFirst({ where: { ...scope(), id, deletedAt: null } });
  if (!customer) throw new NotFoundError('Cliente', id);
  return customer;
}

export async function createCustomer(input: CustomerInput) {
  const customer = await prisma.customer.create({ data: tenantData(input) });
  await audit({ action: 'customer.create', entityType: 'Customer', entityId: customer.id, summary: customer.name, after: input });
  return customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const before = await getCustomer(id);
  const customer = await prisma.customer.update({ where: { id }, data: input });
  await audit({ action: 'customer.update', entityType: 'Customer', entityId: id, summary: customer.name, before, after: input });
  return customer;
}

/** Exclusao logica (secao 44 - LGPD / secao 8 "excluir/desativar"). */
export async function deleteCustomer(id: string) {
  const before = await getCustomer(id);
  await prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ action: 'customer.delete', entityType: 'Customer', entityId: id, summary: before.name, before });
}

export async function findCustomerByName(name: string) {
  const term = name.trim();
  const exact = await prisma.customer.findFirst({
    where: { ...scope(), deletedAt: null, name: { equals: term, mode: 'insensitive' } },
  });
  if (exact) return { match: exact as typeof exact };

  const partial = await prisma.customer.findMany({
    where: { ...scope(), deletedAt: null, name: { contains: term, mode: 'insensitive' } },
    take: 6,
    orderBy: { name: 'asc' },
  });
  if (partial.length === 1) return { match: partial[0]! };
  return { match: null, candidates: partial.map((c) => ({ id: c.id, name: c.name })) };
}

/** Saldo devedor (contas a receber em aberto). */
export async function customerBalance(customerId: string): Promise<number> {
  const rows = await prisma.accountReceivable.findMany({
    where: { ...scope(), customerId, status: { in: OPEN_ACCOUNTS } },
    select: { amount: true, paidAmount: true },
  });
  return rows.reduce((acc, r) => acc + (toNumber(r.amount) - toNumber(r.paidAmount)), 0);
}

/** Historico do cliente: compras, contas a receber e pagamentos (tool customer_history). */
export async function customerHistory(customerId: string) {
  const customer = await getCustomer(customerId);
  const [sales, receivables, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { ...scope(), customerId },
      orderBy: { soldAt: 'desc' },
      take: 20,
      select: { id: true, number: true, total: true, status: true, soldAt: true },
    }),
    prisma.accountReceivable.findMany({
      where: { ...scope(), customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, description: true, amount: true, paidAmount: true, status: true, dueDate: true },
    }),
    prisma.payment.findMany({
      where: { ...scope(), direction: 'IN', accountReceivable: { customerId } },
      orderBy: { paidAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, method: true, paidAt: true },
    }),
  ]);

  const balance = await customerBalance(customerId);
  return {
    customer: { id: customer.id, name: customer.name, phone: customer.phone, whatsapp: customer.whatsapp },
    balance,
    totalPurchases: sales.reduce((a, s) => a + toNumber(s.total), 0),
    sales,
    receivables,
    payments,
  };
}
