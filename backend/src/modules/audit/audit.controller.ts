import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginated, parseBody } from '../../core/http';
import { paginationSchema, toSkipTake } from '../../core/pagination';
import { prisma } from '../../core/prisma';
import { scope } from '../../core/tenant';
import { requirePermission } from '../../http/middlewares/auth';

export const auditRouter = Router();

auditRouter.get(
  '/',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const p = parseBody(
      paginationSchema.extend({ action: z.string().optional(), entityType: z.string().optional() }),
      req.query,
    );
    const where = {
      ...scope(),
      ...(p.action ? { action: { contains: p.action } } : {}),
      ...(p.entityType ? { entityType: p.entityType } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
        ...toSkipTake(p),
      }),
      prisma.auditLog.count({ where }),
    ]);
    paginated(res, items, { page: p.page, pageSize: p.pageSize, total });
  }),
);
