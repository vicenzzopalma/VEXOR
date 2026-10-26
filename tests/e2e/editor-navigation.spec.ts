import { test, expect } from '@playwright/test';

test('salva antes de navegar e preserva filtros e destino da página', async ({ page }) => {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`Navegação ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page).toHaveURL(/\/editor\//);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const workflowId = new URL(page.url()).pathname.split('/').pop();
  const name = `Rascunho antes de sair ${Date.now()}`;
  // Force a pending save through the existing navigation link, including query and fragment.
  await page
    .locator('a[href="/templates"]')
    .first()
    .evaluate((anchor: HTMLAnchorElement) => {
      anchor.href = '/templates?origem=editor#modelos';
    });
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(name);
  await page.locator('a[href="/templates?origem=editor#modelos"]').first().click();
  await expect(page).toHaveURL(/\/templates\?origem=editor#modelos$/);
  const response = await page.request.get(`/api/workflows/${workflowId}`);
  expect(response.ok()).toBe(true);
  expect((await response.json()).draft.name).toBe(name);
});

test('falha ao salvar não prende o usuário no editor: confirma e troca de aba', async ({ page }) => {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`Conflito ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page).toHaveURL(/\/editor\//);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  // Simulate another tab having saved first: every save now conflicts.
  await page.route('**/api/workflows/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, json: { message: 'Conflito de revisão.' } })
      : route.continue(),
  );
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`Alterado ${Date.now()}`);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'conflict');
  const confirmations: string[] = [];
  page.on('dialog', (dialog) => {
    confirmations.push(dialog.message());
    void dialog.accept();
  });
  await page.locator('aside a[href="/leads"]').first().click();
  await expect(page).toHaveURL(/\/leads$/);
  expect(confirmations[0]).toContain('Sair mesmo assim');
});
