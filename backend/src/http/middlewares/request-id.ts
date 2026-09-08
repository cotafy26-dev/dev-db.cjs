import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
