import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type Position = { x: number; y: number };
type Draft = {
  nodes: { id: string; type: string; name: string; position: Position }[];
  edges: { id: string; source: string; target: string; branch?: string }[];
};

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
async function record(page: Page, workflowId: string): Promise<{ revision: number; draft: Draft }> {
  return (await page.request.get(`/api/workflows/${workflowId}`)).json();
}
const positions = (draft: Draft) => Object.fromEntries(draft.nodes.map((n) => [n.id, n.position]));
const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="${id}"]`);
/** Clique real no meio da ligação (uma ligação reta tem caixa de altura zero para o Playwright). */
async function clickEdge(page: Page, id: string) {
  const box = await edge(page, id)
    .locator('.react-flow__edge-interaction')
    .evaluate((path) => {
      const rect = path.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
  await page.mouse.click(box.x, box.y);
}
const label = (page: Page, nodeId: string) =>
  page.getByTestId(`block-${nodeId}`).locator('.vx-node-label strong');
async function expectTouchTarget(target: Locator) {
  const box = (await target.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);
}

test('canvas da esquerda para a direita: organizar, ações do bloco, simulação, inserir e excluir ligação', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const mobile = info.project.name === 'mobile';
  if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workflowId = await createFromTemplate(page, `Canvas ${info.project.name}`);
  await closeInspector(page);

  // Entrada à esquerda, saídas à direita; a condição tem Sim e Não.
  const qualify = page.locator('.react-flow__node[data-id="qualify"]');
  await expect(qualify.locator('.react-flow__handle-left')).toHaveCount(1);
  await expect(qualify.locator('.react-flow__handle-right')).toHaveCount(2);
  await expect(qualify.locator('.vx-out-label')).toHaveText(['Sim', 'Não']);

  // Rascunho antigo, salvo na vertical: abre sem ter as posições reescritas.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const original = await record(page, workflowId);
  const vertical: Draft = {
    ...original.draft,
    nodes: original.draft.nodes.map((n, i) => ({ ...n, position: { x: 0, y: i * 220 } })),
  };
  const saved = await page.request.patch(`/api/workflows/${workflowId}`, {
    headers: { 'x-eimax-client': 'workspace' },
    data: { revision: original.revision, draft: vertical },
  });
  expect(saved.ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await closeInspector(page);
  const before = positions(vertical);
  expect(positions((await record(page, workflowId)).draft)).toEqual(before);

  // Organizar só a seleção (dois blocos com Shift): os demais não se movem.
  await label(page, 'trigger').click();
  await closeInspector(page);
  await label(page, 'qualify').click({ modifiers: ['Shift'] });
  await closeInspector(page);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Organizar blocos', exact: true }).click();
  await expect(page.getByText('Seleção organizada', { exact: false })).toBeVisible();
  await expect
    .poll(async () => {
      const at = positions((await record(page, workflowId)).draft);
      const others = ['assign', 'nurture', 'tag', 'notify'].every(
        (nodeId) => JSON.stringify(at[nodeId]) === JSON.stringify(before[nodeId]),
      );
      return others && at.qualify.x > at.trigger.x && at.qualify.y === at.trigger.y;
    })
    .toBe(true);

  // Organizar o fluxo inteiro: todas as ligações passam a avançar para a direita.
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  await page.getByRole('button', { name: 'Organizar blocos', exact: true }).click();
  await expect
    .poll(async () => {
      const draft = (await record(page, workflowId)).draft;
      const at = positions(draft);
      return (
        draft.edges.every((e) => at[e.target].x > at[e.source].x) &&
        ['assign', 'nurture', 'tag', 'notify'].every(
          (nodeId) => JSON.stringify(at[nodeId]) !== JSON.stringify(before[nodeId]),
        )
      );
    })
    .toBe(true);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

  // Barra do bloco (tamanho fixo na tela): duplicar, excluir e abrir detalhes.
  await label(page, 'qualify').click();
  await closeInspector(page);
  const toolbar = page.getByRole('toolbar', { name: 'Ações de Qualificar oportunidade' });
  await expect(toolbar).toBeVisible();
  if (mobile) for (const button of await toolbar.getByRole('button').all()) await expectTouchTarget(button);
  await toolbar.getByRole('button', { name: 'Duplicar Qualificar oportunidade' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await closeInspector(page);
  const draftWithCopy = (await record(page, workflowId)).draft;
  const copyNode = draftWithCopy.nodes.find((n) => n.name.endsWith('(cópia)'));
  // A cópia não cobre o original: fica à direita.
  if (copyNode) expect(copyNode.position.x).toBeGreaterThan(positions(draftWithCopy).qualify.x);
  const copyToolbar = page.getByRole('toolbar', { name: /\(cópia\)$/ });
  if (mobile) {
    // A cópia pode ficar fora do enquadramento do celular; exclui pelo teclado com ela selecionada.
    await page.keyboard.press('Delete');
  } else {
    await copyToolbar.getByRole('button', { name: /^Excluir .*\(cópia\)$/ }).click();
  }
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await label(page, 'qualify').click();
  await closeInspector(page);
  await toolbar.getByRole('button', { name: 'Detalhes de Qualificar oportunidade' }).click();
  await expect(page.getByRole('dialog', { name: /Detalhes do bloco/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Detalhes do bloco/ })).toBeHidden();
  await closeInspector(page);

  // Simular pinta os estados e conta itens só nas ligações percorridas (ramo Não).
  await page.getByRole('button', { name: 'Testar', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Orçamento (R$)' }).fill('100');
  await page.getByRole('button', { name: 'Simular processo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultado da simulação' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('block-trigger')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-qualify')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-nurture')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-assign')).toHaveAttribute('data-state', 'skipped');
  await expect(
    page.getByTestId('block-qualify').getByRole('img', { name: 'Estado: Concluído' }),
  ).toBeVisible();
  await expect(page.getByTestId('edge-count-e1')).toHaveText('1 item');
  await expect(page.getByTestId('edge-count-e3')).toHaveText('1 item');
  await expect(page.getByTestId('edge-count-e2')).toHaveCount(0);
  await expect(page.getByTestId('edge-count-e4')).toHaveCount(0);
  await expect(edge(page, 'e3').locator('.vx-edge-path')).toHaveClass(/is-live/);
  await expect(edge(page, 'e2').locator('.vx-edge-path')).not.toHaveClass(/is-live/);
  await expect(page.getByTestId('canvas-run')).toContainText('simulação desta sessão');
  await page.getByRole('button', { name: 'Fechar resultado' }).click();
  await closeInspector(page);
  await page.getByRole('button', { name: 'Enquadrar processo' }).click();
  await page.waitForTimeout(400);
  if (mobile) {
    // Zoom legível no celular: o enquadramento não desce abaixo de 60%.
    const zoom = Number((await page.locator('.zoom-value').textContent())!.replace('%', ''));
    expect(zoom).toBeGreaterThanOrEqual(60);
  }
  mkdirSync('docs/validation', { recursive: true });
  await page.screenshot({ path: `docs/validation/editor-canvas-${info.project.name}.png` });

  // Voltar ao estado sem execução.
  await page.getByRole('button', { name: 'Limpar execução do canvas' }).click();
  await expect(page.getByTestId('block-trigger')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('edge-count-e1')).toHaveCount(0);

  // Inserir um bloco no meio da ligação gatilho → condição (clique real na ligação).
  await clickEdge(page, 'e1');
  if (mobile) {
    const panelInsert = page.getByRole('button', { name: 'Inserir bloco', exact: true });
    await expectTouchTarget(panelInsert);
    await expectTouchTarget(page.getByRole('button', { name: /^Inserir bloco na ligação de / }));
    await panelInsert.click();
  } else {
    await page.getByRole('button', { name: /^Inserir bloco na ligação de / }).click();
  }
  const picker = page.getByRole('dialog', { name: 'Inserir bloco na ligação' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Inserir Esperar', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await expect
    .poll(async () => {
      const draft = (await record(page, workflowId)).draft;
      const inserted = draft.nodes.find((n) => n.type === 'wait');
      if (!inserted) return 'sem bloco';
      const at = positions(draft);
      const ok =
        !draft.edges.some((e) => e.id === 'e1') &&
        draft.edges.some((e) => e.source === 'trigger' && e.target === inserted.id) &&
        draft.edges.some((e) => e.source === inserted.id && e.target === 'qualify') &&
        at.trigger.x < inserted.position.x &&
        inserted.position.x < at.qualify.x;
      return ok ? 'ok' : JSON.stringify(draft.edges);
    })
    .toBe('ok');
  // O foco vai para o bloco novo.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('.react-flow__node')?.textContent ?? ''))
    .toContain('Esperar');
  await closeInspector(page);

  // Excluir a ligação Atribuir → Etiqueta.
  const edgesBefore = await page.locator('.react-flow__edge').count();
  if (mobile) {
    // Fora do enquadramento do celular: seleciona pela ligação e exclui pelo painel fixo.
    await edge(page, 'e4').locator('.react-flow__edge-interaction').dispatchEvent('click');
    const panelDelete = page.getByRole('button', { name: 'Excluir conexão', exact: true });
    await expectTouchTarget(panelDelete);
    await panelDelete.click();
  } else {
    await clickEdge(page, 'e4');
    await page.getByRole('button', { name: /^Excluir ligação de / }).click();
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgesBefore - 1);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  expect((await record(page, workflowId)).draft.edges.some((e) => e.id === 'e4')).toBe(false);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('execução real escolhida pinta o canvas; desmarcar e limpar voltam ao estado sem execução', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const step = (nodeId: string, status: string, output: Record<string, unknown> = {}) => ({
    id: `step-${nodeId}`,
    nodeId,
    nodeType: 'x',
    name: nodeId,
    status,
    input: {},
    output,
    durationMs: 3,
    message: '',
    createdAt: '2026-10-29T12:00:00.000Z',
  });
  await page.route('**/api/workflows/*/executions', (route) =>
    route.fulfill({
      json: [
        {
          id: 'run-canvas',
          workflowId: 'fixture',
          eventKey: 'fixture',
          status: 'FAILED',
          attempt: 1,
          createdAt: '2026-10-29T12:00:00.000Z',
          stepsCount: 4,
          leadSummary: { name: 'Contato do canvas' },
          steps: [
            step('trigger', 'success'),
            step('qualify', 'success', { branch: 'true' }),
            step('assign', 'success'),
            step('tag', 'failed'),
          ],
        },
      ],
    }),
  );
  await createFromTemplate(page, `Execução real ${info.project.name}`);
  await closeInspector(page);
  await expect(page.getByTestId('block-trigger')).toHaveAttribute('data-state', 'idle');

  // Uma simulação pinta o canvas antes de escolher a execução real.
  await page.getByRole('button', { name: 'Testar', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Orçamento (R$)' }).fill('100');
  await page.getByRole('button', { name: 'Simular processo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultado da simulação' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('block-nurture')).toHaveAttribute('data-state', 'success');
  await page.getByRole('button', { name: 'Fechar resultado' }).click();

  const runButton = page.locator('.durable-editor-status').getByRole('button', { name: /Contato do canvas/ });
  await runButton.click();
  await expect(runButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('canvas-run')).toContainText('execução real de Contato do canvas');
  await expect(page.getByTestId('block-qualify')).toHaveAttribute('data-state', 'success');
  await expect(page.getByTestId('block-tag')).toHaveAttribute('data-state', 'failed');
  await expect(page.getByTestId('block-tag').getByRole('img', { name: 'Estado: Falhou' })).toBeVisible();
  await expect(page.getByTestId('block-nurture')).toHaveAttribute('data-state', 'skipped');
  await expect(page.getByTestId('block-notify')).toHaveAttribute('data-state', 'skipped');
  await expect(page.getByTestId('edge-count-e2')).toHaveText('1 item');
  await expect(page.getByTestId('edge-count-e4')).toHaveText('1 item');
  await expect(page.getByTestId('edge-count-e3')).toHaveCount(0);
  await expect(page.getByTestId('edge-count-e5')).toHaveCount(0);

  // Desmarcar a execução real não traz a simulação de volta: o canvas fica sem execução.
  await runButton.click();
  await expect(runButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('canvas-run')).toHaveCount(0);
  for (const nodeId of ['trigger', 'qualify', 'nurture', 'tag'])
    await expect(page.getByTestId(`block-${nodeId}`)).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('edge-count-e1')).toHaveCount(0);

  // Escolher de novo e limpar pelo aviso do canto.
  await runButton.click();
  await expect(page.getByTestId('block-tag')).toHaveAttribute('data-state', 'failed');
  await page.getByRole('button', { name: 'Limpar execução do canvas' }).click();
  await expect(runButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('block-tag')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('block-nurture')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('edge-count-e2')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
