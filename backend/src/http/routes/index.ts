import { Router } from 'express';
import { prisma } from '../../core/prisma';
import { authenticate } from '../middlewares/auth';
import { authRouter } from '../../modules/auth/auth.controller';
import { companyRouter } from '../../modules/companies/companies.controller';
import { usersRouter } from '../../modules/users/users.controller';
import { customersRouter } from '../../modules/customers/customers.controller';
import { suppliersRouter } from '../../modules/suppliers/suppliers.controller';
import { productsRouter } from '../../modules/products/products.controller';
import { inventoryRouter } from '../../modules/inventory/inventory.controller';
import { salesRouter } from '../../modules/sales/sales.controller';
import { financeRouter } from '../../modules/finance/finance.controller';
import { chargesRouter } from '../../modules/charges/charges.controller';
import { appointmentsRouter } from '../../modules/appointments/appointments.controller';
import { reportsRouter } from '../../modules/reports/reports.controller';
import { notificationsRouter } from '../../modules/notifications/notifications.controller';
import { automationRouter } from '../../modules/automation/automation.controller';
import { auditRouter } from '../../modules/audit/audit.controller';
import { integrationsSettingsRouter } from '../../modules/integrations/integrations.settings.controller';
import { aiRouter } from '../../ai/ai.controller';
import { channelsRouter } from '../../integrations/channels.controller';
import { webhooksRouter } from '../../integrations/webhooks.controller';
import { cronRouter } from './cron';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', ts: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// Publicos
apiRouter.use('/auth', authRouter);
apiRouter.use('/webhooks', webhooksRouter);
apiRouter.use('/integrations', webhooksRouter); // alias
apiRouter.use('/cron', cronRouter); // protegido por CRON_SECRET

// Autenticados (multi-tenant + RBAC)
apiRouter.use('/companies', authenticate, companyRouter);
apiRouter.use('/company', authenticate, companyRouter); // alias singular
apiRouter.use('/users', authenticate, usersRouter);
apiRouter.use('/customers', authenticate, customersRouter);
apiRouter.use('/suppliers', authenticate, suppliersRouter);
apiRouter.use('/products', authenticate, productsRouter);
apiRouter.use('/inventory', authenticate, inventoryRouter);
apiRouter.use('/sales', authenticate, salesRouter);
apiRouter.use('/finance', authenticate, financeRouter);
apiRouter.use('/charges', authenticate, chargesRouter);
apiRouter.use('/appointments', authenticate, appointmentsRouter);
apiRouter.use('/reports', authenticate, reportsRouter);
apiRouter.use('/notifications', authenticate, notificationsRouter);
apiRouter.use('/automations', authenticate, automationRouter);
apiRouter.use('/audit', authenticate, auditRouter);
apiRouter.use('/settings/integrations', authenticate, integrationsSettingsRouter);
apiRouter.use('/ai', authenticate, aiRouter);
apiRouter.use('/channels', authenticate, channelsRouter);
