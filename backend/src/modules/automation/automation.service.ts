import { prisma } from '../../core/prisma';
import { logger } from '../../core/logger';
import { NotFoundError } from '../../core/errors';
import { currentCompanyId, currentUserId, runWithContext } from '../../core/context';
import { scope } from '../../core/tenant';
import { audit } from '../../core/audit';
import { notify } from '../notifications/notifications.service';
import { lowStockProducts } from '../products/products.service';
import { overdueAccounts } from '../finance/finance.service';

export const TRIGGERS = [
  'schedule.daily',
  'schedule.weekly',
  'stock.low',
  'customer.overdue',
  'account.due_soon',
  'sale.created',
] as const;
export const ACTIONS = ['notify', 'weekly_summary', 'flag_overdue'] as const;

export interface AutomationInput {
  name: string;
  trigger: string;
  action: string;
  config?: Record<string, unknown>;
  active?: boolean;
}

export async function listAutomations() {
  return prisma.automation.findMany({ where: scope(), orderBy: { createdAt: 'desc' } });
}

export async function createAutomation(input: AutomationInput) {
  const a = await prisma.automation.create({
    data: {
      companyId: currentCompanyId(),
      name: input.name,
      trigger: input.trigger,
      action: input.action,
      config: (input.config ?? {}) as never,
      active: input.active ?? true,
      createdById: currentUserId(),
    },
  });
  await audit({ action: 'automation.create', entityType: 'Automation', entityId: a.id, summary: `${a.trigger} -> ${a.action}` });
  return a;
}

export async function updateAutomation(id: string, input: Partial<AutomationInput>) {
  const found = await prisma.automation.findFirst({ where: { ...scope(), id } });
  if (!found) throw new NotFoundError('Automacao', id);
  return prisma.automation.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.config !== undefined ? { config: input.config as never } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteAutomation(id: string) {
  const found = await prisma.automation.findFirst({ where: { ...scope(), id } });
  if (!found) throw new NotFoundError('Automacao', id);
  await prisma.automation.delete({ where: { id } });
}

// ------------------------------------------------------------- Motor

async function executeAction(action: string): Promise<void> {
  switch (action) {
    case 'notify':
    case 'flag_overdue': {
      const [low, overdue] = await Promise.all([lowStockProducts(), overdueAccounts()]);
      if (low.length) {
        await notify({ type: 'LOW_STOCK', title: `${low.length} produto(s) em estoque baixo`, body: low.map((l) => l.name).join(', ') });
      }
      if (overdue.receivables.length) {
        await notify({
          type: 'OVERDUE_RECEIVABLE',
          title: `${overdue.receivables.length} conta(s) a receber vencidas`,
          body: overdue.receivables.map((r) => `${r.customer ?? 'Cliente'}: R$ ${r.amount.toFixed(2)}`).join('; '),
        });
      }
      if (overdue.payables.length) {
        await notify({
          type: 'OVERDUE_PAYABLE',
          title: `${overdue.payables.length} conta(s) a pagar vencidas`,
          body: overdue.payables.map((p) => p.description).join('; '),
        });
      }
      break;
    }
    case 'weekly_summary': {
      const overdue = await overdueAccounts();
      await notify({
        type: 'SYSTEM',
        title: 'Resumo semanal',
        body: `Contas a receber vencidas: ${overdue.receivables.length} | a pagar vencidas: ${overdue.payables.length}`,
      });
      break;
    }
    default:
      logger.warn({ action }, 'Acao de automacao desconhecida');
  }
}

/** Dispara automacoes de um trigger para uma empresa (chamado por eventos ou pelo scheduler). */
export async function fireTrigger(companyId: string, trigger: string): Promise<void> {
  const automations = await prisma.automation.findMany({ where: { companyId, trigger, active: true } });
  for (const a of automations) {
    try {
      await runWithContext(
        { companyId, userId: null, role: 'ADMIN', source: 'system', requestId: `auto-${a.id}` },
        async () => {
          await executeAction(a.action);
          await prisma.automation.update({ where: { id: a.id }, data: { lastRunAt: new Date() } });
        },
      );
    } catch (err) {
      logger.error({ err, automationId: a.id }, 'Falha ao executar automacao');
    }
  }
}

/** Tick do scheduler (secao 25/35). Percorre empresas com automacoes agendadas. */
export async function runScheduledAutomations(kind: 'schedule.daily' | 'schedule.weekly'): Promise<void> {
  const rows = await prisma.automation.findMany({
    where: { trigger: kind, active: true },
    select: { companyId: true },
    distinct: ['companyId'],
  });
  for (const { companyId } of rows) {
    await fireTrigger(companyId, kind);
  }
}
