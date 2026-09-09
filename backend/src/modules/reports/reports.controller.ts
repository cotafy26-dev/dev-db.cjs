import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, parseBody } from '../../core/http';
import { requirePermission } from '../../http/middlewares/auth';
import * as service from './reports.service';

export const reportsRouter = Router();
const periodQuery = z.object({ period: z.string().optional() });

reportsRouter.get(
  '/overview',
  requirePermission('report.read'),
  asyncHandler(async (_req, res) => ok(res, await service.overview())),
);

reportsRouter.get(
  '/sales',
  requirePermission('report.read'),
  asyncHandler(async (req, res) => ok(res, await service.salesReport(parseBody(periodQuery, req.query).period))),
);

reportsRouter.get(
  '/financial',
  requirePermission('report.finance.read'),
  asyncHandler(async (req, res) => ok(res, await service.financialReport(parseBody(periodQuery, req.query).period))),
);

reportsRouter.get(
  '/profit',
  requirePermission('report.finance.read'),
  asyncHandler(async (req, res) => ok(res, await service.profitReport(parseBody(periodQuery, req.query).period))),
);

reportsRouter.get(
  '/inventory',
  requirePermission('report.read'),
  asyncHandler(async (_req, res) => ok(res, await service.inventoryReport())),
);

reportsRouter.get(
  '/customers',
  requirePermission('report.read'),
  asyncHandler(async (_req, res) => ok(res, await service.customerReport())),
);

reportsRouter.get(
  '/sellers',
  requirePermission('report.read'),
  asyncHandler(async (req, res) => ok(res, await service.sellerReport(parseBody(periodQuery, req.query).period))),
);
