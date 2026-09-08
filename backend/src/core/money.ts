import { Prisma } from '@prisma/client';

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

/** Converte number | string | Decimal para Prisma.Decimal com 2 casas (valores monetarios). */
export function money(value: number | string | Prisma.Decimal): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Quantidades (estoque) com ate 3 casas. */
export function qty(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

/** Formata em BRL para respostas ao usuario final. */
export function formatBRL(value: Prisma.Decimal | number): string {
  const n = typeof value === 'number' ? value : value.toNumber();
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
