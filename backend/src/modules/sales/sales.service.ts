import type { PaymentMethod } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { tenantWhere } from '../../core/tenant';
import { money, qty, toNumber } from '../../core/money';
import { dayRange, DEFAULT_TZ } from '../../core/dates';
import { toSkipTake, type Pagination } from '../../core/pagination';
import type { Db } from '../../core/prisma-types';
import { applyStockMovement } from '../inventory/inventory.service';

export interface SaleItemInput {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

export interface CreateSaleInput {
  items: SaleItemInput[];
  customerId?: string | null;
  paymentMethod?: PaymentMethod | null;
  discount?: number;
  /** 'PAID' = a vista | 'PENDING' = fiado | 'PARTIAL' = pago em parte */
  status?: 'PAID' | 'PENDING' | 'PARTIAL';
  paidAmount?: number;
  note?: string | null;
  soldAt?: Date;
  dueDate?: Date | null;
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

  return prisma.$transaction(async (tx) => {
    // Resolve itens (produto -> preco/descricao)
    const resolved = [];
    for (const raw of input.items) {
      let description = raw.description?.trim();
      let unitPrice = raw.unitPrice;
      let productId = raw.productId ?? undefined;

      if (productId) {
        const product = await tx.product.findFirst({ where: tenantWhere({ id: productId }) });
        if (!product) throw new NotFoundError('Produto', productId);
        description = description || product.name;
        unitPrice = unitPrice ?? product.price.toNumber();
      }
      if (!description) throw new ValidationError('Item sem descricao nem produto');
      if (unitPrice == null) throw new ValidationError(`Preco nao informado para "${description}"`);

      resolved.push({
        productId,
        description,
        quantity: qty(raw.quantity),
        unitPrice: money(unitPrice),
        total: money(raw.quantity * unitPrice),
      });
    }

    const subtotal = resolved.reduce((acc, i) => acc.plus(i.total), money(0));
    const discount = money(input.discount ?? 0);
    const total = subtotal.minus(discount);
    if (total.lessThan(0)) throw new ValidationError('Desconto maior que o subtotal');

    const status = input.status ?? 'PAID';
    const paidAmount =
      status === 'PAID' ? total : status === 'PARTIAL' ? money(input.paidAmount ?? 0) : money(0);
    if (status === 'PARTIAL' && (paidAmount.lessThanOrEqualTo(0) || paidAmount.greaterThanOrEqualTo(total))) {
      throw new ValidationError('Valor parcial deve ser > 0 e < total');
    }

    const number = await nextSaleNumber(tx, companyId);

    const sale = await tx.sale.create({
      data: {
        companyId,
        customerId: input.customerId ?? null,
        number,
        status,
        paymentMethod: input.paymentMethod ?? null,
        subtotal,
        discount,
        total,
        paidAmount,
        note: input.note ?? null,
        soldAt: input.soldAt ?? new Date(),
        createdBy: currentUserId(),
        items: {
          create: resolved.map((i) => ({
            productId: i.productId ?? null,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });

    // Baixa de estoque (apenas itens com produto)
    for (const i of resolved) {
      if (i.productId) {
        await applyStockMovement(
          { productId: i.productId, type: 'OUT', quantity: i.quantity.toNumber(), reason: `Venda #${number}`, saleId: sale.id },
          tx,
        );
      }
    }

    // Lancamento financeiro do valor pago
    if (paidAmount.greaterThan(0)) {
      const category = await tx.financeCategory.findFirst({
        where: tenantWhere({ type: 'INCOME', name: 'Vendas' }),
      });
      await tx.financeTransaction.create({
        data: {
          companyId,
          type: 'INCOME',
          amount: paidAmount,
          description: `Venda #${number}`,
          categoryId: category?.id ?? null,
          paymentMethod: input.paymentMethod ?? null,
          occurredAt: input.soldAt ?? new Date(),
          saleId: sale.id,
          createdBy: currentUserId(),
        },
      });
    }

    // Recebivel (fiado / parcial)
    if (status !== 'PAID') {
      await tx.receivable.create({
        data: {
          companyId,
          customerId: input.customerId ?? null,
          saleId: sale.id,
          description: `Venda #${number}`,
          amount: total,
          paidAmount,
          dueDate: input.dueDate ?? null,
          status: status === 'PARTIAL' ? 'PARTIAL' : 'OPEN',
        },
      });
    }

    return sale;
  });
}

export async function listSales(p: Pagination & { from?: Date; to?: Date; customerId?: string }) {
  const where = tenantWhere({
    ...(p.customerId ? { customerId: p.customerId } : {}),
    ...(p.from || p.to
      ? { soldAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } }
      : {}),
  });
  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      include: { items: true, customer: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.sale.count({ where }),
  ]);
  return { items, total };
}

export async function getSale(id: string) {
  const sale = await prisma.sale.findFirst({
    where: tenantWhere({ id }),
    include: { items: true, customer: true, receivable: true },
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
  const where = tenantWhere({ soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } });
  const rows = await prisma.sale.findMany({
    where,
    select: { total: true, paidAmount: true },
  });
  const gross = rows.reduce((a, r) => a + toNumber(r.total), 0);
  const received = rows.reduce((a, r) => a + toNumber(r.paidAmount), 0);
  return { count: rows.length, gross, received, pending: gross - received };
}

export async function salesToday(tz = DEFAULT_TZ): Promise<SalesSummary> {
  return salesSummary(dayRange(new Date(), tz));
}
