import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData, tenantWhere } from '../../core/tenant';
import { OPEN_SETTLEMENTS } from '../../core/constants';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { toNumber } from '../../core/money';

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  notes?: string | null;
}

export async function listCustomers(p: Pagination) {
  const where: Prisma.CustomerWhereInput = {
    ...scope(),
    ...(p.search
      ? {
          OR: [
            { name: { contains: p.search, mode: 'insensitive' } },
            { phone: { contains: p.search } },
            { email: { contains: p.search, mode: 'insensitive' } },
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
  const customer = await prisma.customer.findFirst({ where: tenantWhere({ id }) });
  if (!customer) throw new NotFoundError('Cliente', id);
  return customer;
}

export async function createCustomer(input: CustomerInput) {
  return prisma.customer.create({ data: tenantData(input) });
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  await getCustomer(id);
  return prisma.customer.update({ where: { id }, data: input });
}

export async function deleteCustomer(id: string) {
  await getCustomer(id);
  await prisma.customer.delete({ where: { id } });
}

/**
 * Encontra um cliente pelo nome (usado pela IA). Retorna match exato ou unico
 * parcial; se ambiguo, retorna a lista de candidatos para desambiguacao.
 */
export async function findCustomerByName(name: string): Promise<
  | { match: NonNullable<Awaited<ReturnType<typeof getCustomer>>>; candidates?: undefined }
  | { match: null; candidates: { id: string; name: string }[] }
> {
  const term = name.trim();
  const exact = await prisma.customer.findFirst({
    where: tenantWhere({ name: { equals: term, mode: 'insensitive' as const } }),
  });
  if (exact) return { match: exact };

  const partial = await prisma.customer.findMany({
    where: tenantWhere({ name: { contains: term, mode: 'insensitive' as const } }),
    take: 6,
    orderBy: { name: 'asc' },
  });
  if (partial.length === 1) return { match: partial[0]! };
  return { match: null, candidates: partial.map((c) => ({ id: c.id, name: c.name })) };
}

/** Saldo devedor de um cliente (soma de recebiveis em aberto). */
export async function customerBalance(customerId: string): Promise<number> {
  const rows = await prisma.receivable.findMany({
    where: tenantWhere({ customerId, status: { in: OPEN_SETTLEMENTS } }),
    select: { amount: true, paidAmount: true },
  });
  return rows.reduce((acc, r) => acc + (toNumber(r.amount) - toNumber(r.paidAmount)), 0);
}
