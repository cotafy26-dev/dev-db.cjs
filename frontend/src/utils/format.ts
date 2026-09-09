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
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmada',
  PAID: 'Paga',
  PARTIAL: 'Parcial',
  PENDING: 'Pendente',
  OPEN: 'Em aberto',
  CANCELED: 'Cancelada',
  SCHEDULED: 'Agendado',
  DONE: 'Concluído',
  SENT: 'Enviada',
};

export function statusTone(s: string): 'green' | 'amber' | 'red' | 'slate' {
  if (['PAID', 'DONE'].includes(s)) return 'green';
  if (['CANCELED'].includes(s)) return 'red';
  if (['PARTIAL', 'CONFIRMED', 'OPEN', 'PENDING', 'SENT', 'SCHEDULED'].includes(s)) return 'amber';
  return 'slate';
}
