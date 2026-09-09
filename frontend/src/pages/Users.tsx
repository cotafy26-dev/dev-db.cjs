import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Table } from '../components/ui';
import { dateShort } from '../utils/format';

const ROLES = ['ADMIN', 'MANAGER', 'SELLER', 'FINANCE'];

export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.data as any[],
  });
  const create = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; role?: string; active?: boolean }) => api.put(`/users/${v.id}`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Perfis: ADMIN, MANAGER, SELLER, FINANCE"
        action={<Button onClick={() => setForm({ name: '', email: '', password: '', role: 'SELLER' })}>Novo usuário</Button>}
      />
      {form && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
            <Field label="Senha (mín. 8)"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></Field>
            <Field label="Perfil">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}
      {list.isLoading ? (
        <Loading />
      ) : (
        <Table head={['Nome', 'E-mail', 'Perfil', 'Ativo', 'Desde', '']}>
          {list.data?.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">
                <Select
                  className="w-32"
                  value={u.role}
                  onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}
                >
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </td>
              <td className="px-4 py-3">
                <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'sim' : 'não'}</Badge>
              </td>
              <td className="px-4 py-3">{dateShort(u.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                  {u.active ? 'Desativar' : 'Ativar'}
                </Button>{' '}
                <button className="text-xs text-red-600 hover:underline" onClick={() => remove.mutate(u.id)}>excluir</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
