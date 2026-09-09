import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Button, Card, Loading, PageHeader } from '../components/ui';
import { dateTime } from '../utils/format';

export function IntegrationsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['integration-settings'],
    queryFn: async () => (await api.get('/settings/integrations')).data.data as { integrations: any[]; enabledChannels: string[] },
  });
  const links = useQuery({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data.data as any[],
  });
  const genCode = useMutation({
    mutationFn: async (channel: string) => (await api.post('/channels/pairing', { channel })).data.data,
  });
  const unlink = useMutation({
    mutationFn: async (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });

  return (
    <div>
      <PageHeader title="Integrações" subtitle="Canais de mensagem e serviços externos" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-medium text-slate-800 dark:text-slate-100">Canais habilitados no servidor</h2>
          <div className="flex flex-wrap gap-2">
            {settings.data?.enabledChannels.length
              ? settings.data.enabledChannels.map((c) => <Badge key={c} tone="green">{c}</Badge>)
              : <span className="text-sm text-slate-500">Nenhum canal configurado (defina TELEGRAM_BOT_TOKEN / WHATSAPP_*).</span>}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => genCode.mutate('TELEGRAM')}>Código Telegram</Button>
            <Button size="sm" variant="ghost" onClick={() => genCode.mutate('WHATSAPP')}>Código WhatsApp</Button>
          </div>
          {genCode.data && (
            <div className="mt-4 rounded-lg bg-brand-50 p-4 text-sm dark:bg-brand-500/10">
              <div className="text-lg font-bold tracking-widest text-brand-700 dark:text-brand-300">{genCode.data.code}</div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{genCode.data.instructions}</p>
              <p className="mt-1 text-xs text-slate-400">Válido por {genCode.data.expiresInMinutes} min.</p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-medium text-slate-800 dark:text-slate-100">Canais conectados</h2>
          {links.isLoading ? (
            <Loading />
          ) : !links.data?.length ? (
            <p className="text-sm text-slate-500">Nenhum canal conectado.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {links.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <span>
                    <Badge>{l.channel}</Badge>{' '}
                    <span className="ml-2 text-slate-700 dark:text-slate-200">{l.displayName ?? l.externalId}</span>
                    <span className="ml-2 text-xs text-slate-400">{dateTime(l.createdAt)}</span>
                  </span>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => unlink.mutate(l.id)}>
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
