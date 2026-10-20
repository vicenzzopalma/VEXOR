import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  connectionRevision,
  connectorConfigurationReady,
  connectorRegistry,
  openSecrets,
  publicConnectorSettings,
  sealSecrets,
  whatsappAdapter,
} from '@eimax/connectors';
afterEach(() => vi.unstubAllEnvs());
const settings = { phoneNumberId: '1234', apiVersion: 'v99.0' };
const secrets = { accessToken: 'fixture-token', appSecret: 'fixture-secret', verifyToken: 'fixture-verify' };
it('credencial protegida exige conjunto correto do provedor e chave válida', () => {
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  const encrypted = sealSecrets(secrets);
  expect(connectorConfigurationReady('META', settings, encrypted)).toBe(true);
  expect(connectorConfigurationReady('EVOLUTION', settings, encrypted)).toBe(false);
  expect(connectorConfigurationReady('META', {}, encrypted)).toBe(false);
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  expect(connectorConfigurationReady('META', settings, encrypted)).toBe(false);
  expect(() => openSecrets(encrypted)).toThrow('INVALID_CREDENTIALS');
});
it('revisão de outbox ignora polling e templates baixados, mas muda com identidade ou segredo', () => {
  const connection = {
    id: 'account',
    organizationId: 'org',
    provider: 'META',
    credentials: 'ciphertext',
    settings,
  };
  const revision = connectionRevision(connection);
  expect(
    connectionRevision({
      ...connection,
      settings: {
        apiVersion: settings.apiVersion,
        phoneNumberId: settings.phoneNumberId,
        approvedTemplates: [{ name: 'template', language: 'pt_BR' }],
      },
    }),
  ).toBe(revision);
  expect(connectionRevision({ ...connection, credentials: 'different' })).not.toBe(revision);
  expect(connectionRevision({ ...connection, organizationId: 'other' })).not.toBe(revision);
  expect(connectionRevision({ ...connection, settings: { ...settings, phoneNumberId: '5678' } })).not.toBe(
    revision,
  );
});
it('resposta pública remove campos fora da allowlist e preserva templates simples', () => {
  const value = publicConnectorSettings('META', {
    ...settings,
    accessToken: 'must-not-leak',
    approvedTemplates: [{ name: 'welcome', language: 'pt_BR', secret: 'hidden' }],
  });
  expect(value).toEqual({ ...settings, approvedTemplates: [{ name: 'welcome', language: 'pt_BR' }] });
  expect(publicConnectorSettings('UNKNOWN', { apiKey: 'secret' })).toEqual({});
});
it('schemas rejeitam credenciais de outro provedor e quebras de linha em cabeçalhos', () => {
  expect(connectorRegistry.META.credentialsSchema.safeParse({ apiKey: 'fixture' }).success).toBe(false);
  expect(
    connectorRegistry.RESEND.credentialsSchema.safeParse({ apiKey: 'fixture\r\nx-header: value' }).success,
  ).toBe(false);
});
it('adapter WhatsApp padrão bloqueia rede sem habilitação explícita', async () => {
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'false');
  await expect(whatsappAdapter('META', settings, secrets).status()).rejects.toThrow('CONFIGURATION_REQUIRED');
});
it.each([
  ['CONNECTED', 'CONNECTED'],
  ['PENDING', 'CONNECTING'],
  ['DISCONNECTED', 'DISCONNECTED'],
  ['RESTRICTED', 'ERROR'],
])('Meta usa status explícito %s e retorna %s', async (status, expected) => {
  const transport = vi.fn().mockResolvedValue({ id: '1234', status });
  expect(await whatsappAdapter('META', settings, secrets, transport).status()).toBe(expected);
  expect(transport.mock.calls[0][0].searchParams.get('fields')).toContain('status');
});
it('Meta não declara conexão apenas pela leitura do identificador do número', async () => {
  const transport = vi.fn().mockResolvedValue({ id: '1234' });
  await expect(whatsappAdapter('META', settings, secrets, transport).status()).rejects.toThrow(
    'SESSION_STATUS_UNCONFIRMED',
  );
});
