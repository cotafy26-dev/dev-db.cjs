import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Table } from '../components/ui';
import { brl } from '../utils/format';
import type { Customer, Paginated } from '../types';

export function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () =>
      (await api.get<Paginated<Customer>>('/customers', { params: { search: search || undefined, pageSize: 50 } })).data,
  });

  const create = useMutation({
    mutationFn: async (payload: { name: string; phone?: string; email?: string }) =>
      (await api.post('/customers', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm(null);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    create.mutate({ name: form.name, phone: form.phone || undefined, email: form.email || undefined });
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={
          <Button onClick={() => setForm({ name: '', phone: '', email: '' })}>Novo cliente</Button>
        }
      />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Telefone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>
                Salvar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4">
        <Input placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.data.length ? (
        <EmptyState>Nenhum cliente cadastrado.</EmptyState>
      ) : (
        <Table head={['Nome', 'Telefone', 'E-mail']}>
          {data.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium text-slate-700">{c.name}</td>
              <td className="px-4 py-3 text-slate-500">{c.phone || '-'}</td>
              <td className="px-4 py-3 text-slate-500">{c.email || '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
