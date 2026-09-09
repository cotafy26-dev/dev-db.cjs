import { logger } from './logger';
import { ensurePermissionCatalog } from '../modules/rbac/rbac.service';
import { ensurePlans } from '../modules/plans/plans.service';

/** Dados globais idempotentes garantidos no boot (catalogo de permissoes, planos). */
export async function bootstrapGlobalData(): Promise<void> {
  try {
    await ensurePlans();
    await ensurePermissionCatalog();
    logger.info('Dados globais (planos, permissoes) sincronizados');
  } catch (err) {
    logger.error({ err }, 'Falha ao sincronizar dados globais');
  }
}
