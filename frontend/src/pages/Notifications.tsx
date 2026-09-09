import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Button, EmptyState, Loading, PageHeader } from '../components/ui';
import { dateTime } from '../utils/format';

const TONE: Record<string, 'amber' | 'red' | 'blue' | 'slate'> = {
  LOW_STOCK: 'amber',
  OVERDUE_RECEIVABLE: 'red',
  OVERDUE_PAYABLE: 'red',
  APPOINTMENT: 'blue',
  SYSTEM: 'slate',
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: async () => (await api.get('/notifications', { params: { pageSize: 100 } })).data.data as any[],
  });
  const readAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readOne = useMutation({
    mutationFn: async (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div>
      <PageHeader title="Notificações" action={<Button variant="ghost" onClick={() => readAll.mutate()}>Marcar todas como lidas</Button>} />
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <EmptyState>Sem notificações.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.data.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl p-4 ring-1 ${n.readAt ? 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800' : 'bg-brand-50 ring-brand-100 dark:bg-brand-500/10 dark:ring-brand-500/20'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TONE[n.type] ?? 'slate'}>{n.type}</Badge>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">{dateTime(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <button className="text-xs text-brand-600 hover:underline" onClick={() => readOne.mutate(n.id)}>
                    marcar lida
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
