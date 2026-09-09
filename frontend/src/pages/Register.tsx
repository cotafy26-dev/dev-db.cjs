import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../stores/auth';
import { Button, Card, Field, Input } from '../components/ui';

export function RegisterPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', segment: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        company: { name: form.companyName, segment: form.segment || undefined },
        user: { name: form.name, email: form.email, password: form.password },
      });
      setSession(res.data.data.user, res.data.data.tokens);
      navigate('/onboarding');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">Criar empresa</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Teste grátis de 14 dias</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome da empresa"><Input value={form.companyName} onChange={set('companyName')} required minLength={2} /></Field>
          <Field label="Segmento (opcional)"><Input value={form.segment} onChange={set('segment')} placeholder="Ex.: Varejo" /></Field>
          <Field label="Seu nome"><Input value={form.name} onChange={set('name')} required minLength={2} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Senha (mín. 8)"><Input type="password" value={form.password} onChange={set('password')} required minLength={8} /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Criando...' : 'Criar conta'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Já tem conta? <Link to="/login" className="font-medium text-brand-600">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
