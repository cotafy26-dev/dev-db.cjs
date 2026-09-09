import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';
import { useTheme } from '../stores/theme';
import { api } from '../api/client';
import { can } from '../lib/permissions';

interface NavItem {
  to: string;
  label: string;
  perm: string;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operação',
    items: [
      { to: '/', label: 'Dashboard', perm: 'ai', end: true },
      { to: '/assistente', label: 'Assistente IA', perm: 'ai' },
      { to: '/vendas', label: 'Vendas', perm: 'sale' },
      { to: '/clientes', label: 'Clientes', perm: 'customer' },
      { to: '/fornecedores', label: 'Fornecedores', perm: 'supplier' },
      { to: '/produtos', label: 'Produtos', perm: 'product' },
      { to: '/estoque', label: 'Estoque', perm: 'inventory' },
      { to: '/agenda', label: 'Agenda', perm: 'appointment' },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { to: '/financeiro', label: 'Financeiro', perm: 'finance' },
      { to: '/contas-a-receber', label: 'Contas a Receber', perm: 'finance' },
      { to: '/contas-a-pagar', label: 'Contas a Pagar', perm: 'finance' },
      { to: '/cobrancas', label: 'Cobranças', perm: 'charge' },
    ],
  },
  {
    section: 'Gestão',
    items: [
      { to: '/relatorios', label: 'Relatórios', perm: 'report' },
      { to: '/conversas', label: 'Conversas IA', perm: 'audit' },
      { to: '/automacoes', label: 'Automações', perm: 'automation.read' },
      { to: '/integracoes', label: 'Integrações', perm: 'integration.read' },
      { to: '/usuarios', label: 'Usuários', perm: 'user' },
      { to: '/empresa', label: 'Empresa', perm: 'company' },
      { to: '/assinatura', label: 'Assinatura', perm: 'company' },
    ],
  },
];

export function AppLayout() {
  const { user, tokens, clear } = useAuth();
  const { mode, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const notif = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications', { params: { unreadOnly: true, pageSize: 1 } })).data.meta.unread as number,
    refetchInterval: 60_000,
  });

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
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-white transition-transform lg:static lg:translate-x-0',
          'border-slate-200 dark:border-slate-800 dark:bg-slate-900',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-lg font-bold text-brand-700 dark:text-brand-400">HERMES IA</div>
            <div className="mt-0.5 truncate text-xs text-slate-400">{user?.companyName}</div>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 lg:hidden">
            &times;
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => can(user?.role, i.perm));
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.section}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'block rounded-lg px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="truncate px-2 py-1 text-xs text-slate-500">{user?.email} · {user?.role}</div>
          <button
            onClick={logout}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Sair
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:px-8">
          <button onClick={() => setOpen(true)} className="text-slate-500 lg:hidden">
            ☰
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NavLink
              to="/notificacoes"
              className="relative rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              🔔
              {(notif.data ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {notif.data}
                </span>
              )}
            </NavLink>
            <button
              onClick={toggle}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Alternar tema"
            >
              {mode === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
