import { test, expect } from '@playwright/test';
import { waitForExecution } from '../integration/helpers';

test('integrações: cadastro persistente e prévia de mapeamento sem serviços externos', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/integracoes');
  await expect(page.getByRole('heading', { name: 'Integrações', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar contas' })).toBeVisible();
  const card = page
    .locator('.integration-card')
    .filter({ has: page.getByRole('heading', { name: 'Google Sheets', exact: true }) });
  await card.getByRole('button', { name: 'Adicionar conta' }).click();
  const name = `Planilha local ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Nome da conta', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  const connection = page
    .locator('.integration-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(connection).toContainText('Configuração necessária');
  await expect(connection.getByRole('button', { name: 'Verificar conexão' })).toBeDisabled();
  await connection.getByRole('button', { name: 'Conferir mapeamento' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Identificador da planilha' }).fill('local-fixture');
  await dialog.getByRole('textbox', { name: 'Valor de exemplo' }).fill('<script>fixture</script> & Empresa');
  await dialog.getByRole('button', { name: 'Ver prévia' }).click();
  await expect(dialog).toContainText('Linha 2: <script>fixture</script> & Empresa');
  await expect(dialog).toContainText('Prévia local');
  await page.screenshot({ path: `docs/validation/integrations-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('WhatsApp mantém configuração necessária e não oferece conexão fictícia', async ({ page }) => {
  const name = `Conta sem provedor ${Date.now()}`;
  await page.goto('/integracoes/whatsapp');
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome da conta', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Provedor', exact: true }).selectOption('META');
  await page.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const account = page.locator('.run-card').filter({ hasText: name });
  await expect(account).toContainText('Configuração necessária');
  await expect(account.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await expect(account.getByRole('button', { name: 'Desconectar', exact: true })).toHaveCount(0);
  await expect(page.locator('.whatsapp-qr')).toHaveCount(0);
  await account.getByRole('button', { name: 'Remover da lista', exact: true }).click();
  await expect(account).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.run-card').filter({ hasText: name })).toHaveCount(0);
});

test('lead real: fila, histórico, atribuição explícita e filtros comerciais', async ({ page }) => {
  await page.goto('/leads');
  await page.request.post('/api/development/session', { headers: { 'x-eimax-client': 'workspace' } });
  const headers = { 'x-eimax-client': 'workspace' };
  const created = await page.request.post('/api/workflows', {
    headers,
    data: { template: 'sdr', name: `Operação local ${Date.now()}` },
  });
  expect(created.ok()).toBe(true);
  const workflow = await created.json();
  const flow = workflow.draft;
  flow.nodes = flow.nodes.filter((n: { id: string }) => ['trigger', 'tag', 'notify'].includes(n.id));
  flow.edges = [
    { id: 'tag', source: 'trigger', target: 'tag' },
    { id: 'notify', source: 'tag', target: 'notify' },
  ];
  const saved = await page.request.patch(`/api/workflows/${workflow.id}`, {
    headers,
    data: { revision: workflow.revision, draft: flow },
  });
  const revision = (await saved.json()).revision;
  expect(
    (await page.request.post(`/api/workflows/${workflow.id}/publish`, { headers, data: { revision } })).ok(),
  ).toBe(true);
  const name = `Lead de navegador ${Date.now()}`;
  const execution = await page.request.post(`/api/workflows/${workflow.id}/execute`, {
    headers,
    data: {
      eventKey: name,
      lead: {
        name,
        email: 'fixture@example.com',
        company: 'Verificação local',
        budget: 2500,
        score: 0,
        source: 'teste_navegador',
      },
    },
  });
  const queued = await execution.json();
  expect(queued.status).toBe('QUEUED');
  expect((await waitForExecution(queued.id)).status).toBe('COMPLETED');
  await page.reload();
  await page.getByRole('textbox', { name: 'Buscar leads' }).fill(name);
  await page.getByRole('combobox', { name: 'Filtrar por responsável' }).selectOption('NONE');
  await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('COMPLETED');
  await expect(dialog).toContainText('Lead qualificado');
  await dialog.getByRole('combobox', { name: 'Responsável', exact: true }).selectOption('dev-owner');
  await dialog.getByRole('button', { name: 'Salvar alterações do lead', exact: true }).click();
  await expect(dialog).toContainText('Pessoa owner de desenvolvimento');
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('combobox', { name: 'Filtrar por responsável' }).selectOption('dev-owner');
  await page.getByRole('combobox', { name: 'Filtrar por origem' }).selectOption('teste_navegador');
  await expect(page.locator('tbody')).toContainText(name);
  await expect(page.locator('tbody')).toContainText('Pessoa owner de desenvolvimento');
});
