import { test, expect, type Page } from '@playwright/test';

async function createProcess(page: Page, project: string) {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page
    .getByRole('textbox', { name: 'Nome do processo', exact: true })
    .fill(`Isolamento de janelas ${project} ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  if (project === 'mobile') await page.getByRole('button', { name: 'Fechar propriedades' }).click();
}

test('ajuda global isola atalhos e devolve foco e controle ao editor', async ({ page }, testInfo) => {
  await createProcess(page, testInfo.project.name);
  // Establish a selected node and a real undo entry before opening global help.
  await page.getByRole('button', { name: 'Enquadrar processo' }).click();
  await page.keyboard.press('Control+d');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  if (
    testInfo.project.name === 'mobile' &&
    (await page.getByRole('button', { name: 'Fechar propriedades' }).isVisible())
  )
    await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const workflowId = new URL(page.url()).pathname.split('/').pop();
  const before = await (await page.request.get(`/api/workflows/${workflowId}`)).json();
  const selectedIds = await page
    .locator('.react-flow__node.selected')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  expect(selectedIds.length).toBeGreaterThan(0);

  const helpTrigger =
    testInfo.project.name === 'mobile'
      ? page.getByRole('button', { name: 'Ajuda e atalhos', exact: true })
      : page.getByRole('button', { name: 'Central de ajuda', exact: true });
  await helpTrigger.click();
  const help = page.getByRole('dialog', { name: 'Um processo simples, do seu jeito' });
  const close = help.getByRole('button', { name: 'Fechar janela' });
  await expect(close).toBeFocused();
  for (const key of ['Delete', 'Control+d', 'Control+z', 'Control+Shift+z', 'Backspace']) {
    await page.keyboard.press(key);
    await expect(help).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(7);
    expect(
      await page
        .locator('.react-flow__node.selected')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id'))),
    ).toEqual(selectedIds);
  }
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await helpTrigger.evaluate((button: HTMLButtonElement) => button.focus());
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(helpTrigger).toBeFocused();
  const after = await (await page.request.get(`/api/workflows/${workflowId}`)).json();
  expect(after.draft).toEqual(before.draft);

  // Closing help must preserve selection and restore the real editor shortcuts.
  await page.keyboard.press('Control+d');
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
});

test('campos mantêm edição nativa e Escape fecha somente o topo da pilha', async ({ page }, testInfo) => {
  await createProcess(page, testInfo.project.name);
  const simulateTrigger = page.getByRole('button', { name: 'Testar', exact: true });
  await simulateTrigger.click();
  const simulate = page.getByRole('dialog', { name: 'Vamos testar seu processo?' });
  const name = simulate.getByRole('textbox', { name: 'Nome do lead', exact: true });
  await name.fill('Maria');
  await name.press('Home');
  await name.press('Delete');
  await expect(name).toHaveValue('aria');
  await name.press('Control+a');
  await page.keyboard.type('Joana');
  await name.press('Control+z');
  await expect(name).toHaveValue('aria');
  await expect(page.locator('.react-flow__node')).toHaveCount(6);

  // Exercise overlapping portals from Shell and Editor without bypassing the
  // pointer-blocking backdrop in product code (there is no public stacking UI).
  await page
    .getByRole('button', { name: 'Ajuda e atalhos', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const help = page.getByRole('dialog', { name: 'Um processo simples, do seu jeito' });
  await expect(help.getByRole('button', { name: 'Fechar janela' })).toBeFocused();
  const underlying = page.locator('[role="dialog"]').filter({ hasText: 'Vamos testar seu processo?' });
  await expect(underlying).toHaveAttribute('inert', '');
  await expect(underlying).toHaveAttribute('aria-modal', 'false');
  const stacking = await page.locator('[role="dialog"]').evaluateAll((dialogs) =>
    dialogs.map((dialog) => ({
      top: dialog.getAttribute('aria-modal') === 'true',
      zIndex: Number(getComputedStyle(dialog.parentElement!).zIndex),
    })),
  );
  expect(stacking.find((dialog) => dialog.top)!.zIndex).toBeGreaterThan(
    stacking.find((dialog) => !dialog.top)!.zIndex,
  );
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(simulate).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('aria');
  await expect(simulate).toHaveAttribute('aria-modal', 'true');
  // The top dialog traps both ends of keyboard navigation.
  await simulate.getByRole('button', { name: 'Fechar janela' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(simulate.getByRole('button', { name: 'Simular processo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(simulate.getByRole('button', { name: 'Fechar janela' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(simulate).toBeHidden();
  await expect(simulateTrigger).toBeFocused();
});
