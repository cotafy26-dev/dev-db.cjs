import { prisma } from '../../core/prisma';
import { tenantWhere } from '../../core/tenant';
import { OPEN_SETTLEMENTS } from '../../core/constants';
import { toNumber } from '../../core/money';
import { dayjs, dayRange, DEFAULT_TZ, monthRange } from '../../core/dates';
import { salesSummary } from '../sales/sales.service';
import { cashFlow, totalPayable, totalReceivable } from '../finance/finance.service';
import { lowStockProducts } from '../products/products.service';

export async function overview(tz = DEFAULT_TZ) {
  const now = new Date();
  const today = dayRange(now, tz);
  const month = monthRange(now, tz);
  const tomorrowEnd = dayjs().tz(tz).add(1, 'day').endOf('day').toDate();

  const [todaySales, monthSales, monthCash, receivable, payable, lowStock, dueTomorrow, upcoming] =
    await Promise.all([
      salesSummary(today),
      salesSummary(month),
      cashFlow(month),
      totalReceivable(),
      totalPayable(),
      lowStockProducts(),
      prisma.payable.count({
        where: tenantWhere({ status: { in: OPEN_SETTLEMENTS }, dueDate: { not: null, lte: tomorrowEnd } }),
      }),
      prisma.agendaEvent.count({
        where: tenantWhere({ status: 'SCHEDULED', startsAt: { gte: now, lte: tomorrowEnd } }),
      }),
    ]);

  return {
    today: { sales: todaySales.count, revenue: todaySales.gross, received: todaySales.received },
    month: {
      sales: monthSales.count,
      revenue: monthSales.gross,
      income: monthCash.income,
      expense: monthCash.expense,
      net: monthCash.net,
    },
    receivableTotal: receivable,
    payableTotal: payable,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 10),
    dueTomorrowCount: dueTomorrow,
    upcomingEventsCount: upcoming,
  };
}

export async function salesByDay(days = 14, tz = DEFAULT_TZ) {
  const from = dayjs().tz(tz).subtract(days - 1, 'day').startOf('day');
  const rows = await prisma.sale.findMany({
    where: tenantWhere({ soldAt: { gte: from.toDate() }, status: { not: 'CANCELED' } }),
    select: { soldAt: true, total: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(from.add(i, 'day').format('YYYY-MM-DD'), 0);
  }
  for (const r of rows) {
    const key = dayjs(r.soldAt).tz(tz).format('YYYY-MM-DD');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + toNumber(r.total));
  }
  return [...buckets.entries()].map(([date, total]) => ({ date, total }));
}

export async function topProducts(limit = 5, tz = DEFAULT_TZ) {
  const month = monthRange(new Date(), tz);
  const rows = await prisma.saleItem.findMany({
    where: { sale: tenantWhere({ soldAt: { gte: month.from, lt: month.to }, status: { not: 'CANCELED' } }) },
    select: { description: true, quantity: true, total: true },
  });
  const map = new Map<string, { name: string; quantity: number; total: number }>();
  for (const r of rows) {
    const cur = map.get(r.description) ?? { name: r.description, quantity: 0, total: 0 };
    cur.quantity += toNumber(r.quantity);
    cur.total += toNumber(r.total);
    map.set(r.description, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}
