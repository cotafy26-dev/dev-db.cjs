import { PrismaClient } from '@prisma/client';
import { env, isProd } from './env';
import { logger } from './logger';
import { tryGetContext } from './context';
import { AppError } from './errors';
import { HARD_TENANT_MODELS, TENANT_MODELS } from './tenant';

const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

const basePrisma = new PrismaClient({
  log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  datasources: { db: { url: env.DATABASE_URL } },
});

/**
 * Guarda de tenant: defesa em profundidade sobre o filtro explicito dos services.
 * - Injeta companyId em where/data quando ha contexto.
 * - Bloqueia leitura de modelos de negocio sem contexto de tenant.
 * NB: findUnique/update/delete por id unico nao sao filtrados aqui - os services
 * devem usar finders com tenantWhere() ou ensureSameTenant() apos carregar.
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }: any) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);
        const ctx = tryGetContext();

        if (WHERE_OPS.has(operation)) {
          if (!ctx) {
            if (HARD_TENANT_MODELS.has(model)) {
              throw new AppError(
                'TENANT_CONTEXT_MISSING',
                `Consulta em ${model}.${operation} sem contexto de tenant`,
                500,
              );
            }
            return query(args);
          }
          args.where = { AND: [args.where ?? {}, { companyId: ctx.companyId }] };
          return query(args);
        }

        if (operation === 'create' && ctx && args.data && args.data.companyId === undefined) {
          args.data.companyId = ctx.companyId;
        }
        if (operation === 'createMany' && ctx && Array.isArray(args.data)) {
          args.data = args.data.map((d: Record<string, unknown>) =>
            d.companyId === undefined ? { ...d, companyId: ctx.companyId } : d,
          );
        }
        return query(args);
      },
    },
  },
});

export type AppPrisma = typeof prisma;

/**
 * Client SEM a guarda de tenant. Uso restrito a operacoes de infraestrutura
 * legitimamente cross-tenant (ex.: scan de automacoes agendadas de todas as
 * empresas). NUNCA usar em fluxo de request de usuario.
 */
export const systemPrisma = basePrisma;

export async function connectDatabase(): Promise<void> {
  await basePrisma.$connect();
  logger.info('Banco de dados conectado');
}

export async function disconnectDatabase(): Promise<void> {
  await basePrisma.$disconnect();
}
