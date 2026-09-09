import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, parseBody } from '../../core/http';
import { prisma } from '../../core/prisma';
import { currentCompanyId } from '../../core/context';
import { scope } from '../../core/tenant';
import { audit } from '../../core/audit';
import { requirePermission } from '../../http/middlewares/auth';
import { enabledChannels } from '../../integrations/messaging';

export const integrationsSettingsRouter = Router();

integrationsSettingsRouter.get(
  '/',
  requirePermission('integration.read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.integration.findMany({ where: scope(), orderBy: { provider: 'asc' } });
    ok(res, { integrations: rows, enabledChannels: enabledChannels() });
  }),
);

integrationsSettingsRouter.put(
  '/:provider',
  requirePermission('integration.manage'),
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider);
    const body = parseBody(
      z.object({ active: z.boolean().optional(), config: z.record(z.unknown()).optional() }),
      req.body,
    );
    const row = await prisma.integration.upsert({
      where: { companyId_provider: { companyId: currentCompanyId(), provider } },
      update: { active: body.active, config: (body.config ?? undefined) as never },
      create: {
        companyId: currentCompanyId(),
        provider,
        active: body.active ?? false,
        config: (body.config ?? {}) as never,
      },
    });
    await audit({ action: 'integration.update', entityType: 'Integration', entityId: row.id, summary: provider });
    ok(res, row);
  }),
);
