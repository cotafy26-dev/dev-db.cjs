import { FormEvent, ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, EmptyState, Field, Input, Loading, PageHeader, Table } from './ui';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

export interface FormFieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'date';
  required?: boolean;
}

interface Props<T> {
  title: string;
  subtitle?: string;
  endpoint: string;
  queryKey: string;
  columns: Column<T>[];
  getRows?: (data: any) => T[];
  createFields?: FormFieldDef[];
  createLabel?: string;
  transformCreate?: (v: Record<string, string>) => Record<string, unknown>;
  rowActions?: (row: T, reload: () => void) => ReactNode;
  extra?: ReactNode;
}

export function SimpleListPage<T extends { id: string }>({
  title,
  subtitle,
  endpoint,
  queryKey,
  columns,
  getRows = (d) => (d?.data ?? d ?? []) as T[],
  createFields,
  createLabel = 'Novo',
  transformCreate,
  rowActions,
  extra,
}: Props<T>) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => (await api.get(endpoint, { params: { pageSize: 100 } })).data,
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post(endpoint, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      setForm(null);
      setError(null);
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const reload = () => qc.invalidateQueries({ queryKey: [queryKey] });
  const rows = getRows(data);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) if (v !== '') cleaned[k] = v;
    create.mutate(transformCreate ? transformCreate(cleaned) : cleaned);
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          createFields ? (
            <Button onClick={() => setForm(Object.fromEntries(createFields.map((f) => [f.name, ''])))}>{createLabel}</Button>
          ) : undefined
        }
      />
      {extra}
      {form && createFields && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            {createFields.map((f) => (
              <Field key={f.name} label={f.label}>
                <Input
                  type={f.type ?? 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              </Field>
            ))}
            {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState>Nenhum registro.</EmptyState>
      ) : (
        <Table head={[...columns.map((c) => c.header), ...(rowActions ? [''] : [])]}>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c, i) => (
                <td key={i} className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {c.render(row)}
                </td>
              ))}
              {rowActions && <td className="px-4 py-3 text-right">{rowActions(row, reload)}</td>}
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
