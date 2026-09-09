import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@hermes.ia';
const DEMO_PASSWORD = 'hermes123';

const PERMISSIONS: Record<string, string> = {
  'company.read': 'Ver empresa', 'company.update': 'Editar empresa',
  'user.read': 'Ver usuarios', 'user.create': 'Criar usuarios', 'user.update': 'Editar usuarios', 'user.delete': 'Remover usuarios',
  'customer.read': 'Ver clientes', 'customer.create': 'Criar clientes', 'customer.update': 'Editar clientes', 'customer.delete': 'Excluir clientes',
  'supplier.read': 'Ver fornecedores', 'supplier.create': 'Criar fornecedores', 'supplier.update': 'Editar fornecedores', 'supplier.delete': 'Excluir fornecedores',
  'category.read': 'Ver categorias', 'category.manage': 'Gerenciar categorias',
  'product.read': 'Ver produtos', 'product.create': 'Criar produtos', 'product.update': 'Editar produtos', 'product.delete': 'Excluir produtos',
  'inventory.read': 'Ver estoque', 'inventory.move': 'Movimentar estoque',
  'sale.read': 'Ver vendas', 'sale.read.own': 'Ver proprias vendas', 'sale.create': 'Criar vendas', 'sale.cancel': 'Cancelar vendas',
  'finance.read': 'Ver financeiro', 'finance.create': 'Lancar financeiro', 'finance.manage': 'Gerenciar contas',
  'charge.read': 'Ver cobrancas', 'charge.manage': 'Gerenciar cobrancas',
  'appointment.read': 'Ver agenda', 'appointment.manage': 'Gerenciar agenda',
  'report.read': 'Ver relatorios', 'report.finance.read': 'Ver relatorios financeiros',
  'automation.read': 'Ver automacoes', 'automation.manage': 'Gerenciar automacoes',
  'integration.read': 'Ver integracoes', 'integration.manage': 'Gerenciar integracoes',
  'notification.read': 'Ver notificacoes', 'audit.read': 'Ver auditoria', 'ai.use': 'Usar Hermes', 'lgpd.manage': 'Gerenciar LGPD',
};

const MATRIX: Record<string, string[]> = {
  ADMIN: Object.keys(PERMISSIONS),
  MANAGER: ['company.read', 'user.read', 'customer.read', 'customer.create', 'customer.update', 'customer.delete', 'supplier.read', 'supplier.create', 'supplier.update', 'supplier.delete', 'category.read', 'category.manage', 'product.read', 'product.create', 'product.update', 'product.delete', 'inventory.read', 'inventory.move', 'sale.read', 'sale.create', 'sale.cancel', 'finance.read', 'finance.create', 'finance.manage', 'charge.read', 'charge.manage', 'appointment.read', 'appointment.manage', 'report.read', 'report.finance.read', 'automation.read', 'integration.read', 'notification.read', 'ai.use'],
  SELLER: ['company.read', 'customer.read', 'customer.create', 'customer.update', 'product.read', 'inventory.read', 'sale.read.own', 'sale.create', 'appointment.read', 'appointment.manage', 'report.read', 'notification.read', 'ai.use'],
  FINANCE: ['company.read', 'customer.read', 'supplier.read', 'product.read', 'sale.read', 'finance.read', 'finance.create', 'finance.manage', 'charge.read', 'charge.manage', 'report.read', 'report.finance.read', 'appointment.read', 'notification.read', 'audit.read', 'ai.use'],
};

const PLANS = [
  { code: 'BASIC', name: 'Basic', priceCents: 0, maxUsers: 3, features: { aiMessagesPerMonth: 500 } },
  { code: 'PRO', name: 'Pro', priceCents: 14900, maxUsers: 10, features: { aiMessagesPerMonth: 5000 } },
  { code: 'BUSINESS', name: 'Business', priceCents: 39900, maxUsers: 50, features: { aiMessagesPerMonth: 50000 } },
];

async function main() {
  // Planos + catalogo de permissoes (global)
  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  }
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }

  if (await prisma.user.findFirst({ where: { email: DEMO_EMAIL } })) {
    // eslint-disable-next-line no-console
    console.log('Seed: empresa demo ja existe. Planos/permissoes sincronizados.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const basic = await prisma.plan.findUnique({ where: { code: 'BASIC' } });
  const permissions = await prisma.permission.findMany();
  const permByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const company = await prisma.company.create({
    data: {
      name: 'Loja Demo HERMES',
      segment: 'Varejo',
      document: '00.000.000/0001-00',
      phone: '(11) 90000-0000',
      onboardedAt: new Date(),
      subscription: { create: { planId: basic?.id, status: 'TRIALING' } },
      users: {
        create: [
          { name: 'Dono Demo', email: DEMO_EMAIL, passwordHash, role: 'ADMIN' },
          { name: 'Vendedor Demo', email: 'vendedor@hermes.ia', passwordHash, role: 'SELLER' },
          { name: 'Financeiro Demo', email: 'financeiro@hermes.ia', passwordHash, role: 'FINANCE' },
        ],
      },
      financialCategories: {
        create: [
          { name: 'Vendas', direction: 'IN' },
          { name: 'Servicos', direction: 'IN' },
          { name: 'Fornecedores', direction: 'OUT' },
          { name: 'Energia', direction: 'OUT' },
          { name: 'Agua', direction: 'OUT' },
          { name: 'Aluguel', direction: 'OUT' },
          { name: 'Salarios', direction: 'OUT' },
          { name: 'Outras despesas', direction: 'OUT' },
        ],
      },
    },
    include: { users: true },
  });

  // Roles + role-permissions
  for (const [key, keys] of Object.entries(MATRIX)) {
    const role = await prisma.role.create({
      data: { companyId: company.id, key: key as never, name: key, system: true },
    });
    await prisma.rolePermission.createMany({
      data: keys.map((k) => permByKey.get(k)).filter(Boolean).map((permissionId) => ({ roleId: role.id, permissionId: permissionId as string })),
      skipDuplicates: true,
    });
  }
  for (const u of company.users) {
    const role = await prisma.role.findUnique({ where: { companyId_key: { companyId: company.id, key: u.role } } });
    if (role) await prisma.user.update({ where: { id: u.id }, data: { roleRefId: role.id } });
  }

  const seller = company.users.find((u) => u.role === 'SELLER')!;
  const [maria, joao] = await Promise.all([
    prisma.customer.create({ data: { companyId: company.id, name: 'Maria Souza', phone: '(11) 91111-1111', whatsapp: '11911111111' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Joao Pereira', phone: '(11) 92222-2222', whatsapp: '11922222222' } }),
  ]);

  const supplier = await prisma.supplier.create({ data: { companyId: company.id, name: 'Fornecedor XYZ', phone: '(11) 93333-3333' } });
  const category = await prisma.productCategory.create({ data: { companyId: company.id, name: 'Vestuario' } });

  const camisa = await prisma.product.create({
    data: {
      companyId: company.id, name: 'Camisa Basica', price: 80, cost: 35, categoryId: category.id, supplierId: supplier.id,
      inventory: { create: { companyId: company.id, quantity: 40, minQuantity: 10 } },
    },
  });
  const bone = await prisma.product.create({
    data: {
      companyId: company.id, name: 'Bone Trucker', price: 50, cost: 20, categoryId: category.id,
      inventory: { create: { companyId: company.id, quantity: 8, minQuantity: 10 } },
    },
  });

  const vendas = await prisma.financialCategory.findFirst({ where: { companyId: company.id, name: 'Vendas' } });

  // Venda paga
  const sale = await prisma.sale.create({
    data: {
      companyId: company.id, number: 1, customerId: maria.id, sellerId: seller.id, status: 'PAID',
      paymentMethod: 'PIX', subtotal: 160, discount: 0, total: 160, paidAmount: 160,
      items: { create: [{ productId: camisa.id, description: 'Camisa Basica', quantity: 2, unitPrice: 80, total: 160 }] },
    },
  });
  await prisma.inventory.update({ where: { productId: camisa.id }, data: { quantity: { decrement: 2 } } });
  await prisma.inventoryMovement.create({
    data: { companyId: company.id, productId: camisa.id, type: 'SALE', quantity: 2, balanceAfter: 38, reference: 'Venda #1', saleId: sale.id },
  });
  await prisma.income.create({
    data: { companyId: company.id, amount: 160, description: 'Venda #1', categoryId: vendas?.id, method: 'PIX', saleId: sale.id },
  });
  await prisma.payment.create({
    data: { companyId: company.id, amount: 160, method: 'PIX', direction: 'IN', saleId: sale.id },
  });

  // Venda fiada -> conta a receber vencida
  const fiada = await prisma.sale.create({
    data: {
      companyId: company.id, number: 2, customerId: joao.id, sellerId: seller.id, status: 'CONFIRMED',
      subtotal: 150, discount: 0, total: 150, paidAmount: 0,
      items: { create: [{ productId: bone.id, description: 'Bone Trucker', quantity: 3, unitPrice: 50, total: 150 }] },
    },
  });
  await prisma.inventory.update({ where: { productId: bone.id }, data: { quantity: { decrement: 3 } } });
  await prisma.accountReceivable.create({
    data: {
      companyId: company.id, customerId: joao.id, saleId: fiada.id, description: 'Venda #2', amount: 150, paidAmount: 0,
      status: 'OPEN', dueDate: new Date(Date.now() - 3 * 86400000),
    },
  });

  // Despesa + conta a pagar
  const energia = await prisma.financialCategory.findFirst({ where: { companyId: company.id, name: 'Energia' } });
  await prisma.expense.create({ data: { companyId: company.id, amount: 120, description: 'Conta de energia', categoryId: energia?.id } });
  await prisma.accountPayable.create({
    data: { companyId: company.id, supplierId: supplier.id, description: 'Compra de mercadoria', amount: 500, status: 'OPEN', dueDate: new Date(Date.now() + 86400000) },
  });

  // Automacao de exemplo
  await prisma.automation.create({
    data: { companyId: company.id, name: 'Alerta diario', trigger: 'schedule.daily', action: 'notify', active: true },
  });

  // eslint-disable-next-line no-console
  console.log(`Seed concluido.
  Empresa: ${company.name}
  ADMIN:      ${DEMO_EMAIL} / ${DEMO_PASSWORD}
  SELLER:     vendedor@hermes.ia / ${DEMO_PASSWORD}
  FINANCE:    financeiro@hermes.ia / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
