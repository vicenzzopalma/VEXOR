import { test, expect, type Page } from '@playwright/test';

const lead = {
  name: 'Marina Costa',
  email: 'marina@example.com',
  company: 'Acme Studio',
  budget: 5000,
  score: 85,
  source: 'formulario',
};
const headers = { 'x-eimax-client': 'workspace' };

async function createFromTemplate(page: Page, label: string) {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`${label} ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30000 });
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  return new URL(page.url()).pathname.split('/').pop()!;
}
async function closeInspector(page: Page) {
  const close = page.getByRole('button', { name: 'Fechar propriedades' });
  if (await close.isVisible()) await close.click();
}
const record = async (page: Page, id: string) => (await page.request.get(`/api/workflows/${id}`)).json();
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('interruptor Ativo, erro de ativação e aba Execuções do fluxo', async ({ page }, info) => {
  test.setTimeout(150000);
  const mobile = info.project.name === 'mobile';
  if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = await createFromTemplate(page, `Ativo ${info.project.name}`);
  await closeInspector(page);

  // Sem versão publicada o interruptor fica desligado e explica o motivo.
  const toggle = page.getByRole('switch', { name: 'Ativo', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Continua no Tab (aria-disabled) e o motivo é lido pelo leitor de tela, não só pela dica.
  await expect(toggle).toHaveAttribute('aria-disabled', 'true');
  await expect(toggle).toHaveAccessibleDescription(/Publique uma versão/);

  // Publicar com o fluxo ativo (padrão): passa a receber eventos.
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('O fluxo está ativo.');
  await page.getByRole('button', { name: 'Publicar versão' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Versão 1 publicada' })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');

  // Desligar: nenhum gatilho cria execução; a API responde 409.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('status').filter({ hasText: 'Fluxo inativo' })).toBeVisible();
  expect((await record(page, id)).active).toBe(false);
  const refused = await page.request.post(`/api/workflows/${id}/execute`, { headers, data: { lead } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).code).toBe('WORKFLOW_INACTIVE');

  // Religar pelo teclado e criar duas execuções reais (ficam na fila, sem worker no teste).
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  for (const name of ['Marina Costa', 'Bruno Lima']) {
    const accepted = await page.request.post(`/api/workflows/${id}/execute`, {
      headers,
      data: { lead: { ...lead, name } },
    });
    expect(accepted.status()).toBe(201);
  }
  // O salvamento automático segue funcionando com a revisão nova (sem conflito).
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

  // Aba Execuções: URL reflete a aba, lista paginada do servidor, filtros e estado vazio.
  // Teclado: End vai para Execuções, Home volta ao Editor.
  await page.getByRole('tab', { name: 'Editor' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Execuções' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Execuções' }).click();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page.getByRole('tab', { name: 'Execuções' })).toHaveAttribute('aria-selected', 'true');
  const runs = page.locator('.vx-flow-runs-list > li');
  await expect(runs).toHaveCount(2);
  await expect(page.getByText('2 execuções · Página 1 de 1')).toBeVisible();
  await expect(runs.first()).toContainText('Na fila');
  await page.getByLabel('Estado').selectOption('FAILED');
  await expect(page.getByRole('heading', { name: 'Nenhuma execução encontrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(runs).toHaveCount(2);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `docs/validation/editor-active-runs-${info.project.name}.png` });

  // A aba volta pela URL depois de recarregar.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Execuções' })).toHaveAttribute('aria-selected', 'true');
  await expect(runs).toHaveCount(2);

  // Escolher uma execução volta ao Editor com ela pintada no canvas.
  await runs.filter({ hasText: 'Bruno Lima' }).getByRole('button').click();
  await expect(page).not.toHaveURL(/view=runs/);
  await expect(page.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('canvas-run')).toContainText(/Execução real/);
  if (!mobile) await expect(page.getByTestId('canvas-run')).toContainText('Bruno Lima');
  await noHorizontalScroll(page);

  // Erro de ativação: nova versão com credencial de webhook inexistente; o erro fica salvo no fluxo.
  const current = await record(page, id);
  const draft = {
    ...current.draft,
    nodes: current.draft.nodes.map((n: { id: string }) =>
      n.id === 'trigger' ? { ...n, type: 'webhook.received', config: { credentialRef: 'nao-configurada' } } : n,
    ),
  };
  const saved = await page.request.patch(`/api/workflows/${id}`, {
    headers,
    data: { revision: current.revision, draft },
  });
  expect(saved.ok()).toBe(true);
  const savedRow = await saved.json();
  expect(
    (await page.request.post(`/api/workflows/${id}/publish`, { headers, data: { revision: savedRow.revision } }))
      .ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/workflows/${id}/deactivate`, {
        headers,
        data: { activationRevision: savedRow.activationRevision },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await closeInspector(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  const banner = page.getByTestId('activation-error');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-code', 'WEBHOOK_CREDENTIAL_MISSING');
  await expect(banner).toContainText('O que fazer:');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Persistido: continua depois de recarregar, com atalho para o bloco.
  await page.reload();
  await expect(banner).toContainText('nao-configurada');
  await banner.getByRole('button', { name: /Ver “/ }).click();
  await expect(page.getByTestId('block-trigger')).toHaveClass(/is-selected/);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('testar até este bloco pela barra do bloco e pelo detalhe', async ({ page }, info) => {
  test.setTimeout(120000);
  const mobile = info.project.name === 'mobile';
  if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = await createFromTemplate(page, `Até o bloco ${info.project.name}`);
  await closeInspector(page);
  const before = (await page.request.get(`/api/workflows/${id}/executions`).then((r) => r.json())).length;

  // Pela barra do bloco: só o trecho até "Adicionar etiqueta" é percorrido.
  // Seleciona pelo canto do bloco (o centro abre o detalhe).
  await page.getByTestId('block-tag').click({ position: { x: 6, y: 6 } });
  await closeInspector(page);
  await page.getByRole('toolbar', { name: 'Ações de Adicionar etiqueta' }).getByRole('button', {
    name: 'Testar até Adicionar etiqueta',
  }).click();
  await expect(page.getByTestId('block-tag')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-assign')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-notify')).toHaveAttribute('data-state', 'skipped');
  await expect(page.getByTestId('block-nurture')).toHaveAttribute('data-state', 'skipped');
  await expect(page.getByTestId('canvas-run')).toContainText(mobile ? 'Simulação' : 'Exibindo o teste até');
  await expect(page.getByRole('status').filter({ hasText: 'Teste até “Adicionar etiqueta” concluído' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `docs/validation/editor-test-until-${info.project.name}.png` });

  // Pelo detalhe: o resultado aparece na Saída do bloco escolhido.
  await page.getByRole('button', { name: 'Abrir detalhes de Atribuir SDR' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Testar até este bloco' }).click();
  await expect(dialog.locator('.flow-test-note')).toContainText('Teste até “Atribuir SDR” concluído');
  await expect(dialog.getByLabel('Dados da etapa')).toHaveValue('simulation');
  await expect(page.getByTestId('block-tag')).toHaveAttribute('data-state', 'skipped');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Simulação não cria execução real.
  const after = (await page.request.get(`/api/workflows/${id}/executions`).then((r) => r.json())).length;
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});
