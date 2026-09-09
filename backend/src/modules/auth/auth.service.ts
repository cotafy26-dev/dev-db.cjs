import { createHash } from 'node:crypto';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { ConflictError, UnauthorizedError } from '../../core/errors';
import { token as randomToken } from '../../core/ids';
import { dayjs } from '../../core/dates';
import { signAccessToken, signRefreshToken, ttlToMs, verifyRefreshToken } from './jwt';
import { env } from '../../core/env';
import { hashPassword, verifyPassword } from './password';
import { provisionRoles } from '../rbac/rbac.service';
import { getPlanByCode } from '../plans/plans.service';
import type { LoginInput, RegisterInput } from './auth.schemas';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  segment: string | null;
  currency: string;
  timezone: string;
  onboarded: boolean;
}

async function issueTokens(
  user: { id: string; email: string; role: UserRole; companyId: string },
  meta: { userAgent?: string; ip?: string },
): Promise<AuthTokens> {
  const refreshRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: 'pending',
      expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, jti: refreshRecord.id });
  await prisma.refreshToken.update({
    where: { id: refreshRecord.id },
    data: { tokenHash: hashToken(refreshToken) },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    companyId: user.companyId,
    role: user.role,
    email: user.email,
  });

  return { accessToken, refreshToken, expiresIn: Math.floor(ttlToMs(env.JWT_ACCESS_TTL) / 1000) };
}

function toSession(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  company: { name: string; segment: string | null; currency: string; timezone: string; onboardedAt: Date | null };
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyName: user.company.name,
    segment: user.company.segment,
    currency: user.company.currency,
    timezone: user.company.timezone,
    onboarded: Boolean(user.company.onboardedAt),
  };
}

export async function register(
  input: RegisterInput,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ tokens: AuthTokens; user: SessionUser }> {
  const existing = await prisma.user.findFirst({ where: { email: input.user.email } });
  if (existing) throw new ConflictError('E-mail ja cadastrado');

  const passwordHash = await hashPassword(input.user.password);
  const basic = await getPlanByCode('BASIC');

  const company = await prisma.company.create({
    data: {
      name: input.company.name,
      document: input.company.document,
      segment: input.company.segment,
      phone: input.company.phone,
      timezone: input.company.timezone ?? 'America/Sao_Paulo',
      currency: input.company.currency ?? 'BRL',
      onboardedAt: new Date(),
      users: {
        create: { name: input.user.name, email: input.user.email, passwordHash, role: 'ADMIN' },
      },
      subscription: {
        create: {
          planId: basic?.id,
          status: 'TRIALING',
          trialEndsAt: dayjs().add(14, 'day').toDate(),
        },
      },
      financialCategories: {
        create: [
          { name: 'Vendas', direction: 'IN' },
          { name: 'Servicos', direction: 'IN' },
          { name: 'Outras receitas', direction: 'IN' },
          { name: 'Fornecedores', direction: 'OUT' },
          { name: 'Energia', direction: 'OUT' },
          { name: 'Agua', direction: 'OUT' },
          { name: 'Combustivel', direction: 'OUT' },
          { name: 'Aluguel', direction: 'OUT' },
          { name: 'Salarios', direction: 'OUT' },
          { name: 'Impostos', direction: 'OUT' },
          { name: 'Outras despesas', direction: 'OUT' },
        ],
      },
    },
    include: { users: true },
  });

  await provisionRoles(company.id);
  const adminRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: 'ADMIN' } },
  });
  const user = company.users[0]!;
  if (adminRole) {
    await prisma.user.update({ where: { id: user.id }, data: { roleRefId: adminRole.id } });
  }

  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { company: true } });
  const tokens = await issueTokens(
    { id: user.id, email: user.email, role: 'ADMIN', companyId: company.id },
    meta,
  );
  return { tokens, user: toSession(full) };
}

export async function login(
  input: LoginInput,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ tokens: AuthTokens; user: SessionUser }> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, active: true, deletedAt: null },
    include: { company: true },
  });
  if (!user) throw new UnauthorizedError('Credenciais invalidas');

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Credenciais invalidas');

  const tokens = await issueTokens(
    { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
    meta,
  );
  return { tokens, user: toSession(user) };
}

export async function refresh(
  rawRefreshToken: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<AuthTokens> {
  const payload = verifyRefreshToken(rawRefreshToken);
  const record = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
    include: { user: true },
  });

  if (
    !record ||
    record.revokedAt ||
    record.expiresAt < new Date() ||
    record.tokenHash !== hashToken(rawRefreshToken)
  ) {
    throw new UnauthorizedError('Sessao expirada, faca login novamente');
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

  return issueTokens(
    {
      id: record.user.id,
      email: record.user.email,
      role: record.user.role,
      companyId: record.user.companyId,
    },
    meta,
  );
}

export async function logout(rawRefreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    /* logout idempotente */
  }
}

export async function getSession(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { company: true },
  });
  return toSession(user);
}

export { randomToken };
