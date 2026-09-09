import type { UserRole } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { PERMISSIONS, ROLE_MATRIX, permissionsForRole } from '../../core/permissions';

const ROLE_NAMES: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SELLER: 'Vendedor',
  FINANCE: 'Financeiro',
};

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'company.read': 'Ver dados da empresa',
  'company.update': 'Editar dados da empresa',
  'user.read': 'Ver usuarios',
  'user.create': 'Criar usuarios',
  'user.update': 'Editar usuarios',
  'user.delete': 'Remover usuarios',
  'customer.read': 'Ver clientes',
  'customer.create': 'Criar clientes',
  'customer.update': 'Editar clientes',
  'customer.delete': 'Excluir clientes',
  'supplier.read': 'Ver fornecedores',
  'supplier.create': 'Criar fornecedores',
  'supplier.update': 'Editar fornecedores',
  'supplier.delete': 'Excluir fornecedores',
  'category.read': 'Ver categorias de produto',
  'category.manage': 'Gerenciar categorias de produto',
  'product.read': 'Ver produtos',
  'product.create': 'Criar produtos',
  'product.update': 'Editar produtos',
  'product.delete': 'Excluir produtos',
  'inventory.read': 'Ver estoque',
  'inventory.move': 'Movimentar estoque',
  'sale.read': 'Ver todas as vendas',
  'sale.read.own': 'Ver as proprias vendas',
  'sale.create': 'Registrar vendas',
  'sale.cancel': 'Cancelar vendas',
  'finance.read': 'Ver financeiro',
  'finance.create': 'Lancar receitas/despesas',
  'finance.manage': 'Gerenciar contas e pagamentos',
  'charge.read': 'Ver cobrancas',
  'charge.manage': 'Gerenciar cobrancas',
  'appointment.read': 'Ver agenda',
  'appointment.manage': 'Gerenciar agenda',
  'report.read': 'Ver relatorios operacionais',
  'report.finance.read': 'Ver relatorios financeiros',
  'automation.read': 'Ver automacoes',
  'automation.manage': 'Gerenciar automacoes',
  'integration.read': 'Ver integracoes',
  'integration.manage': 'Gerenciar integracoes',
  'notification.read': 'Ver notificacoes',
  'audit.read': 'Ver auditoria',
  'ai.use': 'Usar o assistente Tato',
  'lgpd.manage': 'Gerenciar solicitacoes LGPD',
};

/** Garante o catalogo global de Permission (idempotente). Chamado no boot. */
export async function ensurePermissionCatalog(): Promise<void> {
  await prisma.$transaction(
    PERMISSIONS.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: { description: PERMISSION_DESCRIPTIONS[key] ?? key },
        create: { key, description: PERMISSION_DESCRIPTIONS[key] ?? key },
      }),
    ),
  );
}

/** Cria os 4 perfis do sistema para uma empresa e liga as permissoes da matriz. */
export async function provisionRoles(companyId: string): Promise<void> {
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const key of Object.keys(ROLE_MATRIX) as UserRole[]) {
    const role = await prisma.role.upsert({
      where: { companyId_key: { companyId, key } },
      update: { name: ROLE_NAMES[key] },
      create: { companyId, key, name: ROLE_NAMES[key], system: true },
    });
    const wanted = permissionsForRole(key)
      .map((k) => byKey.get(k))
      .filter((id): id is string => Boolean(id));

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

export async function listPermissionsForCompany(companyId: string) {
  const roles = await prisma.role.findMany({
    where: { companyId },
    include: { rolePermissions: { include: { permission: true } } },
    orderBy: { key: 'asc' },
  });
  return roles.map((r) => ({
    role: r.key,
    name: r.name,
    permissions: r.rolePermissions.map((rp) => rp.permission.key),
  }));
}
