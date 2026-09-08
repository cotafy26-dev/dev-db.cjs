import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, PageHeader, Spinner, Badge } from '../components/ui';
import { brl } from '../utils/format';
import type { Overview } from '../types';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get<{ data: Overview }>('/reports/overview')).data.data,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Painel" subtitle="Visão geral do negócio" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendas hoje" value={brl(data.today.revenue)} hint={`${data.today.sales} venda(s)`} />
        <Stat label="Faturamento do mês" value={brl(data.month.revenue)} hint={`${data.month.sales} venda(s)`} />
        <Stat label="A receber" value={brl(data.receivableTotal)} />
        <Stat label="A pagar" value={brl(data.payableTotal)} />
        <Stat label="Saldo do mês" value={brl(data.month.net)} hint={`Entradas ${brl(data.month.income)} · Saídas ${brl(data.month.expense)}`} />
        <Stat label="Contas vencendo até amanhã" value={String(data.dueTomorrowCount)} />
        <Stat label="Compromissos próximos" value={String(data.upcomingEventsCount)} />
        <Stat label="Produtos em estoque baixo" value={String(data.lowStockCount)} />
      </div>

      {data.lowStock.length > 0 && (
        <Card className="mt-6">
          <div className="mb-3 text-sm font-medium text-slate-700">Estoque baixo</div>
          <ul className="space-y-2">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{p.name}</span>
                <Badge tone="amber">
                  {p.stock} {p.unit} (mín. {p.minStock})
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
