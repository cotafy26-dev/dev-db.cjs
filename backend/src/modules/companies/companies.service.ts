import { prisma } from '../../core/prisma';
import { currentCompanyId } from '../../core/context';
import { scope } from '../../core/tenant';
import { audit } from '../../core/audit';

export async function getCompany() {
  return prisma.company.findUniqueOrThrow({
    where: { id: currentCompanyId() },
    include: { subscription: { include: { plan: true } } },
  });
}

export interface CompanyUpdate {
  name?: string;
  document?: string | null;
  segment?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  currency?: string;
  retentionDays?: number;
}

export async function updateCompany(input: CompanyUpdate) {
  const before = await getCompany();
  const company = await prisma.company.update({ where: { id: currentCompanyId() }, data: input });
  await audit({ action: 'company.update', entityType: 'Company', entityId: company.id, before, after: input });
  return company;
}

export async function completeOnboarding() {
  return prisma.company.update({ where: { id: currentCompanyId() }, data: { onboardedAt: new Date() } });
}

// -------- LGPD (secao 44) --------

/** Exporta os dados do tenant (portabilidade). */
export async function exportCompanyData() {
  const companyId = currentCompanyId();
  const [company, users, customers, suppliers, products, sales, incomes, expenses, receivables, payables, appointments] =
    await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.user.findMany({ where: { companyId }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.supplier.findMany({ where: { companyId } }),
      prisma.product.findMany({ where: { companyId }, include: { inventory: true } }),
      prisma.sale.findMany({ where: { companyId }, include: { items: true } }),
      prisma.income.findMany({ where: { companyId } }),
      prisma.expense.findMany({ where: { companyId } }),
      prisma.accountReceivable.findMany({ where: { companyId } }),
      prisma.accountPayable.findMany({ where: { companyId } }),
      prisma.appointment.findMany({ where: { companyId } }),
    ]);
  await audit({ action: 'lgpd.export', entityType: 'Company', entityId: companyId, summary: 'Exportacao de dados' });
  return {
    exportedAt: new Date().toISOString(),
    company,
    users,
    customers,
    suppliers,
    products,
    sales,
    incomes,
    expenses,
    receivables,
    payables,
    appointments,
  };
}

/** Anonimiza / marca um cliente para exclusao (direito de eliminacao). */
export async function eraseCustomer(customerId: string) {
  const c = await prisma.customer.findFirst({ where: { ...scope(), id: customerId } });
  if (!c) return;
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: 'Cliente removido (LGPD)',
      phone: null,
      whatsapp: null,
      email: null,
      document: null,
      addressLine: null,
      city: null,
      state: null,
      zip: null,
      notes: null,
      deletedAt: new Date(),
      active: false,
    },
  });
  await audit({ action: 'lgpd.erase', entityType: 'Customer', entityId: customerId, summary: 'Anonimizacao de cliente' });
}
