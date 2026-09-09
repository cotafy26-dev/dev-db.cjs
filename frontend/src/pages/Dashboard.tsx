import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Badge, Card, Loading, PageHeader, Stat } from '../components/ui';
import { brl } from '../utils/format';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/reports/overview')).data.data as any,
  });
  const byDay = useQuery({
    queryKey: ['sales-report-dash'],
    queryFn: async () => (await api.get('/reports/sales', { params: { period: 'week' } })).data.data as any,
  });

  if (isLoading || !data) return <Loading />;

  const max = Math.max(1, ...((byDay.data?.byDay ?? []).map((d: any) => d.total)));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Panorama do negócio" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Faturamento (mês)" value={brl(data.month.revenue)} hint={`${data.month.sales} venda(s)`} />
        <Stat label="Lucro estimado (mês)" value={brl(data.month.estimatedProfit)} tone={data.month.estimatedProfit >= 0 ? 'green' : 'red'} />
        <Stat label="Despesas (mês)" value={brl(data.month.expense)} tone="red" />
        <Stat label="Vendas hoje" value={brl(data.today.revenue)} hint={`${data.today.sales} venda(s)`} />
        <Stat label="A receber" value={brl(data.receivableTotal)} hint={`${brl(data.receivableOverdue)} vencidos`} />
        <Stat label="A pagar" value={brl(data.payableTotal)} hint={`${brl(data.payableOverdue)} vencidos`} />
        <Stat label="Contas vencidas" value={String(data.dueTomorrowCount)} hint="até amanhã" />
        <Stat label="Compromissos" value={String(data.upcomingAppointmentsCount)} hint="próximos" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">Vendas na semana</div>
          <div className="flex h-40 items-end gap-2">
            {(byDay.data?.byDay ?? []).map((d: any) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-brand-500/80"
                  style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total ? 4 : 0 }}
                  title={brl(d.total)}
                />
                <span className="text-[10px] text-slate-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Estoque baixo</span>
            <Link to="/estoque" className="text-xs text-brand-600">ver estoque</Link>
          </div>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum produto em falta.</p>
          ) : (
            <ul className="space-y-2">
              {data.lowStock.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{p.name}</span>
                  <Badge tone="amber">{p.stock} {p.unit} (mín. {p.minStock})</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
