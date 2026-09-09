import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData } from '../../core/tenant';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { money, qty } from '../../core/money';
import { resolveCategoryId } from './categories.service';

export interface ProductInput {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  supplierId?: string | null;
  price: number;
  cost?: number | null;
  unit?: string;
  stock?: number;
  minStock?: number;
  active?: boolean;
}

const withInventory = { inventory: true } as const;

export async function listProducts(p: Pagination & { categoryId?: string; lowStock?: boolean }) {
  const where: Prisma.ProductWhereInput = {
    ...scope(),
    deletedAt: null,
    ...(p.categoryId ? { categoryId: p.categoryId } : {}),
    ...(p.search
      ? {
          OR: [
            { name: { contains: p.search, mode: 'insensitive' } },
            { sku: { contains: p.search, mode: 'insensitive' } },
            { barcode: { contains: p.search } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { ...withInventory, category: { select: { name: true } } },
      ...toSkipTake(p),
    }),
    prisma.product.count({ where }),
  ]);
  const items = p.lowStock
    ? rows.filter((r) => r.inventory && r.inventory.quantity.lessThanOrEqualTo(r.inventory.minQuantity))
    : rows;
  return { items, total };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { ...scope(), id, deletedAt: null },
    include: { ...withInventory, category: true, supplier: true },
  });
  if (!product) throw new NotFoundError('Produto', id);
  return product;
}

export async function createProduct(input: ProductInput) {
  const categoryId = input.categoryId ?? (await resolveCategoryId(input.categoryName));
  const product = await prisma.product.create({
    data: tenantData({
      name: input.name,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      description: input.description ?? null,
      categoryId,
      supplierId: input.supplierId ?? null,
      price: money(input.price),
      cost: input.cost != null ? money(input.cost) : null,
      unit: input.unit ?? 'un',
      active: input.active ?? true,
      inventory: {
        create: {
          companyId: scope().companyId,
          quantity: qty(input.stock ?? 0),
          minQuantity: qty(input.minStock ?? 0),
        },
      },
    }),
    include: withInventory,
  });
  await audit({ action: 'product.create', entityType: 'Product', entityId: product.id, summary: product.name });
  return product;
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  await getProduct(id);
  const categoryId =
    input.categoryId !== undefined
      ? input.categoryId
      : input.categoryName
        ? await resolveCategoryId(input.categoryName)
        : undefined;

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.price !== undefined ? { price: money(input.price) } : {}),
      ...(input.cost !== undefined ? { cost: input.cost != null ? money(input.cost) : null } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.minStock !== undefined
        ? { inventory: { update: { minQuantity: qty(input.minStock) } } }
        : {}),
    },
    include: withInventory,
  });
  await audit({ action: 'product.update', entityType: 'Product', entityId: id, after: input });
  return product;
}

export async function deleteProduct(id: string) {
  await getProduct(id);
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ action: 'product.delete', entityType: 'Product', entityId: id });
}

export async function findProductByName(name: string) {
  const term = name.trim();
  const exact = await prisma.product.findFirst({
    where: { ...scope(), deletedAt: null, active: true, name: { equals: term, mode: 'insensitive' } },
    include: withInventory,
  });
  if (exact) return { match: exact as typeof exact };

  const partial = await prisma.product.findMany({
    where: {
      ...scope(),
      deletedAt: null,
      active: true,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { barcode: term },
        { sku: { equals: term, mode: 'insensitive' } },
      ],
    },
    take: 6,
    orderBy: { name: 'asc' },
    include: withInventory,
  });
  if (partial.length === 1) return { match: partial[0]! };
  return {
    match: null,
    candidates: partial.map((x) => ({ id: x.id, name: x.name, price: x.price.toNumber() })),
  };
}

export async function lowStockProducts() {
  const rows = await prisma.product.findMany({
    where: { ...scope(), deletedAt: null, active: true },
    include: withInventory,
    orderBy: { name: 'asc' },
  });
  return rows
    .filter((r) => r.inventory && r.inventory.quantity.lessThanOrEqualTo(r.inventory.minQuantity))
    .map((r) => ({
      id: r.id,
      name: r.name,
      stock: r.inventory!.quantity.toNumber(),
      minStock: r.inventory!.minQuantity.toNumber(),
      unit: r.unit,
    }));
}
