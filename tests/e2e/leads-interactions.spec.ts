import { test, expect, type Page } from '@playwright/test';
import type { LeadRecord } from '../../apps/web/lib/api';

// Contrato de interface isolado: nenhuma criação de lead, execução ou envio externo.
function lead(id: string, name: string): LeadRecord {
  return {
    id,
    revision: 1,
    name,
    phone: '+5511999999999',
    whatsappConsent: false,
    workflowId: 'ux2-local',
    eventKey: id,
    email: `${id}@example.com`,
    company: 'Fixture UX2 sem envio',
    budget: 0,
    score: 0,
    source: 'teste_local',
    status: 'NEW',
    tags: ['local'],
    assignedMembership: null,
    executionsCount: 0,
    notificationsCount: 0,
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
    executions: [],
    notifications: [],
    conversation: [],
  };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixture(page: Page) {
  const leads = [lead('ux2-a', 'Lead UX2 A'), lead('ux2-b', 'Lead UX2 B')];
  await page.route('**/api/development/session', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/me', (route) => route.fulfill({ json: { role: 'owner' } }));
  await page.route('**/api/memberships', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/leads', (route) => route.fulfill({ json: leads }));
  await page.route('**/api/leads/*', (route) =>
    route.fulfill({
      json: leads.find((item) => route.request().url().endsWith(`/${item.id}`)),
    }),
  );
  return leads;
}

async function open(page: Page, name = 'Lead UX2 A') {
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(page.getByRole('dialog', { name: `Lead · ${name}`, exact: true })).toBeVisible();
}

async function settledResponse(page: Page, id: string, release: () => void) {
  const response = page.waitForResponse((item) => item.url().endsWith(`/api/leads/${id}`));
  release();
  await (await response).finished();
  // Permite que o fetch e os efeitos React consumam a resposta antes da asserção negativa.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

test('detalhe lento de A não substitui B e cancelar carregamento invalida a resposta', async ({ page }) => {
  const leads = await fixture(page);
  const delayed = gate();
  await page.route('**/api/leads/ux2-a', async (route) => {
    await delayed.promise;
    await route.fulfill({ json: leads[0] });
  });
  await page.goto('/leads');
  await page
    .getByRole('row')
    .filter({ hasText: 'Lead UX2 A' })
    .getByRole('button', { name: 'Ver detalhes' })
    .click();
  await expect(page.getByRole('status')).toContainText('Carregando detalhes de Lead UX2 A');
  await open(page, 'Lead UX2 B');
  await settledResponse(page, 'ux2-a', delayed.release);
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Lead · Lead UX2 B');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  const cancelled = gate();
  await page.route('**/api/leads/ux2-a', async (route) => {
    await cancelled.promise;
    await route.fulfill({ json: leads[0] });
  });
  await page
    .getByRole('row')
    .filter({ hasText: 'Lead UX2 A' })
    .getByRole('button', { name: 'Ver detalhes' })
    .click();
  await page.getByRole('button', { name: 'Cancelar carregamento' }).click();
  await settledResponse(page, 'ux2-a', cancelled.release);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Carregando detalhes de Lead UX2 A')).toHaveCount(0);
});

for (const exit of ['Escape', 'backdrop', 'Fechar', 'Fechar janela']) {
  test(`alterações pendentes exigem descarte ao sair por ${exit}`, async ({ page }) => {
    await fixture(page);
    await page.goto('/leads');
    let prompts = 0;
    let discard = false;
    page.on('dialog', async (dialog) => {
      prompts += 1;
      expect(dialog.message()).toContain('Descartar as alterações não salvas deste lead?');
      if (discard) await dialog.accept();
      else await dialog.dismiss();
    });
    const close = async () => {
      if (exit === 'Escape') await page.keyboard.press('Escape');
      else if (exit === 'backdrop')
        await page.locator('.dialog-backdrop').click({ position: { x: 2, y: 2 } });
      else await page.getByRole('button', { name: exit, exact: true }).click();
    };
    await open(page);
    await close();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(prompts).toBe(0);
    await open(page);
    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    await status.selectOption('QUALIFIED');
    await close();
    await expect(status).toHaveValue('QUALIFIED');
    expect(prompts).toBe(1);
    discard = true;
    await close();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(prompts).toBe(2);
    await open(page);
    await expect(status).toHaveValue('NEW');
    await status.selectOption('QUALIFIED');
    await status.selectOption('NEW');
    await close();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(prompts).toBe(2);
  });
}

test('salvamento bloqueia saídas, preserva o rascunho em erro e redefine alterações após sucesso', async ({
  page,
}) => {
  const leads = await fixture(page);
  const saving = gate();
  let fail = true;
  let patchCount = 0;
  await page.route('**/api/leads/ux2-a', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchCount += 1;
      await saving.promise;
      if (fail) {
        await route.fulfill({ status: 503, json: { message: 'Falha local de salvamento UX2' } });
        return;
      }
      const data = route.request().postDataJSON();
      expect(data.status).toBe('QUALIFIED');
      expect(data.expectedRevision).toBe(1);
      leads[0] = { ...leads[0], ...data, revision: 2, assignedMembership: null };
    }
    await route.fulfill({ json: leads[0] });
  });
  await page.goto('/leads');
  await open(page);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('QUALIFIED');
  await page.getByRole('button', { name: 'Salvar alterações do lead', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Aguarde para fechar');
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fechar janela', exact: true }).click();
  await page.locator('.dialog-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  saving.release();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Falha local de salvamento UX2');
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('QUALIFIED');
  fail = false;
  await page.getByRole('button', { name: 'Salvar alterações do lead', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações do lead', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(patchCount).toBe(2);
  let prompts = 0;
  page.on('dialog', async (dialog) => {
    prompts += 1;
    await dialog.dismiss();
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(prompts).toBe(0);
  await open(page);
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('QUALIFIED');
});

test('conflito mantém edições e exige recarregamento explícito antes de salvar a revisão atual', async ({
  page,
}) => {
  const leads = await fixture(page);
  let current = leads[0];
  const patches: Array<{ expectedRevision: number; status: string; tags: string[] }> = [];
  let gets = 0;
  let failReload = false;
  await page.route('**/api/leads/ux2-a', async (route) => {
    if (route.request().method() === 'PATCH') {
      const data = route.request().postDataJSON();
      patches.push(data);
      if (data.expectedRevision !== current.revision) {
        await route.fulfill({ status: 409, json: { message: 'Este lead foi alterado em outra sessão.' } });
        return;
      }
      current = { ...current, ...data, revision: current.revision + 1, assignedMembership: null };
      await route.fulfill({ json: current });
      return;
    }
    gets += 1;
    if (failReload) await route.fulfill({ status: 503, json: { message: 'Falha local ao recarregar' } });
    else await route.fulfill({ json: current });
  });
  await page.goto('/leads');
  await open(page);
  current = { ...current, status: 'IN_PROGRESS', tags: ['outra-sessao'], revision: 2 };
  const dialog = page.getByRole('dialog');
  const status = dialog.getByRole('combobox', { name: 'Status', exact: true });
  const tags = dialog.getByRole('textbox', { name: 'Etiquetas (separadas por vírgula)', exact: true });
  const save = dialog.getByRole('button', { name: 'Salvar alterações do lead', exact: true });
  const reload = dialog.getByRole('button', { name: 'Recarregar dados', exact: true });
  await status.selectOption('QUALIFIED');
  await tags.fill('rascunho-local');
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('outra sessão');
  await expect(status).toHaveValue('QUALIFIED');
  await expect(tags).toHaveValue('rascunho-local');
  await expect(save).toBeDisabled();
  expect(patches).toHaveLength(1);
  expect(patches[0].expectedRevision).toBe(1);
  expect(gets).toBe(1);
  let discard = false;
  let prompts = 0;
  page.on('dialog', async (confirmation) => {
    prompts += 1;
    expect(confirmation.message()).toContain('Descartar as alterações não salvas');
    if (discard) await confirmation.accept();
    else await confirmation.dismiss();
  });
  await reload.click();
  await expect(tags).toHaveValue('rascunho-local');
  expect(gets).toBe(1);
  discard = true;
  failReload = true;
  await reload.click();
  await expect(dialog.getByRole('alert')).toContainText('Falha local ao recarregar');
  await expect(tags).toHaveValue('rascunho-local');
  await expect(status).toHaveValue('QUALIFIED');
  expect(patches).toHaveLength(1);
  failReload = false;
  await reload.click();
  await expect(status).toHaveValue('IN_PROGRESS');
  await expect(tags).toHaveValue('outra-sessao');
  await expect(reload).toHaveCount(0);
  await expect(save).toBeDisabled();
  expect(prompts).toBe(3);
  expect(gets).toBe(3);
  await status.selectOption('CONVERTED');
  await save.click();
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(patches).toHaveLength(2);
  expect(patches[1].expectedRevision).toBe(2);
  expect(patches[1].tags).toEqual(['outra-sessao']);
  expect(gets).toBe(3); // PATCH é a fonte de sucesso; nenhum GET de confirmação.
  current = { ...current, status: 'IN_PROGRESS', revision: 4 };
  await status.selectOption('QUALIFIED');
  await save.click();
  await expect(reload).toBeVisible();
  await status.selectOption('CONVERTED'); // Desfaz a edição local: recarregar dispensa confirmação.
  await reload.click();
  await expect(status).toHaveValue('IN_PROGRESS');
  expect(prompts).toBe(3);
  expect(gets).toBe(4);
  expect(patches).toHaveLength(3);
  expect(patches[2].expectedRevision).toBe(3);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(prompts).toBe(3);
});

test('polling remove o erro após recuperação e não traz falha antiga para simulações', async ({ page }) => {
  await fixture(page);
  let unavailable = true;
  await page.route('**/api/executions/search?*', (route) => {
    return unavailable
      ? route.fulfill({ status: 503, json: { message: 'Falha transitória UX2' } })
      : route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  await page.route('**/api/simulations', (route) => route.fulfill({ json: [] }));
  await page.goto('/execucoes');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('Falha transitória UX2');
  unavailable = false;
  await expect(page.getByRole('heading', { name: 'Nenhuma execução real registrada' })).toBeVisible({
    timeout: 10000,
  });
  await expect(alert).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulações', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A história do seu processo começa com um teste' }),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
});
