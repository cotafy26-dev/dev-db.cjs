import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@hermes.ia';
const DEMO_PASSWORD = 'hermes123';

async function main() {
  const existing = await prisma.user.findFirst({ where: { email: DEMO_EMAIL }, include: { company: true } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Seed: empresa demo ja existe (${existing.company.name}). Nada a fazer.`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const company = await prisma.company.create({
    data: {
      name: 'Loja Demo HERMES',
      document: '00.000.000/0001-00',
      phone: '(11) 90000-0000',
      users: {
        create: { name: 'Dono Demo', email: DEMO_EMAIL, passwordHash, role: 'OWNER' },
      },
      subscription: { create: { plan: 'trial', status: 'TRIALING' } },
      financeCategories: {
        create: [
          { name: 'Vendas', type: 'INCOME' },
          { name: 'Servicos', type: 'INCOME' },
          { name: 'Fornecedores', type: 'EXPENSE' },
          { name: 'Combustivel', type: 'EXPENSE' },
          { name: 'Aluguel', type: 'EXPENSE' },
          { name: 'Salarios', type: 'EXPENSE' },
          { name: 'Outros', type: 'EXPENSE' },
        ],
      },
    },
  });

  const [maria, joao] = await Promise.all([
    prisma.customer.create({ data: { companyId: company.id, name: 'Maria Souza', phone: '(11) 91111-1111' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Joao Pereira', phone: '(11) 92222-2222' } }),
  ]);

  const [camisa, bone] = await Promise.all([
    prisma.product.create({
      data: { companyId: company.id, name: 'Camisa Basica', price: 80, cost: 35, stock: 40, minStock: 10 },
    }),
    prisma.product.create({
      data: { companyId: company.id, name: 'Bone Trucker', price: 50, cost: 20, stock: 8, minStock: 10 },
    }),
  ]);

  // Venda a vista
  const vendas = await prisma.financeCategory.findFirst({ where: { companyId: company.id, name: 'Vendas' } });
  const sale = await prisma.sale.create({
    data: {
      companyId: company.id,
      customerId: maria.id,
      number: 1,
      status: 'PAID',
      paymentMethod: 'PIX',
      subtotal: 160,
      discount: 0,
      total: 160,
      paidAmount: 160,
      items: {
        create: [{ productId: camisa.id, description: 'Camisa Basica', quantity: 2, unitPrice: 80, total: 160 }],
      },
    },
  });
  await prisma.product.update({ where: { id: camisa.id }, data: { stock: { decrement: 2 } } });
  await prisma.stockMovement.create({
    data: { companyId: company.id, productId: camisa.id, type: 'OUT', quantity: 2, balanceAfter: 38, reason: 'Venda #1', saleId: sale.id },
  });
  await prisma.financeTransaction.create({
    data: {
      companyId: company.id,
      type: 'INCOME',
      amount: 160,
      description: 'Venda #1',
      categoryId: vendas?.id ?? null,
      paymentMethod: 'PIX',
      saleId: sale.id,
    },
  });

  // Venda fiada -> conta a receber
  const fiada = await prisma.sale.create({
    data: {
      companyId: company.id,
      customerId: joao.id,
      number: 2,
      status: 'PENDING',
      subtotal: 150,
      discount: 0,
      total: 150,
      paidAmount: 0,
      items: { create: [{ productId: bone.id, description: 'Bone Trucker', quantity: 3, unitPrice: 50, total: 150 }] },
    },
  });
  await prisma.product.update({ where: { id: bone.id }, data: { stock: { decrement: 3 } } });
  await prisma.receivable.create({
    data: {
      companyId: company.id,
      customerId: joao.id,
      saleId: fiada.id,
      description: 'Venda #2',
      amount: 150,
      paidAmount: 0,
      status: 'OPEN',
      dueDate: new Date(Date.now() + 3 * 86400000),
    },
  });

  // Despesa + conta a pagar
  const combustivel = await prisma.financeCategory.findFirst({ where: { companyId: company.id, name: 'Combustivel' } });
  await prisma.financeTransaction.create({
    data: { companyId: company.id, type: 'EXPENSE', amount: 150, description: 'Abastecimento', categoryId: combustivel?.id ?? null },
  });
  await prisma.payable.create({
    data: {
      companyId: company.id,
      supplierName: 'Fornecedor XYZ',
      description: 'Compra de mercadoria',
      amount: 500,
      status: 'OPEN',
      dueDate: new Date(Date.now() + 1 * 86400000),
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seed concluido.
  Empresa: ${company.name}
  Login:   ${DEMO_EMAIL}
  Senha:   ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
