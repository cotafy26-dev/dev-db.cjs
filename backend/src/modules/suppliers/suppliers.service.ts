import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData } from '../../core/tenant';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';

export interface SupplierInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  addressLine?: string | null;
  notes?: string | null;
}

export async function listSuppliers(p: Pagination) {
  const where: Prisma.SupplierWhereInput = {
    ...scope(),
    deletedAt: null,
    ...(p.search
      ? { OR: [{ name: { contains: p.search, mode: 'insensitive' } }, { document: { contains: p.search } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(p) }),
    prisma.supplier.count({ where }),
  ]);
  return { items, total };
}

export async function getSupplier(id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { ...scope(), id, deletedAt: null } });
  if (!supplier) throw new NotFoundError('Fornecedor', id);
  return supplier;
}

export async function createSupplier(input: SupplierInput) {
  const supplier = await prisma.supplier.create({ data: tenantData(input) });
  await audit({ action: 'supplier.create', entityType: 'Supplier', entityId: supplier.id, summary: supplier.name });
  return supplier;
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>) {
  await getSupplier(id);
  const supplier = await prisma.supplier.update({ where: { id }, data: input });
  await audit({ action: 'supplier.update', entityType: 'Supplier', entityId: id, after: input });
  return supplier;
}

export async function deleteSupplier(id: string) {
  await getSupplier(id);
  await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ action: 'supplier.delete', entityType: 'Supplier', entityId: id });
}

export async function findSupplierByName(name: string) {
  const term = name.trim();
  const exact = await prisma.supplier.findFirst({
    where: { ...scope(), deletedAt: null, name: { equals: term, mode: 'insensitive' } },
  });
  if (exact) return exact;
  return prisma.supplier.findFirst({
    where: { ...scope(), deletedAt: null, name: { contains: term, mode: 'insensitive' } },
  });
}
