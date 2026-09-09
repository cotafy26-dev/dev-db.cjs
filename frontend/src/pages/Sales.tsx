import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table } from '../components/ui';
import { brl, dateTime, num, PAYMENT_LABELS, STATUS_LABELS, statusTone } from '../utils/format';
import { useAuth } from '../stores/auth';
import { can } from '../lib/permissions';

interface Line {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export function SalesPage() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ productId: '', description: '', quantity: '1', unitPrice: '' }]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [fiado, setFiado] = useState(false);

  const sales = useQuery({
    queryKey: ['sales'],
    queryFn: async () => (await api.get('/sales', { params: { pageSize: 50 } })).data.data as any[],
  });
  const products = useQuery({
    queryKey: ['products', 'sale'],
    queryFn: async () => (await api.get('/products', { params: { pageSize: 200 } })).data.data as any[],
  });
  const customers = useQuery({
    queryKey: ['customers', 'sale'],
    queryFn: async () => (await api.get('/customers', { params: { pageSize: 200 } })).data.data as { id: string; name: string }[],
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/sales', {
        items: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || undefined,
          quantity: num(l.quantity),
          unitPrice: l.unitPrice ? num(l.unitPrice) : undefined,
        })),
        customerId: customerId || undefined,
        paymentMethod: fiado ? undefined : paymentMethod,
        paidAmount: fiado ? 0 : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setOpen(false);
      setLines([{ productId: '', description: '', quantity: '1', unitPrice: '' }]);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => api.post(`/sales/${id}/cancel`, { reason: 'Cancelada pelo painel' }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const onPickProduct = (i: number, id: string) => {
    const p = products.data?.find((x) => x.id === id);
    setLine(i, { productId: id, description: p?.name ?? '', unitPrice: p ? String(num(p.price)) : '' });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader title="Vendas" action={<Button onClick={() => setOpen((v) => !v)}>Nova venda</Button>} />

      {open && (
        <Card className="mb-6">
          <form onSubmit={submit} className="space-y-4">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Select value={l.productId} onChange={(e) => onPickProduct(i, e.target.value)}>
                    <option value="">Item avulso...</option>
                    {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Input placeholder="Descrição" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} required={!l.productId} />
                </div>
                <div className="sm:col-span-2"><Input type="number" step="0.001" placeholder="Qtd" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></div>
                <div className="sm:col-span-2"><Input type="number" step="0.01" placeholder="Preço" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></div>
              </div>
            ))}
            <button type="button" className="text-sm text-brand-600" onClick={() => setLines((ls) => [...ls, { productId: '', description: '', quantity: '1', unitPrice: '' }])}>
              + adicionar item
            </button>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cliente">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Sem cliente</option>
                  {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Pagamento">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={fiado}>
                  {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <label className="mt-7 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={fiado} onChange={(e) => setFiado(e.target.checked)} /> Fiado (pagar depois)
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>Registrar venda</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {sales.isLoading ? (
        <Loading />
      ) : !sales.data?.length ? (
        <EmptyState>Nenhuma venda registrada.</EmptyState>
      ) : (
        <Table head={['#', 'Data', 'Cliente', 'Vendedor', 'Total', 'Pago', 'Status', '']}>
          {sales.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 text-slate-500">{s.number}</td>
              <td className="px-4 py-3 text-slate-500">{dateTime(s.soldAt)}</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{s.customer?.name ?? '-'}</td>
              <td className="px-4 py-3 text-slate-500">{s.seller?.name ?? '-'}</td>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{brl(s.total)}</td>
              <td className="px-4 py-3 text-slate-500">{brl(s.paidAmount)}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status] ?? s.status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {s.status !== 'CANCELED' && can(role, 'sale.cancel') && (
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => window.confirm(`Cancelar a venda #${s.number} de ${brl(s.total)}?`) && cancel.mutate(s.id)}
                  >
                    cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
