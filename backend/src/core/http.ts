import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from './errors';

/** Envolve handlers async para propagar rejeicoes ao middleware de erro. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function parseBody<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Dados invalidos', result.error.flatten());
  }
  return result.data;
}

/** Le um parametro de rota garantindo string nao vazia. */
export function param(req: Request, name: string): string {
  const raw = (req.params as Record<string, unknown>)[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Parametro de rota "${name}" ausente`);
  }
  return value;
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function created(res: Response, data: unknown): void {
  res.status(201).json({ data });
}

export function paginated(
  res: Response,
  items: unknown[],
  meta: { page: number; pageSize: number; total: number },
): void {
  res.status(200).json({ data: items, meta: { ...meta, pages: Math.ceil(meta.total / meta.pageSize) } });
}
