import { AccountStatus } from '@prisma/client';

/** Status de contas a pagar/receber ainda em aberto. */
export const OPEN_ACCOUNTS: AccountStatus[] = [AccountStatus.OPEN, AccountStatus.PARTIAL];
