import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table } from '../components/ui';
import { dateTime, num } from '../utils/format';

const TYPE_LABELS: Record<string, string> = { IN: 'Entrada', OUT: 'Saída', ADJUST: 'Ajuste', SALE: 'Venda', RETURN: 'Devolução' };

export function InventoryPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ productId: string; type: string; quantity: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ['products', 'inv'],
    queryFn: async () => (await api.get('/products', { params: { pageSize: 200 } })).data.data as any[],
  });
  const movements = useQuery({
    queryKey: ['movements'],
    queryFn: async () => (await api.get('/inventory/movements', { params: { pageSize: 100 } })).data.data as any[],
  });

  const move = useMutation({
    mutationFn: async () =>
      api.post('/inventory/movement', {
        productId: form!.productId,
        type: form!.type,
        quantity: num(form!.quantity),
        reason: form!.reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    move.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Saldos e movimentações (entrada, saída, ajuste, venda, devolução)"
        action={
          <Button onClick={() => setForm({ productId: products.data?.[0]?.id ?? '', type: 'IN', quantity: '', reason: '' })}>
            Nova movimentação
          </Button>
        }
      />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
            <Field label="Produto">
              <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="IN">Entrada</option>
                <option value="OUT">Saída</option>
                <option value="ADJUST">Ajuste (define saldo)</option>
                <option value="RETURN">Devolução</option>
              </Select>
            </Field>
            <Field label="Quantidade"><Input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></Field>
            <Field label="Motivo"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" disabled={move.isPending}>Registrar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">Saldos</h2>
        {products.isLoading ? (
          <Loading />
        ) : (
          <Table head={['Produto', 'Saldo', 'Mínimo', 'Status']}>
            {products.data?.map((p) => {
              const q = num(p.inventory?.quantity);
              const m = num(p.inventory?.minQuantity);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{p.name}</td>
                  <td className="px-4 py-3">{q} {p.unit}</td>
                  <td className="px-4 py-3">{m}</td>
                  <td className="px-4 py-3">{q <= m ? <Badge tone="amber">baixo</Badge> : <Badge tone="green">ok</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <h2 className="mb-3 font-medium text-slate-800 dark:text-slate-100">Movimentações</h2>
      {movements.isLoading ? (
        <Loading />
      ) : !movements.data?.length ? (
        <EmptyState>Sem movimentações.</EmptyState>
      ) : (
        <Table head={['Data', 'Produto', 'Tipo', 'Qtd', 'Saldo', 'Motivo']}>
          {movements.data.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3">{dateTime(m.createdAt)}</td>
              <td className="px-4 py-3">{m.product?.name}</td>
              <td className="px-4 py-3"><Badge tone={['IN', 'RETURN'].includes(m.type) ? 'green' : m.type === 'ADJUST' ? 'blue' : 'amber'}>{TYPE_LABELS[m.type] ?? m.type}</Badge></td>
              <td className="px-4 py-3">{num(m.quantity)}</td>
              <td className="px-4 py-3">{num(m.balanceAfter)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{m.reason || m.reference || '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
