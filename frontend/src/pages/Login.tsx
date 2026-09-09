import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../stores/auth';
import { Button, Card, Field, Input } from '../components/ui';

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@hermes.ia');
  const [password, setPassword] = useState('hermes123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const session = res.data.data.user;
      setSession(session, res.data.data.tokens);
      navigate(session.onboarded === false ? '/onboarding' : '/');
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
          <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">HERMES IA</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestão empresarial por conversa</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Não tem conta?{' '}
          <Link to="/registrar" className="font-medium text-brand-600">
            Criar empresa
          </Link>
        </p>
      </Card>
    </div>
  );
}
