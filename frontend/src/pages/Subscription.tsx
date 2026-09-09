import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Card, Loading, PageHeader } from '../components/ui';
import { brl, dateShort } from '../utils/format';

export function SubscriptionPage() {
  const company = useQuery({
    queryKey: ['company'],
    queryFn: async () => (await api.get('/company')).data.data as any,
  });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.get('/company/plans')).data.data as any[],
  });

  if (company.isLoading || plans.isLoading) return <Loading />;
  const sub = company.data?.subscription;

  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Plano atual e comparativo" />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Plano atual</div>
            <div className="text-xl font-semibold">{sub?.plan?.name ?? 'BASIC'}</div>
          </div>
          <Badge tone={sub?.status === 'ACTIVE' ? 'green' : 'amber'}>{sub?.status ?? 'TRIALING'}</Badge>
          {sub?.trialEndsAt && (
            <span className="text-sm text-slate-500">Trial até {dateShort(sub.trialEndsAt)}</span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id} className={sub?.plan?.code === p.code ? 'ring-2 ring-brand-500' : ''}>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">{p.name}</div>
            <div className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
              {p.priceCents ? brl(p.priceCents / 100) : 'Grátis'}
              {p.priceCents ? <span className="text-sm font-normal text-slate-400">/mês</span> : null}
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <li>Até {p.maxUsers} usuários</li>
              <li>{p.features?.aiMessagesPerMonth?.toLocaleString('pt-BR')} mensagens IA/mês</li>
              {p.features?.automations && <li>{p.features.automations} automações</li>}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        O processamento de pagamento não está habilitado nesta versão — a arquitetura está pronta para integração futura.
      </p>
    </div>
  );
}
