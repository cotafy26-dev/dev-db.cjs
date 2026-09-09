import type { NotificationType } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { logger } from '../../core/logger';
import { scope } from '../../core/tenant';
import { currentCompanyId, tryGetContext } from '../../core/context';
import { toSkipTake, type Pagination } from '../../core/pagination';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  data?: unknown;
  companyId?: string;
}

/**
 * Cria uma notificacao no painel (secao 26). Canais externos (Telegram/WhatsApp/
 * e-mail) sao plugados aqui posteriormente. Nunca lanca.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const companyId = input.companyId ?? tryGetContext()?.companyId;
  if (!companyId) return;
  try {
    await prisma.notification.create({
      data: {
        companyId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as never,
      },
    });
  } catch (err) {
    logger.warn({ err, type: input.type }, 'Falha ao criar notificacao');
  }
}

export async function listNotifications(p: Pagination & { unreadOnly?: boolean }) {
  const where = { ...scope(), ...(p.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(p) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...scope(), readAt: null } }),
  ]);
  return { items, total, unread };
}

export async function markRead(id: string) {
  await prisma.notification.updateMany({
    where: { ...scope(), id },
    data: { readAt: new Date() },
  });
}

export async function markAllRead() {
  await prisma.notification.updateMany({
    where: { companyId: currentCompanyId(), readAt: null },
    data: { readAt: new Date() },
  });
}
