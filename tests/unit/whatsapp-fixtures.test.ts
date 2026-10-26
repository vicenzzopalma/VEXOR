import { expect, it } from 'vitest';

it('identifica as fixtures antigas com ponto central e as variantes novas sem atingir contas pessoais', async () => {
  // @ts-expect-error Standalone Node source utility.
  const { isWhatsAppTestFixture } = await import('../../scripts/lib/whatsapp-fixtures.mjs');
  const id = '5336efbe-3fed-4196-b6b2-36c1fe0564ea';
  for (const name of [
    `Fixture de contrato · sem envio externo ${id}`,
    `Fixture de contrato - sem envio externo ${id}`,
    `Phase 5.1 fixture ${id}`,
    'Conta sem provedor 1792521025238',
  ])
    expect(isWhatsAppTestFixture(name)).toBe(true);
  for (const name of [
    'Teste',
    'x',
    'Minha conta',
    'Fixture de contrato · sem envio externo minha conta',
    'Conta sem provedor pessoal',
    `Minha conta ${id}`,
  ])
    expect(isWhatsAppTestFixture(name)).toBe(false);
});
