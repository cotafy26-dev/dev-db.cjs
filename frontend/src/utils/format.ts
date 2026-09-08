export function brl(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function num(value: number | string | null | undefined): number {
  return typeof value === 'string' ? Number(value) : (value ?? 0);
}

export function dateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function dateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transferência',
  BOLETO: 'Boleto',
  OTHER: 'Outro',
};

export const STATUS_LABELS: Record<string, string> = {
  PAID: 'Pago',
  PARTIAL: 'Parcial',
  PENDING: 'Pendente',
  OPEN: 'Em aberto',
  CANCELED: 'Cancelado',
  SCHEDULED: 'Agendado',
  DONE: 'Concluído',
};
