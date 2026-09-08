import { NotFoundError } from './errors';
import { currentCompanyId, tryGetContext } from './context';

/**
 * Modelos com companyId cuja leitura SEM contexto de tenant e proibida.
 * (Os demais modelos - Company, User, RefreshToken, etc. - sao acessados por
 * codigo de infraestrutura confiavel antes do contexto existir.)
 */
export const HARD_TENANT_MODELS = new Set<string>([
  'Customer',
  'Product',
  'StockMovement',
  'Sale',
  'FinanceCategory',
  'FinanceTransaction',
  'Receivable',
  'Payable',
  'AgendaEvent',
  'AiToolCall',
]);

/**
 * Todos os modelos com coluna companyId (auto-injecao quando ha contexto).
 * NB: SaleItem e Message nao entram (escopados via relacao); Company e o proprio
 * tenant (nao tem companyId).
 */
export const TENANT_MODELS = new Set<string>([
  ...HARD_TENANT_MODELS,
  'User',
  'ChannelLink',
  'PairingCode',
  'Conversation',
  'Subscription',
]);

/** companyId do tenant atual - para espalhar em objetos where/data tipados pelo Prisma. */
export function scope(): { companyId: string } {
  return { companyId: currentCompanyId() };
}

/**
 * where com companyId mesclado. `const` no parametro preserva literais de enum
 * (ex.: status: 'PAID') para satisfazer os tipos Exact do Prisma.
 */
export function tenantWhere<const T extends object>(extra?: T): T & { companyId: string } {
  return { ...(extra ?? ({} as T)), companyId: currentCompanyId() };
}

/** data com companyId do tenant atual mesclado. */
export function tenantData<const T extends object>(data: T): T & { companyId: string } {
  return { ...data, companyId: currentCompanyId() };
}

/** Garante que um registro carregado por id pertence ao tenant atual. */
export function ensureSameTenant<T extends { companyId: string } | null | undefined>(
  row: T,
  resource = 'Registro',
): NonNullable<T> {
  const ctx = tryGetContext();
  if (!row || (ctx && row.companyId !== ctx.companyId)) {
    throw new NotFoundError(resource);
  }
  return row as NonNullable<T>;
}
