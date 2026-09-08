import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData, tenantWhere } from '../../core/tenant';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { money, qty } from '../../core/money';

export interface ProductInput {
  name: string;
  sku?: string | null;
  description?: string | null;
  price: number;
  cost?: number | null;
  stock?: number;
  minStock?: number;
  unit?: string;
  active?: boolean;
}

export async function listProducts(p: Pagination & { lowStock?: boolean }) {
  const where: Prisma.ProductWhereInput = {
    ...scope(),
    ...(p.search
      ? {
          OR: [
            { name: { contains: p.search, mode: 'insensitive' } },
            { sku: { contains: p.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(p) }),
    prisma.product.count({ where }),
  ]);
  const filtered = p.lowStock
    ? items.filter((i) => i.stock.lessThanOrEqualTo(i.minStock))
    : items;
  return { items: filtered, total };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({ where: tenantWhere({ id }) });
  if (!product) throw new NotFoundError('Produto', id);
  return product;
}

export async function createProduct(input: ProductInput) {
  return prisma.product.create({
    data: tenantData({
      name: input.name,
      sku: input.sku ?? null,
      description: input.description ?? null,
      price: money(input.price),
      cost: input.cost != null ? money(input.cost) : null,
      stock: qty(input.stock ?? 0),
      minStock: qty(input.minStock ?? 0),
      unit: input.unit ?? 'un',
      active: input.active ?? true,
    }),
  });
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  await getProduct(id);
  return prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: money(input.price) } : {}),
      ...(input.cost !== undefined ? { cost: input.cost != null ? money(input.cost) : null } : {}),
      ...(input.minStock !== undefined ? { minStock: qty(input.minStock) } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteProduct(id: string) {
  await getProduct(id);
  await prisma.product.delete({ where: { id } });
}

export async function findProductByName(name: string) {
  const term = name.trim();
  const exact = await prisma.product.findFirst({
    where: tenantWhere({ name: { equals: term, mode: 'insensitive' as const }, active: true }),
  });
  if (exact) return { match: exact as typeof exact };

  const partial = await prisma.product.findMany({
    where: tenantWhere({ name: { contains: term, mode: 'insensitive' as const }, active: true }),
    take: 6,
    orderBy: { name: 'asc' },
  });
  if (partial.length === 1) return { match: partial[0]! };
  return { match: null, candidates: partial.map((x) => ({ id: x.id, name: x.name, price: x.price.toNumber() })) };
}

export async function lowStockProducts() {
  const items = await prisma.product.findMany({
    where: tenantWhere({ active: true }),
    orderBy: { name: 'asc' },
  });
  return items
    .filter((i) => i.stock.lessThanOrEqualTo(i.minStock))
    .map((i) => ({
      id: i.id,
      name: i.name,
      stock: i.stock.toNumber(),
      minStock: i.minStock.toNumber(),
      unit: i.unit,
    }));
}
