import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken, ttlToMs } from '../src/modules/auth/jwt';
import { UnauthorizedError } from '../src/core/errors';

describe('jwt', () => {
  it('assina e verifica access token', () => {
    const token = signAccessToken({ sub: 'u1', companyId: 'c1', role: 'OWNER', email: 'a@b.com' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.companyId).toBe('c1');
    expect(payload.role).toBe('OWNER');
  });

  it('rejeita token invalido', () => {
    expect(() => verifyAccessToken('nao.e.um.jwt')).toThrow(UnauthorizedError);
  });

  it('ttlToMs converte unidades', () => {
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('30d')).toBe(2_592_000_000);
    expect(ttlToMs('3600')).toBe(3_600_000);
  });
});
