import { afterEach, expect, it, vi } from 'vitest';
import {
  classifyOptOut,
  OPT_OUT_EXACT_PHRASES,
  OPT_OUT_CONFIRMATION_TEXT,
  optOutPhoneKey,
  optOutConfirmationPolicy,
  sendOptOutConfirmation,
  whatsappAdapter,
} from '@eimax/connectors';
afterEach(() => vi.unstubAllEnvs());
it.each(OPT_OUT_EXACT_PHRASES)('frase exata: %s', (text) => expect(classifyOptOut(text)).toBe('OPT_OUT'));
it.each(['sai', 'sar', 'siar', 'sairr', 'saiir', 'saiiir', 'ssaaaiiirr'])('erro isolado: %s', (text) =>
  expect(classifyOptOut(text)).toBe('OPT_OUT'),
);
it.each([
  'para mim tá bom',
  'sai hoje o boleto?',
  'air',
  'sais',
  'sari',
  'para',
  'stopp',
  'pararr',
  'paree',
  'par',
  'pai',
  'sairia',
])('não descadastra: %s', (text) => expect(classifyOptOut(text)).not.toBe('OPT_OUT'));
it.each(['chega', 'pare de brincadeira'])('revisão: %s', (text) =>
  expect(classifyOptOut(text)).toBe('AMBIGUOUS'),
);
it('mantém o texto aprovado, com uma quebra de linha e sem assinatura', () => {
  expect(OPT_OUT_CONFIRMATION_TEXT.split('\n')).toHaveLength(2);
  expect(OPT_OUT_CONFIRMATION_TEXT).toMatch(
    /Consumidor\.\nEste pedido não altera e não reconhece nenhum débito\.$/,
  );
  expect(OPT_OUT_CONFIRMATION_TEXT).not.toContain('Equipe');
});
it('chave preserva DDD 55 e remove apenas DDI brasileiro e nono dígito', () => {
  expect(optOutPhoneKey('5575988052539')).toBe('7588052539');
  expect(optOutPhoneKey('75988052539')).toBe('7588052539');
  expect(optOutPhoneKey('7588052539')).toBe('7588052539');
  expect(optOutPhoneKey('55988052539')).toBe('5588052539');
});
it('liberação padrão, desligamento e allowlist opcional', () => {
  vi.stubEnv('OPT_OUT_CONFIRMATION_ENABLED', 'true');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '');
  expect(optOutConfirmationPolicy('5511999999999')).toBe('ALLOWED');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '5575988052539');
  expect(optOutConfirmationPolicy('7588052539')).toBe('ALLOWED');
  expect(optOutConfirmationPolicy('5511999999999')).toBe('HELD');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ENABLED', 'false');
  expect(optOutConfirmationPolicy('7588052539')).toBe('DISABLED');
});
it('a exceção usa somente texto fixo; envio normal continua bloqueado', async () => {
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'false');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ENABLED', 'true');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '');
  vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example.com');
  const transport = vi.fn(async (_url: URL, method: string) =>
    method === 'GET' ? { instance: { state: 'open' } } : { key: { id: 'confirmed' }, status: 'SENT' },
  );
  const settings = { origin: 'https://gateway.example.com', instance: 'test' };
  await sendOptOutConfirmation('EVOLUTION', settings, { apiKey: 'fixture' }, '+5575988052539', transport);
  expect(transport.mock.calls[1]?.[1]).toBe('POST');
  expect((transport.mock.calls as unknown[][])[1]?.[3]).toEqual({
    number: '5575988052539',
    text: OPT_OUT_CONFIRMATION_TEXT,
  });
  await expect(
    whatsappAdapter('EVOLUTION', settings, { apiKey: 'fixture' }).send({
      to: '5575988052539',
      text: 'Qualquer outra mensagem',
    }),
  ).rejects.toThrow('CONFIGURATION_REQUIRED');
});
