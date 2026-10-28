import { test, expect } from '@playwright/test';
test('fluxo do SAIR protegido, configuração real e inspetor acessível', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible();
  await page.locator('.project-card').first().getByRole('link').click();
  await page.getByRole('link', { name: 'Descadastro automático (SAIR)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Descadastro automático (SAIR)' })).toBeVisible();
  await page.locator('.react-flow__node[data-id="classify"]').click();
  const classification = page.getByRole('dialog', { name: 'Classificar SAIR' });
  await expect(classification).toContainText('sair por favor');
  await page.keyboard.press('Escape');
  await expect(classification).toBeHidden();
  await page.locator('.react-flow__node[data-id="confirm"]').click();
  const inspector = page.getByRole('dialog', { name: 'Confirmar ao devedor' });
  await expect(inspector.locator('blockquote')).toHaveJSProperty('textContent',
    'Pronto, seu número foi retirado das nossas mensagens automáticas. Você não receberá mais avisos por este canal, conforme o seu direito de oposição previsto na LGPD (Lei 13.709/2018, art. 18) e as regras de cobrança do Código de Defesa do Consumidor.\nEste pedido não altera e não reconhece nenhum débito.');
  await expect(inspector).toContainText('Desligada'); // isolated test process never sends
  await expect(page.getByText('Somente leitura')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/validation/system-opt-out-${info.project.name}.png`, fullPage: true });
});
