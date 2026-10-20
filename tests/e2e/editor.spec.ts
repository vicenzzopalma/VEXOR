
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test('criar, personalizar, persistir, publicar, consultar versões e simular', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  const name = `Processo validado ${testInfo.project.name} ${Date.now()}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do processo', exact: true })).toHaveValue(name);
  await expect(page.getByRole('textbox', { name: 'Nome do bloco', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nome do bloco', exact: true }).fill('Avaliar orçamento do lead');
  await page.getByRole('spinbutton', { name: 'Valor da condição' }).fill('2500');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  mkdirSync('docs/validation', { recursive: true });
  await page.screenshot({ path: `docs/validation/editor-${testInfo.project.name}-properties.png` });
  if (mobile) await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nome do processo', exact: true })).toHaveValue(name);
  await expect(page.getByRole('textbox', { name: 'Nome do bloco', exact: true })).toHaveValue(
    'Avaliar orçamento do lead',
  );
  await expect(page.getByRole('spinbutton', { name: 'Valor da condição' })).toHaveValue('2500');
  if (mobile) {
    await page.getByRole('button', { name: 'Fechar propriedades' }).click();
    await page.getByRole('button', { name: 'Abrir biblioteca', exact: true }).click();
  }
  const nodeCount = await page.locator('.react-flow__node').count();
  await page.getByRole('button', { name: 'Adicionar Esperar', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount + 1);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount);
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount + 1);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  if (mobile && (await page.getByRole('button', { name: 'Fechar propriedades' }).isVisible()))
    await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await page.getByRole('button', { name: 'Enquadrar processo' }).click();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByText('Publicar e executar são etapas diferentes.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar versão', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Histórico de versões', exact: true }).click();
  await page.getByRole('button', { name: /Versão 1/ }).click();
  await expect(page.getByRole('heading', { name: `Versão 1 · ${name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: 'Testar', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Orçamento (R$)' }).fill('100');
  await page.getByRole('button', { name: 'Simular processo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultado da simulação' })).toBeVisible();
  await expect(page.locator('.log-skipped').filter({ hasText: 'Atribuir SDR' })).toBeVisible();
  await page
    .locator('.log-step')
    .filter({ hasText: 'Avaliar orçamento do lead' })
    .getByRole('button')
    .click();
  await expect(page.locator('.log-details')).toContainText('"branch": "false"');
  await expect(page.locator('.log-details')).not.toContainText('marina@example.com');
  await page.screenshot({ path: `docs/validation/editor-${testInfo.project.name}-simulation.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('arrastar, mover, desconectar e reconectar blocos no desktop', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Drag nativo de desktop; toque é validado por adição por clique na jornada mobile.',
  );
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page.getByRole('textbox', { name: 'Nome do processo', exact: true }).fill(`Conexões ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  const canvas = page.locator('.canvas-area');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const block = page.getByRole('button', { name: 'Adicionar Esperar', exact: true });
  await block.dispatchEvent('dragstart', { dataTransfer });
  await canvas.dispatchEvent('drop', {
    dataTransfer,
    clientX: box!.x + box!.width * 0.7,
    clientY: box!.y + 140,
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  const waitNode = page.locator('.react-flow__node').filter({ hasText: 'Esperar' });
  const nodeBox = (await waitNode.boundingBox())!;
  await page.mouse.move(nodeBox.x + 80, nodeBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + 110, nodeBox.y + 80, { steps: 8 });
  await page.mouse.up();
  const moved = (await waitNode.boundingBox())!;
  expect(moved.y).toBeGreaterThan(nodeBox.y + 20);
  const nurture = page.locator('.react-flow__node[data-id="nurture"]');
  await nurture.locator('.react-flow__handle-bottom').dragTo(waitNode.locator('.react-flow__handle-top'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByText('Tudo salvo', { exact: true })).toBeVisible();
  const reconnectSource = page.locator('.react-flow__edge').last().locator('.react-flow__edgeupdater-source');
  const notifySource = page.locator('.react-flow__node[data-id="notify"] .react-flow__handle-bottom');
  await reconnectSource.dragTo(notifySource);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByText('Tudo salvo', { exact: true })).toBeVisible();
  const workflowId = new URL(page.url()).pathname.split('/').pop();
  await expect
    .poll(async () => {
      const record = await (await page.request.get(`/api/workflows/${workflowId}`)).json();
      return record.draft.edges.some(
        (e: { source: string; target: string }) =>
          e.source === 'notify' &&
          !['trigger', 'qualify', 'assign', 'tag', 'nurture', 'notify'].includes(e.target),
      );
    })
    .toBe(true);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await page.getByRole('button', { name: 'Fechar propriedades' }).click();
  await page
    .locator('.react-flow__edge')
    .last()
    .locator('.react-flow__edge-interaction')
    .click({ force: true });
  await page.getByRole('button', { name: 'Excluir conexão', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await waitNode.getByText('Esperar', { exact: true }).click();
  await page
    .locator('.react-flow__node[data-id="assign"]')
    .getByText('Atribuir SDR')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await page.keyboard.press('Control+d');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  const beforeLayout = await (await page.request.get(`/api/workflows/${workflowId}`)).json();
  await page.getByRole('button', { name: 'Organizar blocos', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const afterLayout = await (await page.request.get(`/api/workflows/${workflowId}`)).json();
  expect(JSON.stringify(afterLayout.draft.nodes.map((n: { position: object }) => n.position))).not.toBe(
    JSON.stringify(beforeLayout.draft.nodes.map((n: { position: object }) => n.position)),
  );
});
