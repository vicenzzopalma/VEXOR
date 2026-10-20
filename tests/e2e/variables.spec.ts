import { test, expect } from '@playwright/test';

test('inserir, editar, persistir e remover uma pílula de variável', async ({ page }, testInfo) => {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`Variáveis ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await page.getByRole('button', { name: 'Enquadrar processo' }).click();
  await page.locator('.react-flow__node[data-id="notify"]').click({ force: true });
  await page.getByRole('button', { name: 'Inserir variável', exact: true }).click();
  await page.getByRole('button', { name: 'Nome do Lead', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Editar variável 2' })).toBeVisible();
  await expect(page.getByText(/Prévia com dados de exemplo:/)).toContainText('Marina Costa');
  await page.getByRole('combobox', { name: 'Editar variável 2' }).selectOption('lead.company');
  await expect(page.getByText(/Prévia com dados de exemplo:/)).toContainText('Acme Studio');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await page.locator('.react-flow__node[data-id="notify"]').click({ force: true });
  await expect(page.getByRole('combobox', { name: 'Editar variável 2' })).toHaveValue('lead.company');
  await page.getByRole('button', { name: 'Remover variável 2' }).click();
  await expect(page.locator('.variable-pill')).toHaveCount(0);
});
