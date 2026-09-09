import type { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentRole, currentUserId } from '../../core/context';
import { scope } from '../../core/tenant';
import type { Db } from '../../core/prisma-types';
import { money, qty, toNumber } from '../../core/money';
import { dayRange, DEFAULT_TZ } from '../../core/dates';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';
import { applyMovement } from '../inventory/inventory.service';
import { notify } from '../notifications/notifications.service';

export interface SaleItemInput {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
}

export interface CreateSaleInput {
  items: SaleItemInput[];
  customerId?: string | null;
  sellerId?: string | null;
  paymentMethod?: PaymentMethod | null;
  discount?: number;
  /** valor pago agora (0 = tudo fiado) */
  paidAmount?: number;
  note?: string | null;
  soldAt?: Date;
  dueDate?: Date | null;
}

/** Vendedor so enxerga as proprias vendas (secao 6). */
function sellerFilter(): Prisma.SaleWhereInput {
  if (currentRole() === 'SELLER') {
    const uid = currentUserId();
    return { OR: [{ sellerId: uid }, { createdById: uid }] };
  }
  return {};
}

async function nextSaleNumber(tx: Db, companyId: string): Promise<number> {
  const last = await tx.sale.findFirst({
    where: { companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function createSale(input: CreateSaleInput) {
  if (!input.items?.length) throw new ValidationError('Venda precisa de ao menos 1 item');
  const companyId = currentCompanyId();
  const sellerId = input.sellerId ?? currentUserId();

  const sale = await prisma.$transaction(async (tx) => {
    const resolved = [];
    for (const raw of input.items) {
      let description = raw.description?.trim();
      let unitPrice = raw.unitPrice;
      let productId = raw.productId ?? undefined;

      if (productId) {
        const product = await tx.product.findFirst({ where: { ...scope(), id: productId, deletedAt: null } });
        if (!product) throw new NotFoundError('Produto', productId);
        description = description || product.name;
        unitPrice = unitPrice ?? product.price.toNumber();
      }
      if (!description) throw new ValidationError('Item sem descricao nem produto');
      if (unitPrice == null) throw new ValidationError(`Preco nao informado para "${description}"`);

      const lineDiscount = money(raw.discount ?? 0);
      resolved.push({
        productId,
        description,
        quantity: qty(raw.quantity),
        unitPrice: money(unitPrice),
        discount: lineDiscount,
        total: money(raw.quantity * unitPrice).minus(lineDiscount),
      });
    }

    const subtotal = resolved.reduce((acc, i) => acc.plus(i.total), money(0));
    const discount = money(input.discount ?? 0);
    const total = subtotal.minus(discount);
    if (total.lessThan(0)) throw new ValidationError('Desconto maior que o subtotal');

    const paidAmount = input.paidAmount != null ? money(input.paidAmount) : total;
    if (paidAmount.lessThan(0) || paidAmount.greaterThan(total)) {
      throw new ValidationError('Valor pago invalido');
    }
    const status = paidAmount.greaterThanOrEqualTo(total)
      ? 'PAID'
      : paidAmount.greaterThan(0)
        ? 'PARTIAL'
        : 'CONFIRMED';

    const number = await nextSaleNumber(tx, companyId);

    const createdSale = await tx.sale.create({
      data: {
        companyId,
        number,
        customerId: input.customerId ?? null,
        sellerId,
        status,
        paymentMethod: input.paymentMethod ?? null,
        subtotal,
        discount,
        total,
        paidAmount,
        note: input.note ?? null,
        soldAt: input.soldAt ?? new Date(),
        createdById: currentUserId(),
        items: {
          create: resolved.map((i) => ({
            productId: i.productId ?? null,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
            total: i.total,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });

    // Baixa de estoque
    for (const i of resolved) {
      if (i.productId) {
        await applyMovement(
          { productId: i.productId, type: 'SALE', quantity: i.quantity.toNumber(), reference: `Venda #${number}`, saleId: createdSale.id },
          tx,
        );
      }
    }

    // Financeiro: receita + pagamento do valor pago
    if (paidAmount.greaterThan(0)) {
      const category = await tx.financialCategory.findFirst({
        where: { ...scope(), direction: 'IN', name: 'Vendas' },
      });
      await tx.income.create({
        data: {
          companyId,
          amount: paidAmount,
          description: `Venda #${number}`,
          categoryId: category?.id ?? null,
          method: input.paymentMethod ?? null,
          receivedAt: input.soldAt ?? new Date(),
          saleId: createdSale.id,
          createdById: currentUserId(),
        },
      });
      await tx.payment.create({
        data: {
          companyId,
          amount: paidAmount,
          method: input.paymentMethod ?? 'OTHER',
          direction: 'IN',
          paidAt: input.soldAt ?? new Date(),
          saleId: createdSale.id,
          createdById: currentUserId(),
        },
      });
    }

    // Conta a receber pelo saldo em aberto
    const openAmount = total.minus(paidAmount);
    if (openAmount.greaterThan(0)) {
      await tx.accountReceivable.create({
        data: {
          companyId,
          customerId: input.customerId ?? null,
          saleId: createdSale.id,
          description: `Venda #${number}`,
          amount: total,
          paidAmount,
          dueDate: input.dueDate ?? null,
          status: paidAmount.greaterThan(0) ? 'PARTIAL' : 'OPEN',
          createdById: currentUserId(),
        },
      });
    }

    return createdSale;
  });

  await audit({
    action: 'sale.create',
    entityType: 'Sale',
    entityId: sale.id,
    summary: `Venda #${sale.number} - ${sale.total.toString()}`,
    after: { number: sale.number, total: toNumber(sale.total), status: sale.status },
  });
  await notify({
    type: 'SYSTEM',
    title: `Nova venda #${sale.number}`,
    body: `Total ${sale.total.toString()} (${sale.status})`,
  });

  return sale;
}

export async function cancelSale(id: string, reason?: string) {
  const sale = await prisma.sale.findFirst({
    where: { ...scope(), id, ...sellerFilter() },
    include: { items: true },
  });
  if (!sale) throw new NotFoundError('Venda', id);
  if (sale.status === 'CANCELED') throw new ValidationError('Venda ja esta cancelada');

  await prisma.$transaction(async (tx) => {
    // Estorna estoque
    for (const item of sale.items) {
      if (item.productId) {
        await applyMovement(
          {
            productId: item.productId,
            type: 'RETURN',
            quantity: toNumber(item.quantity),
            reference: `Cancelamento venda #${sale.number}`,
            reason: reason ?? 'Cancelamento de venda',
            saleId: sale.id,
          },
          tx,
        );
      }
    }
    // Estorna financeiro
    await tx.income.updateMany({
      where: { companyId: sale.companyId, saleId: sale.id, canceledAt: null },
      data: { canceledAt: new Date() },
    });
    await tx.accountReceivable.updateMany({
      where: { companyId: sale.companyId, saleId: sale.id },
      data: { status: 'CANCELED' },
    });
    await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'CANCELED', canceledAt: new Date(), cancelReason: reason ?? null },
    });
  });

  await audit({
    action: 'sale.cancel',
    entityType: 'Sale',
    entityId: sale.id,
    summary: `Venda #${sale.number} cancelada`,
    before: { status: sale.status },
    after: { status: 'CANCELED', reason },
  });

  return { id: sale.id, number: sale.number, status: 'CANCELED' as const };
}

export async function listSales(p: Pagination & { from?: Date; to?: Date; customerId?: string; status?: string }) {
  const where: Prisma.SaleWhereInput = {
    ...scope(),
    ...sellerFilter(),
    ...(p.customerId ? { customerId: p.customerId } : {}),
    ...(p.status ? { status: p.status as never } : {}),
    ...(p.from || p.to
      ? { soldAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      include: {
        items: true,
        customer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
      },
      ...toSkipTake(p),
    }),
    prisma.sale.count({ where }),
  ]);
  return { items, total };
}

export async function getSale(id: string) {
  const sale = await prisma.sale.findFirst({
    where: { ...scope(), id, ...sellerFilter() },
    include: { items: true, customer: true, seller: { select: { id: true, name: true } }, payments: true, accountReceivable: true },
  });
  if (!sale) throw new NotFoundError('Venda', id);
  return sale;
}

export interface SalesSummary {
  count: number;
  gross: number;
  received: number;
  pending: number;
}

export async function salesSummary(range: { from: Date; to: Date }): Promise<SalesSummary> {
  const rows = await prisma.sale.findMany({
    where: { ...scope(), ...sellerFilter(), soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } },
    select: { total: true, paidAmount: true },
  });
  const gross = rows.reduce((a, r) => a + toNumber(r.total), 0);
  const received = rows.reduce((a, r) => a + toNumber(r.paidAmount), 0);
  return { count: rows.length, gross, received, pending: gross - received };
}

export async function salesToday(tz = DEFAULT_TZ): Promise<SalesSummary> {
  return salesSummary(dayRange(new Date(), tz));
}
