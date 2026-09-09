import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table, Tabs } from '../components/ui';
import { brl, dateShort, num } from '../utils/format';

export function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'incomes' | 'expenses'>('expenses');
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState({ kind: 'expense', amount: '', description: '', category: '' });

  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: async () => (await api.get('/finance/cashflow')).data.data as { income: number; expense: number; net: number },
  });
  const balance = useQuery({
    queryKey: ['balance'],
    queryFn: async () => (await api.get('/finance/balance')).data.data as { balance: number },
  });
  const list = useQuery({
    queryKey: ['finance-list', tab],
    queryFn: async () => (await api.get(`/finance/${tab}`, { params: { pageSize: 50 } })).data.data as any[],
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post(entry.kind === 'income' ? '/finance/incomes' : '/finance/expenses', {
        amount: num(entry.amount),
        description: entry.description,
        categoryName: entry.category || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setEntry({ kind: entry.kind, amount: '', description: '', category: '' });
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const dateField = tab === 'incomes' ? 'receivedAt' : 'paidAt';

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Receitas, despesas e fluxo de caixa" />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card><div className="text-sm text-slate-500 dark:text-slate-400">Entradas (mês)</div><div className="mt-1 text-xl font-semibold text-green-600 dark:text-green-400">{brl(cashflow.data?.income)}</div></Card>
        <Card><div className="text-sm text-slate-500 dark:text-slate-400">Saídas (mês)</div><div className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{brl(cashflow.data?.expense)}</div></Card>
        <Card><div className="text-sm text-slate-500 dark:text-slate-400">Resultado (mês)</div><div className="mt-1 text-xl font-semibold">{brl(cashflow.data?.net)}</div></Card>
        <Card><div className="text-sm text-slate-500 dark:text-slate-400">Saldo acumulado</div><div className="mt-1 text-xl font-semibold">{brl(balance.data?.balance)}</div></Card>
      </div>

      <Card className="mb-6">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
          <Field label="Tipo">
            <Select value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </Select>
          </Field>
          <Field label="Valor (R$)"><Input type="number" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} required /></Field>
          <Field label="Descrição"><Input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} required /></Field>
          <Field label="Categoria"><Input value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value })} placeholder="Opcional" /></Field>
          <div className="flex items-end"><Button type="submit" disabled={create.isPending}>Lançar</Button></div>
          {error && <p className="text-sm text-red-600 sm:col-span-5">{error}</p>}
        </form>
      </Card>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'expenses', label: 'Despesas' }, { id: 'incomes', label: 'Receitas' }]} />
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <EmptyState>Sem lançamentos.</EmptyState>
      ) : (
        <Table head={['Data', 'Descrição', 'Categoria', 'Valor']}>
          {list.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 text-slate-500">{dateShort(t[dateField])}</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{t.description}</td>
              <td className="px-4 py-3 text-slate-500">{t.category?.name ?? '-'}</td>
              <td className="px-4 py-3 font-medium">
                <Badge tone={tab === 'incomes' ? 'green' : 'red'}>{brl(t.amount)}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
