import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table } from '../components/ui';
import { brl, num } from '../utils/format';

export function ProductsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products', { params: { pageSize: 200 } })).data.data as any[],
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data.data as any[],
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/products', {
        name: form!.name,
        price: num(form!.price),
        cost: form!.cost ? num(form!.cost) : undefined,
        stock: form!.stock ? num(form!.stock) : 0,
        minStock: form!.minStock ? num(form!.minStock) : 0,
        barcode: form!.barcode || undefined,
        categoryName: form!.categoryName || undefined,
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
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        action={<Button onClick={() => setForm({ name: '', price: '', cost: '', stock: '0', minStock: '0', barcode: '', categoryName: '' })}>Novo produto</Button>}
      />

      {categories.data && categories.data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.data.map((c) => (
            <Badge key={c.id}>{c.name} ({c._count?.products ?? 0})</Badge>
          ))}
        </div>
      )}

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Categoria">
              <Input list="cats" value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} placeholder="Digite ou escolha" />
              <datalist id="cats">{categories.data?.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </Field>
            <Field label="Preço (R$)"><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
            <Field label="Custo (R$)"><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Estoque inicial"><Input type="number" step="0.001" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="Estoque mínimo"><Input type="number" step="0.001" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></Field>
            <Field label="Código de barras"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {products.isLoading ? (
        <Loading />
      ) : !products.data?.length ? (
        <EmptyState>Nenhum produto cadastrado.</EmptyState>
      ) : (
        <Table head={['Produto', 'Categoria', 'Preço', 'Custo', 'Estoque', 'Mínimo']}>
          {products.data.map((p) => {
            const q = num(p.inventory?.quantity);
            const m = num(p.inventory?.minQuantity);
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{p.name}</td>
                <td className="px-4 py-3 text-slate-500">{p.category?.name ?? '-'}</td>
                <td className="px-4 py-3">{brl(p.price)}</td>
                <td className="px-4 py-3 text-slate-500">{p.cost ? brl(p.cost) : '-'}</td>
                <td className="px-4 py-3">{q <= m ? <Badge tone="amber">{q} {p.unit}</Badge> : <span>{q} {p.unit}</span>}</td>
                <td className="px-4 py-3 text-slate-500">{m}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
