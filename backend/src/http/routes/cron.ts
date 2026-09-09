import { Router } from 'express';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import { asyncHandler } from '../../core/http';
import { runScheduledAutomations } from '../../modules/automation/automation.service';

/**
 * Endpoint para cron EXTERNO (hPanel Cron Jobs, cron-job.org, GitHub Actions...).
 * Necessario em hospedagem sem processo sempre ativo, onde o scheduler in-process
 * do servidor pode nao rodar de forma confivel.
 *
 *   POST /api/cron/tick?kind=daily&key=CRON_SECRET
 *   POST /api/cron/tick?kind=weekly&key=CRON_SECRET
 */
export const cronRouter = Router();

cronRouter.post(
  '/tick',
  asyncHandler(async (req, res) => {
    const key = (req.query.key as string) || req.headers['x-cron-key'];
    if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'chave de cron invalida' } });
      return;
    }
    const kind = req.query.kind === 'weekly' ? 'schedule.weekly' : 'schedule.daily';
    logger.info({ kind }, 'cron externo: disparando automacoes agendadas');
    await runScheduledAutomations(kind);
    res.json({ data: { ok: true, kind, ranAt: new Date().toISOString() } });
  }),
);
