import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, Loading, PageHeader, Stat, Table, Tabs } from '../components/ui';
import { brl, num } from '../utils/format';

type Tab = 'sales' | 'financial' | 'profit' | 'inventory' | 'customers' | 'sellers';

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [period, setPeriod] = useState('month');

  const endpoint = {
    sales: '/reports/sales',
    financial: '/reports/financial',
    profit: '/reports/profit',
    inventory: '/reports/inventory',
    customers: '/reports/customers',
    sellers: '/reports/sellers',
  }[tab];

  const { data, isLoading } = useQuery({
    queryKey: ['report', tab, period],
    queryFn: async () => (await api.get(endpoint, { params: { period } })).data.data as any,
  });

  return (
    <div>
      <PageHeader
        title="Relatórios"
        action={
          ['sales', 'financial', 'profit', 'sellers'].includes(tab) ? (
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'sales', label: 'Vendas' },
          { id: 'financial', label: 'Financeiro' },
          { id: 'profit', label: 'Lucro estimado' },
          { id: 'inventory', label: 'Estoque' },
          { id: 'customers', label: 'Clientes' },
          { id: 'sellers', label: 'Vendedores' },
        ]}
      />

      {isLoading || !data ? (
        <Loading />
      ) : tab === 'sales' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Vendas" value={String(data.count)} />
            <Stat label="Faturamento" value={brl(data.gross)} />
            <Stat label="Recebido" value={brl(data.received)} />
            <Stat label="Pendente" value={brl(data.pending)} />
          </div>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Mais vendidos</h3>
            <Table head={['Produto', 'Qtd', 'Total']}>
              {data.topProducts.map((p: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">{num(p.quantity)}</td><td className="px-4 py-2">{brl(p.total)}</td></tr>
              ))}
            </Table>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Por vendedor</h3>
            <Table head={['Vendedor', 'Vendas', 'Total']}>
              {data.bySeller.map((s: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{s.seller}</td><td className="px-4 py-2">{s.count}</td><td className="px-4 py-2">{brl(s.total)}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : tab === 'financial' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Entradas" value={brl(data.income)} tone="green" />
            <Stat label="Saídas" value={brl(data.expense)} tone="red" />
            <Stat label="Resultado" value={brl(data.net)} />
            <Stat label="Saldo acumulado" value={brl(data.balance)} />
          </div>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Despesas por categoria</h3>
            <Table head={['Categoria', 'Total']}>
              {data.expensesByCategory.map((c: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2">{brl(c.total)}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : tab === 'profit' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Receita" value={brl(data.revenue)} />
          <Stat label="Custo dos produtos" value={brl(data.cogs)} />
          <Stat label="Lucro bruto" value={brl(data.grossProfit)} />
          <Stat label="Outras despesas" value={brl(data.otherExpenses)} tone="red" />
          <Stat label="Lucro estimado" value={brl(data.estimatedProfit)} tone={data.estimatedProfit >= 0 ? 'green' : 'red'} />
        </div>
      ) : tab === 'inventory' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Produtos" value={String(data.products)} />
            <Stat label="Valor em estoque (custo)" value={brl(data.stockValueCost)} />
            <Stat label="Valor em estoque (venda)" value={brl(data.stockValueSale)} />
          </div>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Estoque baixo</h3>
            <Table head={['Produto', 'Estoque', 'Mínimo']}>
              {data.lowStock.map((p: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">{p.stock}</td><td className="px-4 py-2">{p.minStock}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : tab === 'customers' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Clientes" value={String(data.totalCustomers)} />
            <Stat label="Novos no mês" value={String(data.newThisMonth)} />
            <Stat label="A receber" value={brl(data.receivable.total)} />
          </div>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Maiores compradores</h3>
            <Table head={['Cliente', 'Compras', 'Total']}>
              {data.topCustomers.map((c: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2">{c.purchases}</td><td className="px-4 py-2">{brl(c.total)}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : (
        <Card>
          <Table head={['Vendedor', 'Vendas', 'Total']}>
            {data.sellers.map((s: any, i: number) => (
              <tr key={i}><td className="px-4 py-2">{s.seller}</td><td className="px-4 py-2">{s.count}</td><td className="px-4 py-2">{brl(s.total)}</td></tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
