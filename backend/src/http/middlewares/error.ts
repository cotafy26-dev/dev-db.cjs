import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../../core/errors';
import { logger } from '../../core/logger';
import { isProd } from '../../core/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `Rota nao encontrada: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno do servidor';
  let details: unknown;

  if (isAppError(err)) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Dados invalidos';
    details = err.flatten();
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'CONFLICT';
      message = 'Registro duplicado';
      details = err.meta;
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Registro nao encontrado';
    } else {
      status = 400;
      code = `DB_${err.code}`;
      message = 'Erro de banco de dados';
    }
  } else if (err instanceof Error) {
    message = err.message;
  }

  const logPayload = {
    err,
    reqId: (req as Request & { id?: string }).id,
    method: req.method,
    path: req.path,
  };
  if (status >= 500) logger.error(logPayload, 'Erro nao tratado');
  else logger.warn(logPayload, 'Erro de requisicao');

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(isProd || status < 500 ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
  });
}
