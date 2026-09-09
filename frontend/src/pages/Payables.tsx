import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Table } from '../components/ui';
import { brl, dateShort, num, STATUS_LABELS, statusTone } from '../utils/format';

export function PayablesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ description: string; amount: string; dueDate: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['payables'],
    queryFn: async () => (await api.get('/finance/payables', { params: { pageSize: 100 } })).data.data as any[],
  });
  const totals = useQuery({
    queryKey: ['payables-total'],
    queryFn: async () => (await api.get('/finance/payables/total')).data.data as { total: number; overdue: number },
  });
  const create = useMutation({
    mutationFn: async () =>
      api.post('/finance/payables', {
        description: form!.description,
        amount: num(form!.amount),
        dueDate: form!.dueDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });
  const pay = useMutation({
    mutationFn: async (v: { id: string; amount: number }) =>
      api.post('/finance/payments', { direction: 'OUT', accountPayableId: v.id, amount: v.amount }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Contas a Pagar"
        action={<Button onClick={() => setForm({ description: '', amount: '', dueDate: '' })}>Nova conta</Button>}
      />
      {totals.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card><div className="text-sm text-slate-500 dark:text-slate-400">Total a pagar</div><div className="mt-1 text-xl font-semibold">{brl(totals.data.total)}</div></Card>
          <Card><div className="text-sm text-slate-500 dark:text-slate-400">Vencidos</div><div className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{brl(totals.data.overdue)}</div></Card>
        </div>
      )}
      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Descrição"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></Field>
            <Field label="Valor (R$)"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Vencimento"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <EmptyState>Nada a pagar.</EmptyState>
      ) : (
        <Table head={['Descrição', 'Fornecedor', 'Valor', 'Pago', 'Vencimento', 'Status', '']}>
          {list.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{p.description}</td>
              <td className="px-4 py-3">{p.supplier?.name ?? '-'}</td>
              <td className="px-4 py-3">{brl(p.amount)}</td>
              <td className="px-4 py-3">{brl(p.paidAmount)}</td>
              <td className="px-4 py-3">{dateShort(p.dueDate)}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(p.status)}>{STATUS_LABELS[p.status] ?? p.status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {['OPEN', 'PARTIAL'].includes(p.status) && (
                  <Button size="sm" variant="ghost" onClick={() => pay.mutate({ id: p.id, amount: num(p.amount) - num(p.paidAmount) })}>
                    Pagar
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
