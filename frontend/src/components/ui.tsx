import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const card = 'rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800';
const inputBase =
  'w-full rounded-lg border px-3 py-2 text-sm outline-none transition ' +
  'border-slate-300 bg-white text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-brand-500/30';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; size?: 'md' | 'sm' }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50',
        size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'ghost' &&
          'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx(card, 'p-5 shadow-sm', className)}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputBase, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(inputBase, className)} {...props} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className={clsx('overflow-x-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800')}>
      <table className="min-w-full divide-y divide-slate-200 bg-white text-sm dark:divide-slate-800 dark:bg-slate-900">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx('px-4 py-3 text-slate-600 dark:text-slate-300', className)}>{children}</td>;
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'slate' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        tone === 'green' && 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
        tone === 'amber' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        tone === 'red' && 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
        tone === 'blue' && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
      )}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-slate-700 dark:border-t-brand-400" />;
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'red' }) {
  return (
    <Card>
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={clsx(
          'mt-2 text-2xl font-semibold',
          tone === 'green' && 'text-green-600 dark:text-green-400',
          tone === 'red' && 'text-red-600 dark:text-red-400',
          !tone && 'text-slate-900 dark:text-white',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={clsx(card, 'w-full max-w-lg p-6 shadow-xl')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-sm transition',
            value === t.id
              ? 'bg-brand-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
