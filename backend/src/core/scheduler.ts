import { env, queuesEnabled } from './env';
import { logger } from './logger';
import { dayjs } from './dates';
import { runScheduledAutomations } from '../modules/automation/automation.service';

/**
 * Scheduler in-process (secao 25/35). Sem Redis, roda com setInterval e um
 * checkpoint por hora. Com REDIS_URL definido, este ponto e o lugar para
 * plugar BullMQ (fora do escopo desta versao).
 */

let timer: NodeJS.Timeout | null = null;
let lastDaily = '';
let lastWeekly = '';

async function tick(): Promise<void> {
  const now = dayjs().tz('America/Sao_Paulo');
  const dayKey = now.format('YYYY-MM-DD');
  const weekKey = now.format('GGGG-WW');

  try {
    if (now.hour() === 8 && lastDaily !== dayKey) {
      lastDaily = dayKey;
      logger.info('Scheduler: automacoes diarias');
      await runScheduledAutomations('schedule.daily');
    }
    if (now.day() === 1 && now.hour() === 8 && lastWeekly !== weekKey) {
      lastWeekly = weekKey;
      logger.info('Scheduler: automacoes semanais');
      await runScheduledAutomations('schedule.weekly');
    }
  } catch (err) {
    logger.error({ err }, 'Scheduler tick falhou');
  }
}

export function startScheduler(): void {
  if (env.NODE_ENV === 'test') return;
  if (queuesEnabled) {
    logger.info('REDIS_URL definido - scheduler in-process ativo (BullMQ nao configurado nesta versao)');
  }
  timer = setInterval(() => void tick(), 10 * 60 * 1000); // a cada 10 min
  timer.unref();
  logger.info('Scheduler iniciado');
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
