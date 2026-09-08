import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'ghost' && 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200', className)}>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'slate' && 'bg-slate-100 text-slate-600',
        tone === 'green' && 'bg-green-100 text-green-700',
        tone === 'amber' && 'bg-amber-100 text-amber-700',
        tone === 'red' && 'bg-red-100 text-red-700',
      )}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}
