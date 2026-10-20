import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import {
  isPublicIPv4,
  openSecrets,
  sealSecrets,
  validateOrigin,
  verifySignature,
  whatsappAdapter,
} from '@eimax/connectors';
afterEach(() => vi.unstubAllEnvs());
describe('Contratos de conectores (fixtures, sem envio externo)', () => {
  it('criptografa segredos com nonce aleatório e rejeita alteração de ciphertext', () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
    const secret = { apiKey: 'fixture-sensitive-value' };
    const a = sealSecrets(secret);
    const b = sealSecrets(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain(secret.apiKey);
    expect(openSecrets(a)).toEqual(secret);
    const tampered = Buffer.from(a, 'base64');
    tampered[20] ^= 1;
    expect(() => openSecrets(tampered.toString('base64'))).toThrow();
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', '');
    expect(() => sealSecrets(secret)).toThrow();
  });
  it('bloqueia endereços privados, IPv6, origens desconhecidas e URL com credenciais', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.0.1',
      '100.64.0.1',
      '::1',
      '::ffff:127.0.0.1',
      '198.18.0.1',
    ])
      expect(isPublicIPv4(address)).toBe(false);
    expect(isPublicIPv4('8.8.8.8')).toBe(true);
    vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example');
    expect(() => validateOrigin('http://gateway.example', 'EVOLUTION')).toThrow();
    expect(() => validateOrigin('https://user:pass@gateway.example', 'EVOLUTION')).toThrow();
    expect(() => validateOrigin('https://evil.example', 'EVOLUTION')).toThrow();
  });
  it('valida HMAC sobre bytes originais, rejeitando assinatura alterada', () => {
    const raw = Buffer.from('{"fixture":true}');
    const secret = 'test-app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verifySignature(raw, signature, secret)).toBe(true);
    expect(verifySignature(Buffer.from('{}'), signature, secret)).toBe(false);
  });
  it('recebe QR do gateway e não infere conexão do QR', async () => {
    vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example');
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ instance: { state: 'close' } })
      .mockResolvedValueOnce({ base64: 'data:image/png;base64,cXItZml4dHVyZQ==' });
    const adapter = whatsappAdapter(
      'EVOLUTION',
      { origin: 'https://gateway.example', instance: 'sales' },
      { apiKey: 'fixture' },
      transport,
    );
    const result = await adapter.connect();
    expect(result.state).toBe('WAITING_FOR_QR');
    expect(result.qr).toContain('data:image/png');
    expect(Date.parse(result.expiresAt!)).toBeGreaterThan(Date.now());
    expect(transport.mock.calls[1][0].pathname).toBe('/instance/connect/sales');
  });
  it('resposta com ID confirma aceitação PENDING; transmissão aguarda confirmação', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ id: 'provider-fixture' }] })
      .mockResolvedValueOnce({});
    const adapter = whatsappAdapter(
      'META',
      { phoneNumberId: '1234', apiVersion: 'v99.0' },
      { accessToken: 'fixture' },
      transport,
    );
    expect(await adapter.send({ to: '+5511999999999', text: 'fixture' })).toEqual({
      providerMessageId: 'provider-fixture',
      status: 'PENDING',
    });
    await expect(adapter.send({ to: '+5511999999999', text: 'fixture' })).rejects.toThrow('UNCERTAIN');
  });
  it('falha de autenticação propaga falha e filtra templates sem aprovação', async () => {
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new Error('AUTHENTICATION_FAILED'))
      .mockResolvedValueOnce({
        data: [
          { name: 'valid', status: 'APPROVED', language: 'pt_BR', components: [] },
          { name: 'pending', status: 'PENDING', language: 'pt_BR' },
          { name: 'dynamic', status: 'APPROVED', language: 'pt_BR', components: [{ text: '{{1}}' }] },
        ],
      });
    const adapter = whatsappAdapter(
      'META',
      { phoneNumberId: '1234', wabaId: '123', apiVersion: 'v99.0' },
      { accessToken: 'fixture' },
      transport,
    );
    await expect(adapter.status()).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(await adapter.templates()).toEqual([{ name: 'valid', language: 'pt_BR' }]);
  });
});
