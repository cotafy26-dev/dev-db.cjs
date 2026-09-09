import type { ChannelType } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { scope } from '../../core/tenant';
import { OPEN_ACCOUNTS } from '../../core/constants';
import { formatBRL, toNumber } from '../../core/money';
import { dayjs } from '../../core/dates';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { sendToLinkedChannel } from '../../integrations/outbound';

/** Clientes em atraso (secao 14). */
export async function overdueCustomers() {
  const rows = await prisma.accountReceivable.findMany({
    where: { ...scope(), status: { in: OPEN_ACCOUNTS }, dueDate: { not: null, lt: new Date() } },
    include: { customer: { select: { id: true, name: true, phone: true, whatsapp: true } } },
    orderBy: { dueDate: 'asc' },
  });
  return rows.map((r) => ({
    accountReceivableId: r.id,
    customerId: r.customerId,
    customer: r.customer?.name ?? 'Sem cliente',
    phone: r.customer?.whatsapp ?? r.customer?.phone ?? null,
    description: r.description,
    amount: toNumber(r.amount) - toNumber(r.paidAmount),
    dueDate: r.dueDate,
    daysLate: r.dueDate ? dayjs().diff(dayjs(r.dueDate), 'day') : 0,
  }));
}

export function buildChargeMessage(params: {
  companyName: string;
  customerName: string;
  amount: number;
  dueDate?: Date | null;
}): string {
  const venc = params.dueDate ? dayjs(params.dueDate).format('DD/MM/YYYY') : 'a combinar';
  return (
    `Ola, ${params.customerName}! Aqui e da ${params.companyName}.\n` +
    `Consta em aberto o valor de ${formatBRL(params.amount)} com vencimento em ${venc}.\n` +
    `Se ja efetuou o pagamento, por favor desconsidere. Qualquer duvida estamos a disposicao. Obrigado!`
  );
}

export async function createCharge(input: {
  accountReceivableId: string;
  channel?: ChannelType | null;
  autoReminder?: boolean;
  message?: string;
}) {
  const ar = await prisma.accountReceivable.findFirst({
    where: { ...scope(), id: input.accountReceivableId },
    include: { customer: true, company: { select: { name: true } } },
  });
  if (!ar) throw new NotFoundError('Conta a receber', input.accountReceivableId);
  if (!OPEN_ACCOUNTS.includes(ar.status)) throw new ValidationError('Conta ja quitada ou cancelada');

  const open = toNumber(ar.amount) - toNumber(ar.paidAmount);
  const message =
    input.message ??
    buildChargeMessage({
      companyName: ar.company.name,
      customerName: ar.customer?.name ?? 'cliente',
      amount: open,
      dueDate: ar.dueDate,
    });

  const charge = await prisma.charge.create({
    data: {
      companyId: currentCompanyId(),
      accountReceivableId: ar.id,
      customerId: ar.customerId,
      amount: open,
      dueDate: ar.dueDate,
      channel: input.channel ?? null,
      message,
      autoReminder: input.autoReminder ?? false,
      createdById: currentUserId(),
    },
  });
  await audit({ action: 'charge.create', entityType: 'Charge', entityId: charge.id, summary: `${ar.customer?.name} ${formatBRL(open)}` });
  return charge;
}

export async function listCharges(p: Pagination & { status?: string }) {
  const where = { ...scope(), ...(p.status ? { status: p.status as never } : {}) };
  const [items, total] = await Promise.all([
    prisma.charge.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(p) }),
    prisma.charge.count({ where }),
  ]);
  return { items, total };
}

/** Registra o envio da cobranca pelo canal disponivel (secao 14). */
export async function sendCharge(id: string) {
  const charge = await prisma.charge.findFirst({
    where: { ...scope(), id },
    include: { accountReceivable: { include: { customer: true } } },
  });
  if (!charge) throw new NotFoundError('Cobranca', id);
  const customer = charge.accountReceivable.customer;

  let delivered = false;
  if (customer) {
    delivered = await sendToLinkedChannel({
      customerPhone: customer.whatsapp ?? customer.phone ?? null,
      text: charge.message ?? 'Cobranca',
    });
  }

  const updated = await prisma.charge.update({
    where: { id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      remindersSent: { increment: 1 },
      lastReminderAt: new Date(),
    },
  });
  await audit({ action: 'charge.send', entityType: 'Charge', entityId: id, summary: delivered ? 'enviada' : 'registrada (sem canal)' });
  return { ...updated, delivered };
}

export async function cancelCharge(id: string) {
  const charge = await prisma.charge.findFirst({ where: { ...scope(), id } });
  if (!charge) throw new NotFoundError('Cobranca', id);
  await prisma.charge.update({ where: { id }, data: { status: 'CANCELED' } });
}

/** Marca cobrancas de uma conta como pagas quando o recebivel e quitado. */
export async function settleChargesForReceivable(accountReceivableId: string) {
  await prisma.charge.updateMany({
    where: { accountReceivableId, status: { in: ['PENDING', 'SENT'] } },
    data: { status: 'PAID', paidAt: new Date() },
  });
}
