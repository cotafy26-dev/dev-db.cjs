import { Router } from 'express';
import { prisma } from '../../core/prisma';
import { authRouter } from '../../modules/auth/auth.controller';
import { authenticate } from '../middlewares/auth';
import { customersRouter } from '../../modules/customers/customers.controller';
import { productsRouter } from '../../modules/products/products.controller';
import { inventoryRouter } from '../../modules/inventory/inventory.controller';
import { salesRouter } from '../../modules/sales/sales.controller';
import { financeRouter } from '../../modules/finance/finance.controller';
import { agendaRouter } from '../../modules/agenda/agenda.controller';
import { reportsRouter } from '../../modules/reports/reports.controller';
import { aiRouter } from '../../ai/ai.controller';
import { channelsRouter } from '../../integrations/channels.controller';
import { integrationsRouter } from '../../integrations/integrations.controller';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', ts: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

apiRouter.use('/auth', authRouter);

// Webhooks publicos (sem JWT) - resolvem o tenant pelo vinculo do canal
apiRouter.use('/integrations', integrationsRouter);

// Rotas autenticadas (multi-tenant)
apiRouter.use('/customers', authenticate, customersRouter);
apiRouter.use('/products', authenticate, productsRouter);
apiRouter.use('/inventory', authenticate, inventoryRouter);
apiRouter.use('/sales', authenticate, salesRouter);
apiRouter.use('/finance', authenticate, financeRouter);
apiRouter.use('/agenda', authenticate, agendaRouter);
apiRouter.use('/reports', authenticate, reportsRouter);
apiRouter.use('/ai', authenticate, aiRouter);
apiRouter.use('/channels', authenticate, channelsRouter);
