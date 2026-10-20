import { test, expect } from '@playwright/test';
import { waitForExecution } from '../integration/helpers';

test('WhatsApp mantém configuração necessária e não oferece conexão fictícia', async ({ page }) => {
  const name = `Conta sem provedor ${Date.now()}`;
  await page.goto('/integracoes/whatsapp');
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome da conta', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const account = page.locator('.run-card').filter({ hasText: name });
  await expect(account).toContainText('Configuração necessária');
  await expect(account.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await expect(page.locator('.whatsapp-qr')).toHaveCount(0);
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
