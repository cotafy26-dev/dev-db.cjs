import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../stores/auth';
import { Button, Card, Field, Input, Select } from '../components/ui';

const STEPS = ['Empresa', 'Configurações', 'Canais', 'Pronto'];
const TZ = ['America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Recife'];

export function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ segment: '', timezone: 'America/Sao_Paulo', currency: 'BRL' });
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarded) return <Navigate to="/" replace />;

  const saveCompany = useMutation({
    mutationFn: async () => api.put('/company', { segment: form.segment || null, timezone: form.timezone, currency: form.currency }),
    onError: (e) => setError(apiErrorMessage(e)),
    onSuccess: () => setStep(2),
  });
  const genCode = useMutation({
    mutationFn: async () => (await api.post('/channels/pairing', { channel: 'TELEGRAM' })).data.data,
    onSuccess: (d) => setCode(d.code),
  });
  const finish = useMutation({
    mutationFn: async () => api.post('/company/onboarding/complete'),
    onSuccess: () => {
      setUser({ ...user, onboarded: true, segment: form.segment, timezone: form.timezone, currency: form.currency });
      navigate('/');
    },
  });

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) saveCompany.mutate();
    else setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  i <= step ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={next} className="space-y-4">
          {step <= 1 && (
            <>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sobre sua empresa</h2>
              <Field label="Segmento / ramo"><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="Ex.: Varejo de roupas" /></Field>
              <Field label="Fuso horário">
                <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {TZ.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Moeda"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} /></Field>
              {step === 0 && <p className="text-sm text-slate-500">Você poderá cadastrar mais usuários depois em Usuários.</p>}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Conectar o Telegram (opcional)</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Gere um código e envie <code>/start CÓDIGO</code> ao bot. O WhatsApp pode ser conectado depois em Integrações.</p>
              <Button type="button" variant="ghost" onClick={() => genCode.mutate()}>Gerar código</Button>
              {code && <div className="rounded-lg bg-brand-50 p-3 text-lg font-bold tracking-widest text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{code}</div>}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tudo pronto! 🎉</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Comece conversando com o Tato: “quanto vendi hoje?”, “paguei 120 de energia”.</p>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Voltar</Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit" disabled={saveCompany.isPending}>Continuar</Button>
            ) : (
              <Button type="button" onClick={() => finish.mutate()} disabled={finish.isPending}>Ir para o painel</Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
