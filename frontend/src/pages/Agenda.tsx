import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Table } from '../components/ui';
import { dateTime } from '../utils/format';

export function AgendaPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ title: string; startsAt: string; location: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ['agenda'],
    queryFn: async () => (await api.get('/agenda', { params: { pageSize: 100 } })).data.data as any[],
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/agenda', {
          title: form!.title,
          startsAt: new Date(form!.startsAt).toISOString(),
          location: form!.location || undefined,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda'] });
      setForm(null);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Agenda"
        action={<Button onClick={() => setForm({ title: '', startsAt: '', location: '' })}>Novo compromisso</Button>}
      />

      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Título">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Data e hora">
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
            </Field>
            <Field label="Local">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {events.isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !events.data?.length ? (
        <EmptyState>Nenhum compromisso.</EmptyState>
      ) : (
        <Table head={['Quando', 'Título', 'Cliente', 'Local']}>
          {events.data.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 text-slate-500">{dateTime(e.startsAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-700">{e.title}</td>
              <td className="px-4 py-3 text-slate-500">{e.customer?.name ?? '-'}</td>
              <td className="px-4 py-3 text-slate-500">{e.location ?? '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
