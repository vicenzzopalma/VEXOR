import { test, expect } from '@playwright/test';

test('projetos: criar, abrir editor, voltar, mover e arquivar sem perder o fluxo', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const name = `Atendimento ${info.project.name} ${Date.now()}`;
  const targetName = `Operações ${info.project.name} ${Date.now()}`;
  const flowName = `Triagem ${info.project.name}`;
  const headers = { 'x-eimax-client': 'workspace' };
  const projects: string[] = [];
  const createProject = async (title: string) => {
    await page.getByRole('button', { name: 'Novo projeto', exact: false }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill(title);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click();
    const r = await response;
    expect(r.ok()).toBe(true);
    const project = await r.json();
    projects.push(project.id);
    await expect(dialog).toBeHidden();
    return project;
  };
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo projeto', exact: false })).toBeVisible();
    const source = await createProject(name);
    const destination = await createProject(targetName);
    await page.getByRole('heading', { name: 'Projetos', exact: true }).click();
    await page.keyboard.press('/');
    await expect(page.getByRole('textbox', { name: 'Buscar projetos' })).toBeFocused();
    await page.getByRole('textbox', { name: 'Buscar projetos' }).fill(name);
    await page.screenshot({ path: `docs/validation/projects-home-${info.project.name}.png`, fullPage: true });
    await page
      .locator('.project-card')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(new RegExp(`/projetos/${source.id}$`), { timeout: 30000 });
    await page.getByRole('button', { name: 'Novo fluxo', exact: false }).click();
    await page.getByRole('textbox', { name: 'Nome do fluxo' }).fill(flowName);
    await page.getByRole('dialog').getByRole('button', { name: 'Criar fluxo', exact: true }).click();
    await expect(page).toHaveURL(/\/editor\//, { timeout: 30000 });
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const flowId = new URL(page.url()).pathname.split('/').pop()!;
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(breadcrumb).toContainText(flowName);
    await page.screenshot({
      path: `docs/validation/projects-editor-${info.project.name}.png`,
      fullPage: true,
    });
    await breadcrumb.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projetos/${source.id}$`), { timeout: 30000 });
    const row = page.locator('.project-flow').filter({ hasText: flowName });
    await expect(row).toContainText('Rascunho');
    await row.getByLabel(`Ações do fluxo ${flowName}`).click();
    await row.getByRole('button', { name: 'Mover para outro projeto' }).click();
    const move = page.getByRole('dialog');
    await move.getByRole('combobox', { name: 'Projeto de destino' }).selectOption(destination.id);
    await move.getByRole('button', { name: 'Mover fluxo', exact: true }).click();
    await expect(move).toBeHidden();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Trocar projeto' }).click();
    await page.getByRole('dialog').getByRole('link', { name: targetName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projetos/${destination.id}$`));
    const moved = page.locator('.project-flow').filter({ hasText: flowName });
    await expect(moved).toBeVisible();
    await page.screenshot({
      path: `docs/validation/projects-flows-${info.project.name}.png`,
      fullPage: true,
    });
    await moved.getByLabel(`Ações do fluxo ${flowName}`).click();
    await moved.getByRole('button', { name: 'Arquivar fluxo', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Arquivar fluxo', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(moved).toHaveCount(0);
    await page.getByRole('button', { name: 'Arquivados', exact: true }).click();
    await expect(moved).toContainText('Arquivado');
    const record = await (await page.request.get(`/api/workflows/${flowId}`)).json();
    expect(record.projectId).toBe(destination.id);
    expect(record.archivedAt).toBeTruthy();
    await page.getByRole('link', { name: 'Execuções', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Histórico de execuções reais' })).toBeVisible();
    await page.getByRole('link', { name: 'Credenciais', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Credenciais da organização' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    for (const id of projects) {
      const r = await page.request.get(`/api/projects/${id}`);
      if (r.ok()) {
        const p = await r.json();
        await page.request.post(`/api/projects/${id}/archive`, { headers, data: { revision: p.revision } });
      }
    }
  }
});
