import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Table } from '../components/ui';
import { brl, num } from '../utils/format';
import type { Paginated, Product } from '../types';

export function ProductsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ name: string; price: string; stock: string; minStock: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Paginated<Product>>('/products', { params: { pageSize: 100 } })).data,
  });

  const create = useMutation({
    mutationFn: async (p: { name: string; price: number; stock: number; minStock: number }) =>
      (await api.post('/products', p)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setForm(null);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const adjust = useMutation({
    mutationFn: async (v: { productId: string; quantity: number }) =>
      (await api.post('/inventory/movements', { ...v, type: 'ADJUST', reason: 'Ajuste manual' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    create.mutate({
      name: form.name,
      price: num(form.price),
      stock: num(form.stock),
      minStock: num(form.minStock),
    });
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        action={<Button onClick={() => setForm({ name: '', price: '', stock: '0', minStock: '0' })}>Novo produto</Button>}
      />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Preço (R$)">
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </Field>
            <Field label="Estoque inicial">
              <Input type="number" step="0.001" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </Field>
            <Field label="Estoque mínimo">
              <Input type="number" step="0.001" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </Field>
            {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data?.data.length ? (
        <EmptyState>Nenhum produto cadastrado.</EmptyState>
      ) : (
        <Table head={['Produto', 'Preço', 'Estoque', 'Mínimo', 'Ajustar']}>
          {data.data.map((p) => {
            const low = num(p.stock) <= num(p.minStock);
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-slate-700">{p.name}</td>
                <td className="px-4 py-3 text-slate-500">{brl(p.price)}</td>
                <td className="px-4 py-3">
                  {low ? <Badge tone="amber">{num(p.stock)} {p.unit}</Badge> : <span className="text-slate-500">{num(p.stock)} {p.unit}</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{num(p.minStock)}</td>
                <td className="px-4 py-3">
                  <button
                    className="text-sm text-brand-600 hover:underline"
                    onClick={() => {
                      const v = prompt(`Novo saldo de estoque para "${p.name}"`, String(num(p.stock)));
                      if (v != null && !Number.isNaN(Number(v))) adjust.mutate({ productId: p.id, quantity: Number(v) });
                    }}
                  >
                    definir saldo
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
