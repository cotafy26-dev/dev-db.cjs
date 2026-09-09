import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Table } from '../components/ui';
import { brl, dateShort } from '../utils/format';
import { useAuth } from '../stores/auth';
import { can } from '../lib/permissions';

export function CustomersPage() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { search: search || undefined, pageSize: 50 } })).data.data as any[],
  });

  const history = useQuery({
    queryKey: ['customer-history', historyId],
    queryFn: async () => (await api.get(`/customers/${historyId}/history`)).data.data as any,
    enabled: !!historyId,
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/customers', {
        name: form!.name,
        phone: form!.phone || undefined,
        whatsapp: form!.whatsapp || undefined,
        email: form!.email || undefined,
        document: form!.document || undefined,
        addressLine: form!.addressLine || undefined,
        city: form!.city || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.post(`/company/lgpd/erase-customer/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={can(role, 'customer.create') ? <Button onClick={() => setForm({ name: '', phone: '', whatsapp: '', email: '', document: '', addressLine: '', city: '' })}>Novo cliente</Button> : undefined}
      />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="CPF/CNPJ"><Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
            <Field label="Cidade"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Endereço"><Input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4">
        <Input placeholder="Buscar por nome, telefone, e-mail ou documento" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState>Nenhum cliente cadastrado.</EmptyState>
      ) : (
        <Table head={['Nome', 'Contato', 'Cidade', '']}>
          {data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{c.name}</td>
              <td className="px-4 py-3 text-slate-500">{c.whatsapp || c.phone || c.email || '-'}</td>
              <td className="px-4 py-3 text-slate-500">{c.city || '-'}</td>
              <td className="px-4 py-3 text-right">
                <button className="text-xs text-brand-600 hover:underline" onClick={() => setHistoryId(c.id)}>histórico</button>
                {can(role, 'customer.delete') && (
                  <>
                    {' · '}
                    <button className="text-xs text-red-600 hover:underline" onClick={() => window.confirm('Anonimizar este cliente (LGPD)?') && remove.mutate(c.id)}>
                      excluir
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {historyId && (
        <Modal title="Histórico do cliente" onClose={() => setHistoryId(null)}>
          {history.isLoading || !history.data ? (
            <Loading />
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-100">{history.data.customer.name}</span>
                <Badge tone={history.data.balance > 0 ? 'red' : 'green'}>Saldo devedor: {brl(history.data.balance)}</Badge>
              </div>
              <div>Total em compras: <b>{brl(history.data.totalPurchases)}</b></div>
              <div>
                <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">Últimas compras</div>
                {history.data.sales.length === 0 ? <p className="text-slate-400">Nenhuma.</p> : (
                  <ul className="space-y-1">
                    {history.data.sales.map((s: any) => (
                      <li key={s.id} className="flex justify-between">
                        <span>#{s.number} · {dateShort(s.soldAt)}</span>
                        <span>{brl(s.total)} · {s.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">Contas a receber</div>
                {history.data.receivables.length === 0 ? <p className="text-slate-400">Nenhuma.</p> : (
                  <ul className="space-y-1">
                    {history.data.receivables.map((r: any) => (
                      <li key={r.id} className="flex justify-between">
                        <span>{r.description}</span>
                        <span>{brl(r.amount)} · {r.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
