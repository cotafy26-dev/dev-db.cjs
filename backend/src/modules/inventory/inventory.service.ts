import type { StockMovementType } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { Db } from '../../core/prisma-types';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentUserId } from '../../core/context';
import { tenantWhere } from '../../core/tenant';
import { qty } from '../../core/money';
import { toSkipTake, type Pagination } from '../../core/pagination';

interface MoveInput {
  productId: string;
  type: StockMovementType;
  /** magnitude positiva */
  quantity: number;
  reason?: string;
  saleId?: string;
}

/**
 * Aplica movimento de estoque de forma atomica: atualiza Product.stock e grava
 * StockMovement. Use dentro de uma transacao ao compor com vendas.
 */
export async function applyStockMovement(input: MoveInput, tx: Db = prisma) {
  const magnitude = qty(input.quantity);
  if (magnitude.lessThanOrEqualTo(0)) {
    throw new ValidationError('Quantidade do movimento deve ser positiva');
  }

  const product = await tx.product.findFirst({ where: tenantWhere({ id: input.productId }) });
  if (!product) throw new NotFoundError('Produto', input.productId);

  const delta =
    input.type === 'IN'
      ? magnitude
      : input.type === 'OUT'
        ? magnitude.negated()
        : magnitude.minus(product.stock); // ADJUST: quantity = saldo alvo

  const balanceAfter = product.stock.plus(delta);
  if (balanceAfter.lessThan(0)) {
    throw new ValidationError(
      `Estoque insuficiente de "${product.name}": disponivel ${product.stock.toNumber()}, solicitado ${magnitude.toNumber()}`,
    );
  }

  await tx.product.update({ where: { id: product.id }, data: { stock: balanceAfter } });
  const movement = await tx.stockMovement.create({
    data: {
      companyId: product.companyId,
      productId: product.id,
      type: input.type,
      quantity: input.type === 'ADJUST' ? balanceAfter : magnitude,
      balanceAfter,
      reason: input.reason ?? null,
      saleId: input.saleId ?? null,
      createdBy: currentUserId(),
    },
  });

  return { movement, balanceAfter: balanceAfter.toNumber(), product: { id: product.id, name: product.name } };
}

export async function listMovements(p: Pagination & { productId?: string }) {
  const where = tenantWhere(p.productId ? { productId: p.productId } : undefined);
  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, unit: true } } },
      ...toSkipTake(p),
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { items, total };
}
