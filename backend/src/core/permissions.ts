import type { UserRole } from '@prisma/client';

/**
 * Catalogo de permissoes (secao 6). Enforcement e SEMPRE no backend.
 * Chaves no formato "<recurso>.<acao>". `*.read.own` = versao restrita ao proprio usuario.
 */
export const PERMISSIONS = [
  'company.read',
  'company.update',
  'user.read',
  'user.create',
  'user.update',
  'user.delete',
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.delete',
  'supplier.read',
  'supplier.create',
  'supplier.update',
  'supplier.delete',
  'category.read',
  'category.manage',
  'product.read',
  'product.create',
  'product.update',
  'product.delete',
  'inventory.read',
  'inventory.move',
  'sale.read',
  'sale.read.own',
  'sale.create',
  'sale.cancel',
  'finance.read',
  'finance.create',
  'finance.manage',
  'charge.read',
  'charge.manage',
  'appointment.read',
  'appointment.manage',
  'report.read',
  'report.finance.read',
  'automation.read',
  'automation.manage',
  'integration.read',
  'integration.manage',
  'notification.read',
  'audit.read',
  'ai.use',
  'lgpd.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const MANAGER = new Set<Permission>([
  'company.read',
  'user.read',
  'customer.read', 'customer.create', 'customer.update', 'customer.delete',
  'supplier.read', 'supplier.create', 'supplier.update', 'supplier.delete',
  'category.read', 'category.manage',
  'product.read', 'product.create', 'product.update', 'product.delete',
  'inventory.read', 'inventory.move',
  'sale.read', 'sale.create', 'sale.cancel',
  'finance.read', 'finance.create', 'finance.manage',
  'charge.read', 'charge.manage',
  'appointment.read', 'appointment.manage',
  'report.read', 'report.finance.read',
  'automation.read',
  'integration.read',
  'notification.read',
  'ai.use',
]);

const SELLER = new Set<Permission>([
  'company.read',
  'customer.read', 'customer.create', 'customer.update',
  'product.read',
  'inventory.read',
  'sale.read.own', 'sale.create',
  'appointment.read', 'appointment.manage',
  'report.read',
  'notification.read',
  'ai.use',
]);

const FINANCE = new Set<Permission>([
  'company.read',
  'customer.read',
  'supplier.read',
  'product.read',
  'sale.read',
  'finance.read', 'finance.create', 'finance.manage',
  'charge.read', 'charge.manage',
  'report.read', 'report.finance.read',
  'appointment.read',
  'notification.read',
  'audit.read',
  'ai.use',
]);

export const ROLE_MATRIX: Record<UserRole, Set<Permission>> = {
  ADMIN: ALL,
  MANAGER,
  SELLER,
  FINANCE,
};

export function roleHas(role: UserRole, permission: Permission): boolean {
  return ROLE_MATRIX[role]?.has(permission) ?? false;
}

export function roleHasAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => roleHas(role, p));
}

export function permissionsForRole(role: UserRole): Permission[] {
  return [...(ROLE_MATRIX[role] ?? [])];
}
