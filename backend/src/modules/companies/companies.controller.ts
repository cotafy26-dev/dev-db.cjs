import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, param, parseBody } from '../../core/http';
import { requirePermission } from '../../http/middlewares/auth';
import { listPlans } from '../plans/plans.service';
import { listPermissionsForCompany } from '../rbac/rbac.service';
import { currentCompanyId } from '../../core/context';
import * as service from './companies.service';

export const companyRouter = Router();

companyRouter.get(
  '/',
  requirePermission('company.read'),
  asyncHandler(async (_req, res) => ok(res, await service.getCompany())),
);

companyRouter.put(
  '/',
  requirePermission('company.update'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        document: z.string().max(20).nullish(),
        segment: z.string().max(80).nullish(),
        phone: z.string().max(20).nullish(),
        email: z.string().email().nullish(),
        timezone: z.string().max(64).optional(),
        currency: z.string().length(3).optional(),
        retentionDays: z.number().int().min(0).max(3650).optional(),
      }),
      req.body,
    );
    ok(res, await service.updateCompany(body));
  }),
);

companyRouter.post(
  '/onboarding/complete',
  requirePermission('company.update'),
  asyncHandler(async (_req, res) => ok(res, await service.completeOnboarding())),
);

companyRouter.get(
  '/plans',
  requirePermission('company.read'),
  asyncHandler(async (_req, res) => ok(res, await listPlans())),
);

companyRouter.get(
  '/permissions',
  requirePermission('company.read'),
  asyncHandler(async (_req, res) => ok(res, await listPermissionsForCompany(currentCompanyId()))),
);

// ---- LGPD ----
companyRouter.get(
  '/lgpd/export',
  requirePermission('lgpd.manage'),
  asyncHandler(async (_req, res) => ok(res, await service.exportCompanyData())),
);

companyRouter.post(
  '/lgpd/erase-customer/:id',
  requirePermission('lgpd.manage'),
  asyncHandler(async (req, res) => {
    await service.eraseCustomer(param(req, 'id'));
    ok(res, { ok: true });
  }),
);
