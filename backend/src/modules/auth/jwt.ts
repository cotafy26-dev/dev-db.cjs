import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../core/env';
import { UnauthorizedError } from '../../core/errors';

export interface AccessTokenPayload {
  sub: string; // userId
  companyId: string;
  role: UserRole;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // id do RefreshToken persistido
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError('Token de acesso invalido ou expirado');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw new UnauthorizedError('Refresh token invalido ou expirado');
  }
}

/** Converte '15m' | '30d' | '3600' em milissegundos. */
export function ttlToMs(ttl: string): number {
  const m = ttl.match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return Number(ttl) * 1000 || 0;
  const value = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1000;
  return value * factor;
}
