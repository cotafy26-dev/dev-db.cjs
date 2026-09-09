import { prisma } from '../../core/prisma';

/** Planos SaaS (secao 43). priceCents apenas informativo nesta versao. */
export const PLAN_SEED = [
  {
    code: 'BASIC',
    name: 'Basic',
    priceCents: 0,
    maxUsers: 3,
    features: { aiMessagesPerMonth: 500, automations: 3, channels: ['WEB', 'TELEGRAM'], storageMB: 200 },
  },
  {
    code: 'PRO',
    name: 'Pro',
    priceCents: 14900,
    maxUsers: 10,
    features: { aiMessagesPerMonth: 5000, automations: 20, channels: ['WEB', 'TELEGRAM', 'WHATSAPP'], storageMB: 2000 },
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    priceCents: 39900,
    maxUsers: 50,
    features: { aiMessagesPerMonth: 50000, automations: 200, channels: ['WEB', 'TELEGRAM', 'WHATSAPP'], storageMB: 20000 },
  },
];

export async function ensurePlans(): Promise<void> {
  await prisma.$transaction(
    PLAN_SEED.map((p) =>
      prisma.plan.upsert({
        where: { code: p.code },
        update: { name: p.name, priceCents: p.priceCents, maxUsers: p.maxUsers, features: p.features },
        create: p,
      }),
    ),
  );
}

export async function listPlans() {
  return prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
}

export async function getPlanByCode(code: string) {
  return prisma.plan.findUnique({ where: { code } });
}
