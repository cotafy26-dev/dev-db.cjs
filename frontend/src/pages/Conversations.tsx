import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Card, EmptyState, Loading, PageHeader } from '../components/ui';
import { dateTime } from '../utils/format';

export function ConversationsPage() {
  const [tab, setTab] = useState<'conversas' | 'execucoes'>('conversas');

  const conversations = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => (await api.get('/ai/conversations')).data.data as any[],
    enabled: tab === 'conversas',
  });
  const executions = useQuery({
    queryKey: ['ai-executions'],
    queryFn: async () => (await api.get('/ai/executions')).data.data as any[],
    enabled: tab === 'execucoes',
  });

  return (
    <div>
      <PageHeader title="Conversas IA" subtitle="Histórico e diagnóstico do Tato (AIExecution)" />
      <div className="mb-4 flex gap-2">
        {(['conversas', 'execucoes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'}`}
          >
            {t === 'conversas' ? 'Conversas' : 'Execuções'}
          </button>
        ))}
      </div>

      {tab === 'conversas' &&
        (conversations.isLoading ? (
          <Loading />
        ) : !conversations.data?.length ? (
          <EmptyState>Nenhuma conversa.</EmptyState>
        ) : (
          <div className="space-y-2">
            {conversations.data.map((c) => (
              <Card key={c.id} className="flex items-center justify-between">
                <div>
                  <Badge>{c.channel}</Badge>
                  <span className="ml-2 text-sm text-slate-700 dark:text-slate-200">{c.title ?? c.externalId ?? 'Conversa'}</span>
                  {c.summary && <p className="mt-1 max-w-2xl truncate text-xs text-slate-400">{c.summary}</p>}
                </div>
                <span className="text-xs text-slate-400">{dateTime(c.lastMessageAt)}</span>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'execucoes' &&
        (executions.isLoading ? (
          <Loading />
        ) : !executions.data?.length ? (
          <EmptyState>Nenhuma execução registrada.</EmptyState>
        ) : (
          <div className="space-y-2">
            {executions.data.map((e) => (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={e.status === 'SUCCESS' ? 'green' : 'red'}>{e.status}</Badge>
                      <Badge>{e.channel}</Badge>
                      <span className="text-xs text-slate-400">{e.iterations} iteração(ões) · {e.durationMs}ms</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">“{e.input}”</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{e.output}</p>
                    {Array.isArray(e.toolCalls) && e.toolCalls.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.toolCalls.map((t: any, i: number) => (
                          <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                            {t.name} · {t.status}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{dateTime(e.createdAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
