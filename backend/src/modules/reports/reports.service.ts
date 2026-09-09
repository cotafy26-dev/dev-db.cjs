import { prisma } from '../../core/prisma';
import { scope } from '../../core/tenant';
import { toNumber } from '../../core/money';
import { dayjs, dayRange, DEFAULT_TZ, monthRange, type DateRange } from '../../core/dates';
import { salesSummary } from '../sales/sales.service';
import { balance, cashFlow, totalPayable, totalReceivable } from '../finance/finance.service';
import { lowStockProducts } from '../products/products.service';

function weekRange(ref: Date, tz = DEFAULT_TZ): DateRange {
  const d = dayjs.tz(ref, tz).startOf('week');
  return { from: d.toDate(), to: d.add(1, 'week').toDate() };
}

export function resolveRange(period: string | undefined, tz = DEFAULT_TZ): DateRange & { label: string } {
  switch ((period ?? 'today').toLowerCase()) {
    case 'yesterday':
    case 'ontem': {
      const y = dayjs().tz(tz).subtract(1, 'day').toDate();
      return { ...dayRange(y, tz), label: 'ontem' };
    }
    case 'week':
    case 'semana':
      return { ...weekRange(new Date(), tz), label: 'esta semana' };
    case 'month':
    case 'mes':
    case 'mês':
      return { ...monthRange(new Date(), tz), label: 'este mes' };
    default:
      return { ...dayRange(new Date(), tz), label: 'hoje' };
  }
}

// --------------------------------------------------------------- Painel

export async function overview(tz = DEFAULT_TZ) {
  const now = new Date();
  const month = monthRange(now, tz);
  const tomorrowEnd = dayjs().tz(tz).add(1, 'day').endOf('day').toDate();

  const [todaySales, monthSales, monthCash, receivable, payable, lowStock, dueTomorrow, upcoming, profit] =
    await Promise.all([
      salesSummary(dayRange(now, tz)),
      salesSummary(month),
      cashFlow(month),
      totalReceivable(),
      totalPayable(),
      lowStockProducts(),
      prisma.accountPayable.count({
        where: { ...scope(), status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { not: null, lte: tomorrowEnd } },
      }),
      prisma.appointment.count({
        where: { ...scope(), status: 'SCHEDULED', startsAt: { gte: now, lte: tomorrowEnd } },
      }),
      estimatedProfit(month),
    ]);

  return {
    today: { sales: todaySales.count, revenue: todaySales.gross, received: todaySales.received },
    month: {
      sales: monthSales.count,
      revenue: monthSales.gross,
      income: monthCash.income,
      expense: monthCash.expense,
      net: monthCash.net,
      estimatedProfit: profit.estimatedProfit,
    },
    receivableTotal: receivable.total,
    receivableOverdue: receivable.overdue,
    payableTotal: payable.total,
    payableOverdue: payable.overdue,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 10),
    dueTomorrowCount: dueTomorrow,
    upcomingAppointmentsCount: upcoming,
  };
}

// --------------------------------------------------------------- Vendas

export async function salesReport(period: string | undefined, tz = DEFAULT_TZ) {
  const range = resolveRange(period, tz);
  const [summary, byDay, topProducts, bySeller] = await Promise.all([
    salesSummary(range),
    salesByDay(range, tz),
    topProductsInRange(range),
    sellerPerformance(range),
  ]);
  return { period: range.label, ...summary, byDay, topProducts, bySeller };
}

async function salesByDay(range: DateRange, tz: string) {
  const rows = await prisma.sale.findMany({
    where: { ...scope(), soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } },
    select: { soldAt: true, total: true },
  });
  const buckets = new Map<string, number>();
  let cursor = dayjs.tz(range.from, tz).startOf('day');
  const end = dayjs.tz(range.to, tz);
  while (cursor.isBefore(end)) {
    buckets.set(cursor.format('YYYY-MM-DD'), 0);
    cursor = cursor.add(1, 'day');
  }
  for (const r of rows) {
    const key = dayjs(r.soldAt).tz(tz).format('YYYY-MM-DD');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + toNumber(r.total));
  }
  return [...buckets.entries()].map(([date, total]) => ({ date, total }));
}

async function topProductsInRange(range: DateRange, limit = 10) {
  const rows = await prisma.saleItem.findMany({
    where: { sale: { ...scope(), soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } } },
    select: { description: true, quantity: true, total: true, productId: true },
  });
  const map = new Map<string, { name: string; quantity: number; total: number }>();
  for (const r of rows) {
    const key = r.productId ?? r.description;
    const cur = map.get(key) ?? { name: r.description, quantity: 0, total: 0 };
    cur.quantity += toNumber(r.quantity);
    cur.total += toNumber(r.total);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

async function sellerPerformance(range: DateRange) {
  const rows = await prisma.sale.findMany({
    where: { ...scope(), soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } },
    select: { total: true, sellerId: true, seller: { select: { name: true } } },
  });
  const map = new Map<string, { seller: string; count: number; total: number }>();
  for (const r of rows) {
    const key = r.sellerId ?? 'sem-vendedor';
    const cur = map.get(key) ?? { seller: r.seller?.name ?? 'Sem vendedor', count: 0, total: 0 };
    cur.count += 1;
    cur.total += toNumber(r.total);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// --------------------------------------------------------------- Financeiro / Lucro

export async function financialReport(period: string | undefined, tz = DEFAULT_TZ) {
  const range = resolveRange(period === 'today' ? 'month' : period, tz);
  const [flow, receivable, payable, acc, byCategory] = await Promise.all([
    cashFlow(range),
    totalReceivable(),
    totalPayable(),
    balance(),
    expensesByCategory(range),
  ]);
  return {
    period: range.label,
    income: flow.income,
    expense: flow.expense,
    net: flow.net,
    balance: acc,
    receivable,
    payable,
    expensesByCategory: byCategory,
  };
}

async function expensesByCategory(range: DateRange) {
  const rows = await prisma.expense.findMany({
    where: { ...scope(), canceledAt: null, paidAt: { gte: range.from, lt: range.to } },
    select: { amount: true, category: { select: { name: true } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.category?.name ?? 'Sem categoria';
    map.set(key, (map.get(key) ?? 0) + toNumber(r.amount));
  }
  return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

export async function estimatedProfit(range: DateRange) {
  const items = await prisma.saleItem.findMany({
    where: { sale: { ...scope(), soldAt: { gte: range.from, lt: range.to }, status: { not: 'CANCELED' } } },
    select: { quantity: true, total: true, product: { select: { cost: true } } },
  });
  let revenue = 0;
  let cogs = 0;
  for (const i of items) {
    revenue += toNumber(i.total);
    cogs += toNumber(i.product?.cost ?? 0) * toNumber(i.quantity);
  }
  const flow = await cashFlow(range);
  const otherExpenses = flow.expense; // despesas lancadas no periodo
  const estimatedProfit = revenue - cogs - otherExpenses;
  return { revenue, cogs, grossProfit: revenue - cogs, otherExpenses, estimatedProfit };
}

export async function profitReport(period: string | undefined, tz = DEFAULT_TZ) {
  const range = resolveRange(period === 'today' ? 'month' : period, tz);
  return { period: range.label, ...(await estimatedProfit(range)) };
}

// --------------------------------------------------------------- Estoque

export async function inventoryReport() {
  const products = await prisma.product.findMany({
    where: { ...scope(), deletedAt: null, active: true },
    include: { inventory: true },
    orderBy: { name: 'asc' },
  });
  let stockValueCost = 0;
  let stockValueSale = 0;
  const low: { name: string; stock: number; minStock: number }[] = [];
  for (const p of products) {
    const q = toNumber(p.inventory?.quantity ?? 0);
    stockValueCost += q * toNumber(p.cost ?? 0);
    stockValueSale += q * toNumber(p.price);
    if (p.inventory && p.inventory.quantity.lessThanOrEqualTo(p.inventory.minQuantity)) {
      low.push({ name: p.name, stock: q, minStock: toNumber(p.inventory.minQuantity) });
    }
  }
  return { products: products.length, stockValueCost, stockValueSale, lowStock: low };
}

// --------------------------------------------------------------- Clientes

export async function customerReport(tz = DEFAULT_TZ) {
  const month = monthRange(new Date(), tz);
  const [totalCustomers, newThisMonth, receivable, topRows] = await Promise.all([
    prisma.customer.count({ where: { ...scope(), deletedAt: null } }),
    prisma.customer.count({ where: { ...scope(), deletedAt: null, createdAt: { gte: month.from, lt: month.to } } }),
    totalReceivable(),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { ...scope(), status: { not: 'CANCELED' }, customerId: { not: null } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    }),
  ]);
  const ids = topRows.map((r) => r.customerId).filter((x): x is string => Boolean(x));
  const names = await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameMap = new Map(names.map((n) => [n.id, n.name]));
  return {
    totalCustomers,
    newThisMonth,
    receivable,
    topCustomers: topRows.map((r) => ({
      name: r.customerId ? nameMap.get(r.customerId) ?? 'Cliente' : 'Sem cliente',
      purchases: r._count,
      total: toNumber(r._sum.total ?? 0),
    })),
  };
}

// --------------------------------------------------------------- Vendedores

export async function sellerReport(period: string | undefined, tz = DEFAULT_TZ) {
  const range = resolveRange(period === 'today' ? 'month' : period, tz);
  return { period: range.label, sellers: await sellerPerformance(range) };
}
