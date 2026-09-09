// Espelho leve da matriz do backend - apenas para esconder itens de menu.
// A autorizacao real e SEMPRE feita no backend.
export type Role = 'ADMIN' | 'MANAGER' | 'SELLER' | 'FINANCE';

const MANAGER = new Set([
  'customer', 'supplier', 'product', 'inventory', 'sale', 'finance', 'charge',
  'appointment', 'report', 'automation.read', 'integration.read', 'notification', 'ai',
]);
const SELLER = new Set(['customer', 'product', 'inventory.read', 'sale.own', 'appointment', 'report.basic', 'notification', 'ai']);
const FINANCE = new Set(['customer.read', 'supplier.read', 'sale.read', 'finance', 'charge', 'report', 'appointment.read', 'notification', 'audit', 'ai']);

export function can(role: Role | undefined, key: string): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  const set = role === 'MANAGER' ? MANAGER : role === 'SELLER' ? SELLER : FINANCE;
  return set.has(key) || [...set].some((k) => key.startsWith(k));
}
