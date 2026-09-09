import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Table } from '../components/ui';
import { brl, dateShort, STATUS_LABELS, statusTone } from '../utils/format';

export function ChargesPage() {
  const qc = useQueryClient();
  const overdue = useQuery({
    queryKey: ['overdue-customers'],
    queryFn: async () => (await api.get('/charges/overdue-customers')).data.data as any[],
  });
  const charges = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get('/charges', { params: { pageSize: 100 } })).data.data.items as any[],
  });
  const create = useMutation({
    mutationFn: async (accountReceivableId: string) => api.post('/charges', { accountReceivableId }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const send = useMutation({
    mutationFn: async (id: string) => api.post(`/charges/${id}/send`),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div>
      <PageHeader title="Cobranças" subtitle="Clientes em atraso e envio de lembretes" />

      <Card className="mb-6">
        <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">Clientes em atraso</h2>
        {overdue.isLoading ? (
          <Loading />
        ) : !overdue.data?.length ? (
          <p className="text-sm text-slate-500">Nenhum cliente em atraso 🎉</p>
        ) : (
          <Table head={['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Atraso', '']}>
            {overdue.data.map((o) => (
              <tr key={o.accountReceivableId}>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{o.customer}</td>
                <td className="px-4 py-3">{o.description}</td>
                <td className="px-4 py-3">{brl(o.amount)}</td>
                <td className="px-4 py-3">{dateShort(o.dueDate)}</td>
                <td className="px-4 py-3"><Badge tone="red">{o.daysLate}d</Badge></td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => create.mutate(o.accountReceivableId)}>
                    Criar cobrança
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">Cobranças</h2>
      {charges.isLoading ? (
        <Loading />
      ) : !charges.data?.length ? (
        <EmptyState>Nenhuma cobrança criada.</EmptyState>
      ) : (
        <Table head={['Valor', 'Status', 'Lembretes', 'Mensagem', '']}>
          {charges.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">{brl(c.amount)}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{STATUS_LABELS[c.status] ?? c.status}</Badge></td>
              <td className="px-4 py-3">{c.remindersSent}</td>
              <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{c.message}</td>
              <td className="px-4 py-3 text-right">
                {c.status !== 'PAID' && c.status !== 'CANCELED' && (
                  <Button size="sm" variant="ghost" onClick={() => send.mutate(c.id)}>
                    Enviar
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
