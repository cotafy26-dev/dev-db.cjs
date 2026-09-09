import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Table } from '../components/ui';
import { dateTime, STATUS_LABELS, statusTone } from '../utils/format';

export function AgendaPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ title: string; startsAt: string; location: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => (await api.get('/appointments', { params: { pageSize: 100 } })).data.data as any[],
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/appointments', {
        title: form!.title,
        startsAt: new Date(form!.startsAt).toISOString(),
        location: form!.location || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => api.post(`/appointments/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader title="Agenda" action={<Button onClick={() => setForm({ title: '', startsAt: '', location: '' })}>Novo compromisso</Button>} />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Data e hora"><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></Field>
            <Field label="Local"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {events.isLoading ? (
        <Loading />
      ) : !events.data?.length ? (
        <EmptyState>Nenhum compromisso.</EmptyState>
      ) : (
        <Table head={['Quando', 'Título', 'Cliente', 'Local', 'Status', '']}>
          {events.data.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 text-slate-500">{dateTime(e.startsAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{e.title}</td>
              <td className="px-4 py-3 text-slate-500">{e.customer?.name ?? '-'}</td>
              <td className="px-4 py-3 text-slate-500">{e.location ?? '-'}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(e.status)}>{STATUS_LABELS[e.status] ?? e.status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {e.status === 'SCHEDULED' && (
                  <button className="text-xs text-red-600 hover:underline" onClick={() => cancel.mutate(e.id)}>cancelar</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
