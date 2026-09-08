import { describe, expect, it } from 'vitest';
import { runWithContext, getContext } from '../src/core/context';
import { tenantWhere, tenantData, ensureSameTenant } from '../src/core/tenant';
import { AppError } from '../src/core/errors';

const ctx = {
  companyId: 'co_123',
  userId: 'user_1',
  role: null,
  source: 'test',
  requestId: 'r1',
};

describe('tenant helpers', () => {
  it('tenantWhere/tenantData falham sem contexto', () => {
    expect(() => tenantWhere({ id: 'x' })).toThrow(AppError);
    expect(() => tenantData({ name: 'x' })).toThrow(AppError);
  });

  it('tenantWhere injeta companyId do contexto', () => {
    runWithContext(ctx, () => {
      expect(tenantWhere({ id: 'x' })).toEqual({ id: 'x', companyId: 'co_123' });
      expect(tenantData({ name: 'y' })).toEqual({ name: 'y', companyId: 'co_123' });
      expect(getContext().companyId).toBe('co_123');
    });
  });

  it('ensureSameTenant bloqueia registro de outro tenant', () => {
    runWithContext(ctx, () => {
      expect(() => ensureSameTenant({ companyId: 'outro' }, 'Cliente')).toThrow();
      expect(ensureSameTenant({ companyId: 'co_123', id: 'ok' } as never)).toBeTruthy();
    });
  });
});
