import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../../core/errors';
import { runWithContext, type RequestContext } from '../../core/context';
import { verifyAccessToken } from '../../modules/auth/jwt';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    auth?: RequestContext & { email: string };
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  if (typeof req.query.access_token === 'string') return req.query.access_token;
  return null;
}

/**
 * Autentica via JWT e estabelece o RequestContext (tenant atual) para toda a
 * cadeia downstream. Sem contexto, repositories/services se recusam a rodar.
 */
export const authenticate: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    next(new UnauthorizedError('Credenciais ausentes'));
    return;
  }
  const payload = verifyAccessToken(token);
  const ctx: RequestContext & { email: string } = {
    companyId: payload.companyId,
    userId: payload.sub,
    role: payload.role,
    source: 'http',
    requestId: req.id ?? 'unknown',
    email: payload.email,
  };
  req.auth = ctx;
  runWithContext(ctx, () => next());
};

export function authorize(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (roles.length > 0 && (!req.auth.role || !roles.includes(req.auth.role))) {
      next(new ForbiddenError(`Requer perfil: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}
