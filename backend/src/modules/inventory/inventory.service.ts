import type { InventoryMovementType } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { Db } from '../../core/prisma-types';
import { NotFoundError, ValidationError } from '../../core/errors';
import { currentUserId } from '../../core/context';
import { scope } from '../../core/tenant';
import { qty } from '../../core/money';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';

export interface MoveInput {
  productId: string;
  type: InventoryMovementType;
  /** magnitude positiva; para ADJUST e o saldo alvo */
  quantity: number;
  reason?: string;
  reference?: string;
  saleId?: string;
}

/**
 * Aplica movimento de estoque de forma atomica: atualiza Inventory.quantity e
 * grava InventoryMovement. Use dentro de uma transacao ao compor com vendas.
 */
export async function applyMovement(input: MoveInput, tx: Db = prisma) {
  const magnitude = qty(input.quantity);
  if (input.type !== 'ADJUST' && magnitude.lessThanOrEqualTo(0)) {
    throw new ValidationError('Quantidade do movimento deve ser positiva');
  }

  const product = await tx.product.findFirst({
    where: { ...scope(), id: input.productId, deletedAt: null },
    include: { inventory: true },
  });
  if (!product) throw new NotFoundError('Produto', input.productId);

  let inventory = product.inventory;
  if (!inventory) {
    inventory = await tx.inventory.create({
      data: { companyId: product.companyId, productId: product.id, quantity: qty(0), minQuantity: qty(0) },
    });
  }

  const current = inventory.quantity;
  const delta =
    input.type === 'ADJUST'
      ? magnitude.minus(current)
      : input.type === 'IN' || input.type === 'RETURN'
        ? magnitude
        : magnitude.negated(); // OUT | SALE

  const balanceAfter = current.plus(delta);
  if (balanceAfter.lessThan(0)) {
    throw new ValidationError(
      `Estoque insuficiente de "${product.name}": disponivel ${current.toNumber()}, solicitado ${magnitude.toNumber()}`,
    );
  }

  await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: balanceAfter } });
  const movement = await tx.inventoryMovement.create({
    data: {
      companyId: product.companyId,
      productId: product.id,
      type: input.type,
      quantity: input.type === 'ADJUST' ? balanceAfter : magnitude,
      balanceAfter,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      saleId: input.saleId ?? null,
      createdById: currentUserId(),
    },
  });

  return { movement, balanceAfter: balanceAfter.toNumber(), product: { id: product.id, name: product.name } };
}

/** Movimento avulso via API/tool (fora de venda) - registra auditoria. */
export async function registerMovement(input: MoveInput) {
  const result = await prisma.$transaction((tx) => applyMovement(input, tx));
  await audit({
    action: 'inventory.move',
    entityType: 'Product',
    entityId: input.productId,
    summary: `${input.type} ${input.quantity} -> saldo ${result.balanceAfter}`,
    after: input,
  });
  return result;
}

export async function getStock(productId: string) {
  const product = await prisma.product.findFirst({
    where: { ...scope(), id: productId, deletedAt: null },
    include: { inventory: true },
  });
  if (!product) throw new NotFoundError('Produto', productId);
  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    quantity: product.inventory?.quantity.toNumber() ?? 0,
    minQuantity: product.inventory?.minQuantity.toNumber() ?? 0,
    location: product.inventory?.location ?? null,
  };
}

export async function listMovements(p: Pagination & { productId?: string }) {
  const where = { ...scope(), ...(p.productId ? { productId: p.productId } : {}) };
  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, unit: true } } },
      ...toSkipTake(p),
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return { items, total };
}
