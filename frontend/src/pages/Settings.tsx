import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../stores/auth';
import { dateTime } from '../utils/format';

export function SettingsPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [pairing, setPairing] = useState<{ code: string; instructions: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data.data as any[],
  });
  const aiHealth = useQuery({
    queryKey: ['ai-health'],
    queryFn: async () => (await api.get('/ai/health')).data.data as { provider: string; model: string; ok: boolean; detail: string },
  });

  const genCode = useMutation({
    mutationFn: async () => (await api.post('/channels/pairing', { channel: 'TELEGRAM' })).data.data,
    onSuccess: (d) => {
      setPairing(d);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });

  return (
    <div>
      <PageHeader title="Configurações" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium text-slate-800">Empresa</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Nome</dt><dd className="text-slate-800">{user?.companyName}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Seu papel</dt><dd className="text-slate-800">{user?.role}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">E-mail</dt><dd className="text-slate-800">{user?.email}</dd></div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-slate-800">Assistente (IA)</h2>
          {aiHealth.isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Provedor</span><span>{aiHealth.data?.provider}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Modelo</span><span>{aiHealth.data?.model}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <Badge tone={aiHealth.data?.ok ? 'green' : 'red'}>{aiHealth.data?.ok ? 'online' : 'offline'}</Badge>
              </div>
              <p className="pt-1 text-xs text-slate-400">{aiHealth.data?.detail}</p>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-slate-800">Canais — Telegram / WhatsApp</h2>
            <Button onClick={() => genCode.mutate()} disabled={genCode.isPending}>
              Gerar código de conexão
            </Button>
          </div>

          {pairing && (
            <div className="mb-4 rounded-lg bg-brand-50 p-4 text-sm">
              <div className="text-lg font-bold tracking-widest text-brand-700">{pairing.code}</div>
              <p className="mt-1 text-slate-600">{pairing.instructions}</p>
              <p className="mt-1 text-xs text-slate-400">Válido por 15 minutos.</p>
            </div>
          )}
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {links.isLoading ? (
            <Spinner />
          ) : !links.data?.length ? (
            <p className="text-sm text-slate-500">Nenhum canal conectado.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {links.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <span>
                    <Badge>{l.channel}</Badge> <span className="ml-2 text-slate-700">{l.displayName ?? l.externalId}</span>
                    <span className="ml-2 text-xs text-slate-400">{dateTime(l.createdAt)}</span>
                  </span>
                  <button className="text-sm text-red-600 hover:underline" onClick={() => unlink.mutate(l.id)}>
                    desconectar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
