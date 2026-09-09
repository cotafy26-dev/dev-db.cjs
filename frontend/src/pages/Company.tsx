import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, Field, Input, Loading, PageHeader, Select } from '../components/ui';

const TZ = ['America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Recife', 'America/Fortaleza'];

export function CompanyPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const company = useQuery({
    queryKey: ['company'],
    queryFn: async () => (await api.get('/company')).data.data as any,
  });

  useEffect(() => {
    if (company.data) {
      setForm({
        name: company.data.name ?? '',
        segment: company.data.segment ?? '',
        document: company.data.document ?? '',
        phone: company.data.phone ?? '',
        email: company.data.email ?? '',
        timezone: company.data.timezone ?? 'America/Sao_Paulo',
        currency: company.data.currency ?? 'BRL',
        retentionDays: String(company.data.retentionDays ?? 0),
      });
    }
  }, [company.data]);

  const save = useMutation({
    mutationFn: async () =>
      api.put('/company', {
        name: form.name,
        segment: form.segment || null,
        document: form.document || null,
        phone: form.phone || null,
        email: form.email || null,
        timezone: form.timezone,
        currency: form.currency,
        retentionDays: Number(form.retentionDays) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company'] });
      setMsg('Salvo.');
    },
    onError: (e) => setMsg(apiErrorMessage(e)),
  });

  const exportData = async () => {
    const res = await api.get('/company/lgpd/export');
    const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tato-dados-empresa.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (company.isLoading) return <Loading />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div>
      <PageHeader title="Empresa" subtitle="Dados, moeda, fuso horário e LGPD" />
      <Card className="mb-6">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Segmento"><Input value={form.segment ?? ''} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></Field>
          <Field label="CNPJ/CPF"><Input value={form.document ?? ''} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
          <Field label="Telefone"><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Fuso horário">
            <Select value={form.timezone ?? ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {TZ.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Moeda"><Input value={form.currency ?? ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} /></Field>
          <Field label="Retenção de dados (dias, 0 = sem expurgo)">
            <Input type="number" value={form.retentionDays ?? '0'} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>Salvar</Button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium text-slate-800 dark:text-slate-100">LGPD</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Exporte todos os dados da empresa (portabilidade). A exclusão/anonimização de um cliente é feita na tela de Clientes.
        </p>
        <Button variant="ghost" onClick={exportData}>Exportar dados (JSON)</Button>
      </Card>
    </div>
  );
}
