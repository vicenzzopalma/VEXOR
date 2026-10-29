import { describe, expect, it } from 'vitest';
import { organizationForEsferaToken } from '../../apps/api/src/workflows/opt-out.service';

const raw = JSON.stringify({
  'org-a': { baseUrl: 'http://127.0.0.1:8080', companyId: 1, token: 'token-da-empresa-a-123456' },
  'org-b': { baseUrl: 'http://127.0.0.1:8080', companyId: 2, token: 'token-da-empresa-b-123456' },
});

describe('entrada de mensagens do celular de disparo (Esfera)', () => {
  it('identifica a organização pelo token e pela empresa', () => {
    expect(organizationForEsferaToken(1, 'token-da-empresa-a-123456', raw)).toBe('org-a');
    expect(organizationForEsferaToken(2, 'token-da-empresa-b-123456', raw)).toBe('org-b');
  });
  it('recusa token de outra empresa, token errado ou sem configuração', () => {
    expect(organizationForEsferaToken(2, 'token-da-empresa-a-123456', raw)).toBeUndefined();
    expect(organizationForEsferaToken(1, 'token-errado-000000000000', raw)).toBeUndefined();
    expect(organizationForEsferaToken(1, '', raw)).toBeUndefined();
    expect(organizationForEsferaToken(1, 'token-da-empresa-a-123456', undefined)).toBeUndefined();
  });
});
