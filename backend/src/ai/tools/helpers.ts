import { dayRange, monthRange, parseNaturalDate, parseNaturalDateTime } from '../../core/dates';
import { ValidationError } from '../../core/errors';
import { createCustomer, findCustomerByName } from '../../modules/customers/customers.service';
import { findProductByName } from '../../modules/products/products.service';
import { NeedsClarification } from './registry';

export async function resolveCustomerId(
  name: string | undefined | null,
  opts: { createIfMissing?: boolean } = {},
): Promise<string | null> {
  if (!name?.trim()) return null;
  const res = await findCustomerByName(name);
  if (res.match) return res.match.id;
  if (res.candidates && res.candidates.length > 0) {
    throw new NeedsClarification(`Ha mais de um cliente parecido com "${name}". Qual deles?`, res.candidates);
  }
  if (opts.createIfMissing) {
    const created = await createCustomer({ name: name.trim() });
    return created.id;
  }
  return null;
}

export async function resolveProduct(name: string): Promise<{ id: string; name: string; price: number }> {
  const res = await findProductByName(name);
  if (res.match) return { id: res.match.id, name: res.match.name, price: res.match.price.toNumber() };
  if (res.candidates && res.candidates.length > 0) {
    throw new NeedsClarification(`Qual produto? Encontrei mais de um parecido com "${name}".`, res.candidates);
  }
  throw new ValidationError(`Produto "${name}" nao encontrado. Cadastre-o antes com create_product.`);
}

export function parseWhen(text: string): Date {
  const dt = parseNaturalDateTime(text) ?? parseNaturalDate(text);
  if (!dt) throw new ValidationError(`Nao entendi a data/hora: "${text}"`);
  return dt;
}

export function parseDateOnly(text: string): Date {
  const dt = parseNaturalDate(text);
  if (!dt) throw new ValidationError(`Nao entendi a data: "${text}"`);
  return dt;
}

export function periodRange(period: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const p = period?.toLowerCase().trim();
  if (p === 'ontem' || p === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { ...dayRange(y), label: 'ontem' };
  }
  if (p === 'mes' || p === 'mês' || p === 'month') return { ...monthRange(now), label: 'este mes' };
  return { ...dayRange(now), label: 'hoje' };
}
