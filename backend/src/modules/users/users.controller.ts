import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, ok, param, parseBody } from '../../core/http';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './users.service';

export const usersRouter = Router();
const roleEnum = z.enum(['ADMIN', 'MANAGER', 'SELLER', 'FINANCE']);

usersRouter.get(
  '/',
  requirePermission('user.read'),
  asyncHandler(async (_req, res) => ok(res, await service.listUsers())),
);

usersRouter.post(
  '/',
  requirePermission('user.create'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        email: z.string().email().toLowerCase(),
        password: z.string().min(8).max(72),
        role: roleEnum,
      }),
      req.body,
    );
    created(res, await service.createUser(body));
  }),
);

usersRouter.put(
  '/:id',
  requirePermission('user.update'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        role: roleEnum.optional(),
        active: z.boolean().optional(),
        password: z.string().min(8).max(72).optional(),
      }),
      req.body,
    );
    ok(res, await service.updateUser(param(req, 'id'), body));
  }),
);

usersRouter.delete(
  '/:id',
  requirePermission('user.delete'),
  asyncHandler(async (req, res) => {
    await service.deleteUser(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
