import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_MATRIX, roleHas, roleHasAny, permissionsForRole } from '../src/core/permissions';

describe('RBAC - matriz de permissoes (secao 6)', () => {
  it('ADMIN tem todas as permissoes', () => {
    for (const p of PERMISSIONS) expect(roleHas('ADMIN', p)).toBe(true);
  });

  it('SELLER nao acessa financeiro nem cancela venda', () => {
    expect(roleHas('SELLER', 'finance.read')).toBe(false);
    expect(roleHas('SELLER', 'finance.create')).toBe(false);
    expect(roleHas('SELLER', 'sale.cancel')).toBe(false);
    expect(roleHas('SELLER', 'user.create')).toBe(false);
  });

  it('SELLER ve apenas as proprias vendas', () => {
    expect(roleHas('SELLER', 'sale.read')).toBe(false);
    expect(roleHas('SELLER', 'sale.read.own')).toBe(true);
    expect(roleHas('SELLER', 'sale.create')).toBe(true);
  });

  it('FINANCE gerencia financeiro mas nao mexe em produtos/estoque', () => {
    expect(roleHas('FINANCE', 'finance.manage')).toBe(true);
    expect(roleHas('FINANCE', 'report.finance.read')).toBe(true);
    expect(roleHas('FINANCE', 'product.create')).toBe(false);
    expect(roleHas('FINANCE', 'inventory.move')).toBe(false);
  });

  it('MANAGER cobre vendas, estoque, clientes, financeiro e relatorios', () => {
    for (const p of ['sale.create', 'inventory.move', 'customer.create', 'finance.create', 'report.read'] as const) {
      expect(roleHas('MANAGER', p)).toBe(true);
    }
    expect(roleHas('MANAGER', 'user.delete')).toBe(false);
  });

  it('roleHasAny e permissionsForRole coerentes', () => {
    expect(roleHasAny('SELLER', ['sale.read', 'sale.read.own'])).toBe(true);
    expect(roleHasAny('SELLER', ['finance.read', 'audit.read'])).toBe(false);
    expect(permissionsForRole('ADMIN').length).toBe(PERMISSIONS.length);
  });
});
