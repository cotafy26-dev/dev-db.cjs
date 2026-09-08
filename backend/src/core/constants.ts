import { SettlementStatus } from '@prisma/client';

/** Status de contas a pagar/receber ainda em aberto. */
export const OPEN_SETTLEMENTS: SettlementStatus[] = [
  SettlementStatus.OPEN,
  SettlementStatus.PARTIAL,
];
