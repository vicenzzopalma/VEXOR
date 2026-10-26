import { afterEach, expect, it, vi } from 'vitest';
import { managedEvolutionConfiguration, managedEvolutionInstance, whatsappAdapter } from '@eimax/connectors';
afterEach(() => vi.unstubAllEnvs());
it('instâncias automáticas são estáveis e isoladas por organização e conta', () => {
  expect(managedEvolutionInstance('org-a', 'id')).toBe(managedEvolutionInstance('org-a', 'id'));
  expect(managedEvolutionInstance('org-a', 'id')).not.toBe(managedEvolutionInstance('org-b', 'id'));
  expect(managedEvolutionInstance('org-a', 'id')).not.toBe(managedEvolutionInstance('org-a', 'other'));
  expect(managedEvolutionInstance('org-a', 'id')).toMatch(/^[a-z0-9_]{1,80}$/);
});
it('configuração pertence à instalação e deriva segredos independentes sem dados do cliente', () => {
  vi.stubEnv('EVOLUTION_GATEWAY_URL', 'https://gateway.example.com/');
  vi.stubEnv('EVOLUTION_API_KEY', 'fixture-server-api-key');
  vi.stubEnv('EVOLUTION_WEBHOOK_SECRET', 'fixture-server-secret-with-more-than-24-characters');
  const a = managedEvolutionConfiguration('org-a', 'id');
  const b = managedEvolutionConfiguration('org-b', 'id');
  expect(a.settings.origin).toBe('https://gateway.example.com');
  expect(a.secrets.apiKey).toBe('fixture-server-api-key');
  expect(a.secrets.webhookSecret).not.toBe(b.secrets.webhookSecret);
});
it('falha fechada sem infraestrutura configurada', () => {
  vi.stubEnv('EVOLUTION_GATEWAY_URL', '');
  expect(() => managedEvolutionConfiguration('org-a', 'id')).toThrow('WHATSAPP_SERVICE_UNAVAILABLE');
});
it('habilitar sessões não autoriza enviar mensagens a provedores', async () => {
  vi.stubEnv('EVOLUTION_GATEWAY_URL', 'https://gateway.example.com');
  vi.stubEnv('WHATSAPP_SESSION_ENABLED', 'true');
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'false');
  const adapter = whatsappAdapter(
    'EVOLUTION',
    { origin: 'https://gateway.example.com', instance: 'fixture' },
    { apiKey: 'fixture' },
  );
  await expect(adapter.send({ to: '5511999999999', text: 'fixture' })).rejects.toThrow(
    'CONFIGURATION_REQUIRED',
  );
});
