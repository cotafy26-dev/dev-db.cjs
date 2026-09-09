import { NotFoundError } from './errors';
import { currentCompanyId, tryGetContext } from './context';

/**
 * Modelos de negocio cuja leitura SEM contexto de tenant e proibida (secao 5:
 * "isolamento de dados em todas as consultas").
 */
export const HARD_TENANT_MODELS = new Set<string>([
  'Customer',
  'Supplier',
  'ProductCategory',
  'Product',
  'Inventory',
  'InventoryMovement',
  'Sale',
  'Payment',
  'FinancialCategory',
  'Income',
  'Expense',
  'AccountReceivable',
  'AccountPayable',
  'Appointment',
  'Notification',
  'AIExecution',
  'Automation',
  'Document',
  'AuditLog',
]);

/**
 * Todos os modelos com coluna companyId (auto-injecao quando ha contexto).
 * NB: Company e o proprio tenant; Permission/RolePermission/RefreshToken/Message/
 * SaleItem/Plan nao tem companyId.
 */
export const TENANT_MODELS = new Set<string>([
  ...HARD_TENANT_MODELS,
  'User',
  'Role',
  'ChannelLink',
  'PairingCode',
  'Conversation',
  'Subscription',
  'Integration',
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
