import { Router } from 'express';
import { asyncHandler, created, ok, parseBody } from '../../core/http';
import { authenticate } from '../../http/middlewares/auth';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();

function reqMeta(req: import('express').Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body);
    const result = await authService.register(input, reqMeta(req));
    created(res, result);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const result = await authService.login(input, reqMeta(req));
    ok(res, result);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parseBody(refreshSchema, req.body);
    const tokens = await authService.refresh(refreshToken, reqMeta(req));
    ok(res, { tokens });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parseBody(refreshSchema, req.body);
    await authService.logout(refreshToken);
    ok(res, { ok: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const session = await authService.getSession(req.auth!.userId!);
    ok(res, { user: session });
  }),
);
