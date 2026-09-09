import { prisma } from './prisma';
import { logger } from './logger';
import { tryGetContext } from './context';

export interface AuditInput {
  action: string; // ex.: sale.create, sale.cancel, payment.register
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Registra uma operacao importante (secao 27). Nunca lanca - auditoria nao pode
 * derrubar a operacao de negocio.
 */
export async function audit(input: AuditInput): Promise<void> {
  const ctx = tryGetContext();
  if (!ctx) return;
  try {
    await prisma.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        summary: input.summary,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ip: ctx.ip,
        source: ctx.source,
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action }, 'Falha ao gravar AuditLog');
  }
}
