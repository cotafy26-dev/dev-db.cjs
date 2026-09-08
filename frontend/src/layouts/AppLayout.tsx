import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../stores/auth';
import { api } from '../api/client';

const NAV = [
  { to: '/', label: 'Painel', end: true },
  { to: '/assistente', label: 'Assistente IA' },
  { to: '/vendas', label: 'Vendas' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/produtos', label: 'Produtos' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/configuracoes', label: 'Configurações' },
];

export function AppLayout() {
  const { user, tokens, clear } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    try {
      if (tokens?.refreshToken) await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
    } catch {
      /* ignore */
    }
    clear();
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-brand-700">HERMES IA</div>
          <div className="mt-0.5 text-xs text-slate-400">{user?.companyName}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'block rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="px-2 py-1 text-xs text-slate-500">{user?.email}</div>
          <button onClick={logout} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
