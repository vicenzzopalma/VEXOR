import { test, expect } from '@playwright/test';
test('fluxo do SAIR protegido, configuração real e inspetor acessível', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible();
  await page.locator('.project-card').first().getByRole('link').click();
  await page.getByRole('link', { name: 'Abrir fluxo do SAIR' }).click();
  await expect(page.getByRole('heading', { name: 'Fluxo do SAIR' })).toBeVisible();
  const stages = page.getByRole('navigation', { name: 'Etapas do descadastro' });
  await stages.getByRole('button', { name: 'Classificar pedido de saída' }).click();
  await expect(page.getByRole('complementary', { name: 'Inspetor do descadastro' })).toContainText(
    'sair por favor',
  );
  await stages.getByRole('button', { name: 'Confirmação ao devedor' }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspetor do descadastro' });
  await expect(inspector).toContainText('Este pedido não altera e não reconhece nenhum débito.');
  await expect(inspector).toContainText('Desligada'); // isolated test process never sends
  await expect(page.getByText('Sistema · protegido')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/validation/system-opt-out-${info.project.name}.png`, fullPage: true });
});
