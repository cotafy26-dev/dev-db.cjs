import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Table } from '../components/ui';
import { brl, dateShort, num, STATUS_LABELS, statusTone } from '../utils/format';

export function ReceivablesPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['receivables'],
    queryFn: async () => (await api.get('/finance/receivables', { params: { pageSize: 100 } })).data.data as any[],
  });
  const totals = useQuery({
    queryKey: ['receivables-total'],
    queryFn: async () => (await api.get('/finance/receivables/total')).data.data as { total: number; overdue: number },
  });
  const receive = useMutation({
    mutationFn: async (v: { id: string; amount: number }) =>
      api.post('/finance/payments', { direction: 'IN', accountReceivableId: v.id, amount: v.amount }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div>
      <PageHeader title="Contas a Receber" />
      {totals.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card><div className="text-sm text-slate-500 dark:text-slate-400">Total a receber</div><div className="mt-1 text-xl font-semibold">{brl(totals.data.total)}</div></Card>
          <Card><div className="text-sm text-slate-500 dark:text-slate-400">Vencidos</div><div className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{brl(totals.data.overdue)}</div></Card>
        </div>
      )}
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <EmptyState>Nada a receber.</EmptyState>
      ) : (
        <Table head={['Descrição', 'Cliente', 'Valor', 'Pago', 'Vencimento', 'Status', '']}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.description}</td>
              <td className="px-4 py-3">{r.customer?.name ?? '-'}</td>
              <td className="px-4 py-3">{brl(r.amount)}</td>
              <td className="px-4 py-3">{brl(r.paidAmount)}</td>
              <td className="px-4 py-3">{dateShort(r.dueDate)}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{STATUS_LABELS[r.status] ?? r.status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {['OPEN', 'PARTIAL'].includes(r.status) && (
                  <Button size="sm" variant="ghost" onClick={() => receive.mutate({ id: r.id, amount: num(r.amount) - num(r.paidAmount) })}>
                    Dar baixa
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
