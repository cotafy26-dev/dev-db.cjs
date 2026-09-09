import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '@prisma/client';
import { AppError } from './errors';

/**
 * Contexto propagado por toda a stack de uma requisicao (HTTP, Telegram, WhatsApp).
 * E a fonte de verdade do tenant atual: nenhum service/repository deve receber
 * companyId por parametro do cliente - ele vem daqui.
 */
export interface RequestContext {
  companyId: string;
  userId: string | null;
  role: UserRole | null;
  /** Origem da acao: 'http' | 'telegram' | 'whatsapp' | 'system' */
  source: string;
  requestId: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new AppError('CONTEXT_MISSING', 'Contexto de requisicao ausente', 500);
  }
  return ctx;
}

export function tryGetContext(): RequestContext | undefined {
  return storage.getStore();
}

/** companyId do tenant atual - atalho usado pelos repositories. */
export function currentCompanyId(): string {
  return getContext().companyId;
}

export function currentUserId(): string | null {
  return getContext().userId;
}

export function currentRole(): UserRole | null {
  return getContext().role;
}
