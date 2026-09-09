import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { scope, tenantData } from '../../core/tenant';
import { audit } from '../../core/audit';

export async function listCategories() {
  return prisma.productCategory.findMany({
    where: { ...scope(), deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
}

export async function createCategory(name: string) {
  const cat = await prisma.productCategory.create({ data: tenantData({ name }) });
  await audit({ action: 'category.create', entityType: 'ProductCategory', entityId: cat.id, summary: name });
  return cat;
}

export async function updateCategory(id: string, name: string) {
  const found = await prisma.productCategory.findFirst({ where: { ...scope(), id, deletedAt: null } });
  if (!found) throw new NotFoundError('Categoria', id);
  return prisma.productCategory.update({ where: { id }, data: { name } });
}

export async function deleteCategory(id: string) {
  const found = await prisma.productCategory.findFirst({ where: { ...scope(), id, deletedAt: null } });
  if (!found) throw new NotFoundError('Categoria', id);
  await prisma.productCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: 'category.delete', entityType: 'ProductCategory', entityId: id });
}

export async function resolveCategoryId(name?: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const existing = await prisma.productCategory.findFirst({
    where: { ...scope(), deletedAt: null, name: { equals: name.trim(), mode: 'insensitive' } },
  });
  if (existing) return existing.id;
  const created = await createCategory(name.trim());
  return created.id;
}
