import { test, expect } from '@playwright/test';

test('detalhe do bloco edita parâmetros e apresenta dados de uma execução selecionada', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/workflows/*/executions', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'run-fixture',
          workflowId: 'fixture',
          eventKey: 'fixture',
          status: 'COMPLETED',
          attempt: 1,
          createdAt: '2026-10-28T12:00:00.000Z',
          stepsCount: 1,
          leadSummary: { name: 'Contato de teste' },
          steps: [
            {
              id: 'step-fixture',
              nodeId: 'qualify',
              nodeType: 'condition',
              name: 'Condição',
              status: 'success',
              input: { score: 42 },
              output: { branch: 'true' },
              durationMs: 5,
              message: '',
              createdAt: '2026-10-28T12:00:00.000Z',
            },
          ],
        },
      ],
    });
  });
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page
    .getByRole('textbox', { name: 'Nome do processo', exact: true })
    .fill(`Detalhe ${info.project.name} ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30000 });
  await expect(page.getByText('Contato de teste')).toBeVisible();
  const closeInspector = page.getByRole('button', { name: 'Fechar propriedades' });
  if (await closeInspector.isVisible()) await closeInspector.click();
  const node = page.getByTestId('block-qualify');
  await expect(node).toHaveClass(/flow-node/);
  await node.getByRole('button', { name: /Abrir detalhes/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Detalhes do bloco/ });
  await expect(dialog.getByRole('region', { name: 'Entrada' })).toContainText('"score": 42');
  await expect(dialog.getByRole('region', { name: 'Saída' })).toContainText('"branch": "true"');
  await expect(dialog).toContainText('versão publicada');
  await dialog.getByLabel('Dados da etapa').selectOption('');
  await expect(dialog.getByRole('region', { name: 'Entrada' })).toContainText('Sem entrada registrada');
  await dialog.getByLabel('Dados da etapa').selectOption('run-fixture');
  await expect(dialog.getByRole('region', { name: 'Entrada' })).toContainText('"score": 42');
  await dialog.getByRole('textbox', { name: 'Nome do bloco' }).fill('Conferir dados');
  await page.screenshot({
    path: `docs/validation/editor-node-detail-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('block-qualify')).toContainText('Conferir dados');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('block-qualify')).toContainText('Conferir dados');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
