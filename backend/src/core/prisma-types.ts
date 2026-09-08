import type { prisma } from './prisma';

/**
 * Client aceito pelos services: o client estendido ou o objeto de transacao
 * interativa (`$transaction(async (tx) => ...)`).
 */
export type AppPrisma = typeof prisma;
export type Db = AppPrisma | Parameters<Parameters<AppPrisma['$transaction']>[0]>[0];
