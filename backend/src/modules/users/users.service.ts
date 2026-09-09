import type { UserRole } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { audit } from '../../core/audit';
import { hashPassword } from '../auth/password';
import { getPlanByCode } from '../plans/plans.service';

const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    where: { companyId: currentCompanyId(), deletedAt: null },
    select: publicFields,
    orderBy: { createdAt: 'asc' },
  });
}

async function assertSeatAvailable() {
  const companyId = currentCompanyId();
  const [company, count] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, include: { subscription: { include: { plan: true } } } }),
    prisma.user.count({ where: { companyId, deletedAt: null, active: true } }),
  ]);
  const max = company?.subscription?.plan?.maxUsers ?? (await getPlanByCode('BASIC'))?.maxUsers ?? 3;
  if (count >= max) throw new ValidationError(`Limite de ${max} usuarios do plano atingido.`);
}

export async function createUser(input: { name: string; email: string; password: string; role: UserRole }) {
  const companyId = currentCompanyId();
  await assertSeatAvailable();
  const exists = await prisma.user.findFirst({ where: { email: input.email } });
  if (exists) throw new ConflictError('E-mail ja cadastrado');

  const roleRef = await prisma.role.findUnique({ where: { companyId_key: { companyId, key: input.role } } });
  const user = await prisma.user.create({
    data: {
      companyId,
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      roleRefId: roleRef?.id,
    },
    select: publicFields,
  });
  await audit({ action: 'user.create', entityType: 'User', entityId: user.id, summary: `${user.email} (${user.role})` });
  return user;
}

export async function updateUser(id: string, input: { name?: string; role?: UserRole; active?: boolean; password?: string }) {
  const companyId = currentCompanyId();
  const target = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!target) throw new NotFoundError('Usuario', id);

  const roleRef = input.role
    ? await prisma.role.findUnique({ where: { companyId_key: { companyId, key: input.role } } })
    : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role, roleRefId: roleRef?.id ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select: publicFields,
  });
  await audit({ action: 'user.update', entityType: 'User', entityId: id, after: { role: input.role, active: input.active } });
  return user;
}

export async function deleteUser(id: string) {
  const companyId = currentCompanyId();
  if (id === currentUserId()) throw new ValidationError('Voce nao pode remover a si mesmo');
  const target = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!target) throw new NotFoundError('Usuario', id);
  if (target.role === 'ADMIN') {
    const admins = await prisma.user.count({ where: { companyId, role: 'ADMIN', deletedAt: null, active: true } });
    if (admins <= 1) throw new ValidationError('A empresa precisa de ao menos um ADMIN');
  }
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ action: 'user.delete', entityType: 'User', entityId: id, summary: target.email });
}
