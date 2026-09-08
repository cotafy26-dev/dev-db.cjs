import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Select, PageHeader, Spinner, Table } from '../components/ui';
import { brl, dateShort, num } from '../utils/format';
import type { FinanceTransaction, Paginated } from '../types';

type Tab = 'transactions' | 'receivables' | 'payables';

export function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('transactions');
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState({ type: 'EXPENSE', amount: '', description: '', categoryName: '' });

  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: async () => (await api.get('/finance/cashflow')).data.data as { income: number; expense: number; net: number },
  });
  const transactions = useQuery({
    queryKey: ['transactions'],
    queryFn: async () =>
      (await api.get<Paginated<FinanceTransaction>>('/finance/transactions', { params: { pageSize: 50 } })).data,
    enabled: tab === 'transactions',
  });
  const receivables = useQuery({
    queryKey: ['receivables'],
    queryFn: async () => (await api.get('/finance/receivables', { params: { pageSize: 50 } })).data,
    enabled: tab === 'receivables',
  });
  const payables = useQuery({
    queryKey: ['payables'],
    queryFn: async () => (await api.get('/finance/payables', { params: { pageSize: 50 } })).data,
    enabled: tab === 'payables',
  });

  const createTx = useMutation({
    mutationFn: async () =>
      (
        await api.post('/finance/transactions', {
          type: tx.type,
          amount: num(tx.amount),
          description: tx.description,
          categoryName: tx.categoryName || undefined,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries();
      setTx({ type: 'EXPENSE', amount: '', description: '', categoryName: '' });
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const receive = useMutation({
    mutationFn: async (r: { id: string; amount: number }) =>
      (await api.post('/finance/receivables/receive', { receivableId: r.id, amount: r.amount })).data,
    onSuccess: () => qc.invalidateQueries(),
  });
  const pay = useMutation({
    mutationFn: async (p: { id: string }) => (await api.post('/finance/payables/pay', { payableId: p.id })).data,
    onSuccess: () => qc.invalidateQueries(),
  });

  const submitTx = (e: FormEvent) => {
    e.preventDefault();
    createTx.mutate();
  };

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Lançamentos, contas a receber e a pagar" />

      {cashflow.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card><div className="text-sm text-slate-500">Entradas (mês)</div><div className="mt-1 text-xl font-semibold text-green-600">{brl(cashflow.data.income)}</div></Card>
          <Card><div className="text-sm text-slate-500">Saídas (mês)</div><div className="mt-1 text-xl font-semibold text-red-600">{brl(cashflow.data.expense)}</div></Card>
          <Card><div className="text-sm text-slate-500">Saldo</div><div className="mt-1 text-xl font-semibold text-slate-800">{brl(cashflow.data.net)}</div></Card>
        </div>
      )}

      <Card className="mb-6">
        <form onSubmit={submitTx} className="grid gap-3 sm:grid-cols-5">
          <Field label="Tipo">
            <Select value={tx.type} onChange={(e) => setTx({ ...tx, type: e.target.value })}>
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </Select>
          </Field>
          <Field label="Valor (R$)">
            <Input type="number" step="0.01" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} required />
          </Field>
          <Field label="Descrição">
            <Input value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} required />
          </Field>
          <Field label="Categoria">
            <Input value={tx.categoryName} onChange={(e) => setTx({ ...tx, categoryName: e.target.value })} placeholder="Opcional" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={createTx.isPending}>Lançar</Button>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-5">{error}</p>}
        </form>
      </Card>

      <div className="mb-4 flex gap-2">
        {(['transactions', 'receivables', 'payables'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 text-slate-600'}`}
          >
            {t === 'transactions' ? 'Lançamentos' : t === 'receivables' ? 'A receber' : 'A pagar'}
          </button>
        ))}
      </div>

      {tab === 'transactions' &&
        (transactions.isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !transactions.data?.data.length ? (
          <EmptyState>Sem lançamentos.</EmptyState>
        ) : (
          <Table head={['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']}>
            {transactions.data.data.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-slate-500">{dateShort(t.occurredAt)}</td>
                <td className="px-4 py-3 text-slate-700">{t.description}</td>
                <td className="px-4 py-3 text-slate-500">{t.category?.name ?? '-'}</td>
                <td className="px-4 py-3">
                  <Badge tone={t.type === 'INCOME' ? 'green' : 'red'}>{t.type === 'INCOME' ? 'Entrada' : 'Saída'}</Badge>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700">{brl(t.amount)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'receivables' &&
        (receivables.isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !receivables.data?.data.length ? (
          <EmptyState>Nada a receber.</EmptyState>
        ) : (
          <Table head={['Descrição', 'Cliente', 'Valor', 'Pago', 'Vencimento', '']}>
            {receivables.data.data.map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-slate-700">{r.description}</td>
                <td className="px-4 py-3 text-slate-500">{r.customer?.name ?? '-'}</td>
                <td className="px-4 py-3">{brl(r.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{brl(r.paidAmount)}</td>
                <td className="px-4 py-3 text-slate-500">{r.dueDate ? dateShort(r.dueDate) : '-'}</td>
                <td className="px-4 py-3">
                  <button
                    className="text-sm text-brand-600 hover:underline"
                    onClick={() => receive.mutate({ id: r.id, amount: num(r.amount) - num(r.paidAmount) })}
                  >
                    dar baixa
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'payables' &&
        (payables.isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !payables.data?.data.length ? (
          <EmptyState>Nada a pagar.</EmptyState>
        ) : (
          <Table head={['Descrição', 'Fornecedor', 'Valor', 'Pago', 'Vencimento', '']}>
            {payables.data.data.map((p: any) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-slate-700">{p.description}</td>
                <td className="px-4 py-3 text-slate-500">{p.supplierName ?? '-'}</td>
                <td className="px-4 py-3">{brl(p.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{brl(p.paidAmount)}</td>
                <td className="px-4 py-3 text-slate-500">{p.dueDate ? dateShort(p.dueDate) : '-'}</td>
                <td className="px-4 py-3">
                  <button className="text-sm text-brand-600 hover:underline" onClick={() => pay.mutate({ id: p.id })}>
                    pagar
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ))}
    </div>
  );
}
