import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Field, Loading, PageHeader, Select, Input, Table } from '../components/ui';
import { dateTime } from '../utils/format';

export function AutomationsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ name: string; trigger: string; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opts = useQuery({
    queryKey: ['automation-options'],
    queryFn: async () => (await api.get('/automations/options')).data.data as { triggers: string[]; actions: string[] },
  });
  const list = useQuery({
    queryKey: ['automations'],
    queryFn: async () => (await api.get('/automations')).data.data as any[],
  });
  const create = useMutation({
    mutationFn: async () => api.post('/automations', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] });
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => api.put(`/automations/${v.id}`, { active: v.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/automations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Automações"
        subtitle="Gatilho → Ação (verificação de contas, alertas de estoque, resumo semanal)"
        action={
          <Button
            onClick={() =>
              setForm({ name: '', trigger: opts.data?.triggers[0] ?? 'schedule.daily', action: opts.data?.actions[0] ?? 'notify' })
            }
          >
            Nova automação
          </Button>
        }
      />
      {form && opts.data && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Gatilho">
              <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
                {opts.data.triggers.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Ação">
              <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                {opts.data.actions.map((a) => <option key={a}>{a}</option>)}
              </Select>
            </Field>
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}
      {list.isLoading ? (
        <Loading />
      ) : (
        <Table head={['Nome', 'Gatilho', 'Ação', 'Ativa', 'Última execução', '']}>
          {list.data?.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{a.name}</td>
              <td className="px-4 py-3"><code className="text-xs">{a.trigger}</code></td>
              <td className="px-4 py-3"><code className="text-xs">{a.action}</code></td>
              <td className="px-4 py-3"><Badge tone={a.active ? 'green' : 'slate'}>{a.active ? 'sim' : 'não'}</Badge></td>
              <td className="px-4 py-3">{a.lastRunAt ? dateTime(a.lastRunAt) : '-'}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: a.id, active: !a.active })}>
                  {a.active ? 'Pausar' : 'Ativar'}
                </Button>{' '}
                <button className="text-xs text-red-600 hover:underline" onClick={() => remove.mutate(a.id)}>excluir</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
