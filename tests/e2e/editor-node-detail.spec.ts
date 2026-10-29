import { test, expect, type Page, type Locator } from '@playwright/test';

const step = (
  nodeId: string,
  nodeType: string,
  status: string,
  input: unknown,
  output: unknown,
  message = '',
) => ({
  id: `step-${nodeId}`,
  nodeId,
  nodeType,
  name: nodeId,
  status,
  input,
  output,
  durationMs: 5,
  message,
  createdAt: '2026-10-28T12:00:00.000Z',
});
const lead = { score: 42, company: 'ACME', source: 'site', budget: 5000 };
const executions = [
  {
    id: 'run-fixture',
    workflowId: 'fixture',
    eventKey: 'fixture',
    status: 'FAILED',
    attempt: 1,
    createdAt: '2026-10-28T12:00:00.000Z',
    stepsCount: 4,
    leadSummary: { name: 'Contato de teste' },
    steps: [
      step('trigger', 'lead.created', 'success', lead, { accepted: true, source: 'site' }),
      step('qualify', 'condition', 'success', lead, {
        matched: false,
        branch: 'false',
        field: 'score',
        value: 42,
        expected: 60,
        details: { rules: [{ op: 'gte', limit: 60 }] },
      }),
      step(
        'nurture',
        'email.send',
        'failed',
        lead,
        { errorCode: 'EMAIL_ACCOUNT_REQUIRED' },
        'Conta de e-mail não configurada.',
      ),
      step('assign', 'sdr.assign', 'skipped', {}, {}, 'Este bloco pertence a outro caminho.'),
    ],
  },
  {
    id: 'run-large',
    workflowId: 'fixture',
    eventKey: 'large',
    status: 'COMPLETED',
    attempt: 1,
    createdAt: '2026-10-28T11:00:00.000Z',
    stepsCount: 1,
    leadSummary: { name: 'Contato grande' },
    steps: [step('qualify', 'condition', 'success', lead, { branch: 'true', blob: 'x'.repeat(1_200_000) })],
  },
];

async function openDetail(page: Page, nodeId: string) {
  await page
    .getByTestId(`block-${nodeId}`)
    .getByRole('button', { name: /Abrir detalhes/ })
    .focus();
  await page.keyboard.press('Enter');
  return page.getByRole('dialog', { name: /Detalhes do bloco/ });
}

test('detalhe do bloco: vistas, busca, dados grandes, navegação, cópia e arraste', async ({
  page,
  context,
}, info) => {
  test.setTimeout(150000);
  const mobile = info.project.name === 'mobile';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/workflows/*/executions', (route) => route.fulfill({ json: executions }));
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Usar este modelo' }).click();
  await page
    .getByRole('textbox', { name: 'Nome do processo', exact: true })
    .fill(`Detalhe ${info.project.name} ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar e personalizar' }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 30000 });
  await expect(page.getByText('Contato de teste')).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem('eimax_detail_view_input');
    localStorage.removeItem('eimax_detail_view_output');
  });
  const closeInspector = page.getByRole('button', { name: 'Fechar propriedades' });
  if (await closeInspector.isVisible()) await closeInspector.click();
  await expect(page.getByTestId('block-qualify')).toHaveClass(/flow-node/);
  const dialog = await openDetail(page, 'qualify');
  // No celular as áreas são abas; no desktop as três ficam lado a lado.
  const area = async (name: 'Entrada' | 'Parâmetros' | 'Saída'): Promise<Locator> => {
    if (mobile) {
      const tab = dialog.getByRole('tablist', { name: 'Área exibida' }).getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
    return dialog.getByRole('region', { name });
  };
  // Sem rolagem horizontal na página nem dentro do diálogo.
  const noHorizontalScroll = async () => {
    expect(
      await page.evaluate(() => {
        const box = document.querySelector('[role="dialog"] .flow-detail') as HTMLElement | null;
        return (
          document.documentElement.scrollWidth <= innerWidth &&
          (!box || box.scrollWidth <= box.clientWidth + 1) &&
          [...document.querySelectorAll<HTMLElement>('[role="dialog"] .flow-detail-grid > section')].every(
            (section) => section.offsetParent === null || section.scrollWidth <= section.clientWidth + 1,
          )
        );
      }),
    ).toBe(true);
  };
  await expect(dialog.getByRole('button', { name: 'Fechar janela' })).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Fechar propriedades' })).toHaveCount(0);
  await expect(dialog).toContainText('versão publicada');

  // Entrada abre no esquema: campo, tipo e exemplo; Saída abre na tabela.
  let input = await area('Entrada');
  await expect(input.getByRole('button', { name: 'Esquema' })).toHaveAttribute('aria-pressed', 'true');
  await expect(input.locator('.ndv-schema-line', { hasText: 'score' })).toContainText('número');
  await expect(input.locator('.ndv-schema-line', { hasText: 'score' })).toContainText('42');
  await expect(input.getByTestId('count-input')).toHaveText('1 item');
  let output = await area('Saída');
  await expect(output.getByRole('button', { name: 'Tabela' })).toHaveAttribute('aria-pressed', 'true');
  await expect(output.getByRole('columnheader', { name: 'branch' })).toBeVisible();
  await expect(output.getByRole('cell', { name: 'false', exact: true }).first()).toBeVisible();
  await output.getByRole('button', { name: '{1 campo}' }).click();
  await expect(output.locator('.ndv-table pre')).toContainText('"limit": 60');

  // Busca: filtra linhas e mostra a contagem X de Y; sem resultado, oferece limpar.
  const outputSearch = output.getByRole('searchbox', { name: 'Buscar na Saída' });
  await outputSearch.fill('zzz-nada');
  await expect(output.getByTestId('count-output')).toHaveText('0 de 1 item');
  await expect(output).toContainText('Nada encontrado');
  await output.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await expect(output.getByTestId('count-output')).toHaveText('1 item');

  // JSON com destaque da busca; a vista escolhida é lembrada por lado.
  await output.getByRole('button', { name: 'JSON' }).click();
  await outputSearch.fill('gte');
  await expect(output.getByTestId('count-output')).toHaveText('1 de 1 item');
  await expect(output.locator('.ndv-json mark')).toHaveText('gte');
  await outputSearch.fill('');

  // Copiar valor e caminho (JSON da Saída e esquema da Entrada).
  await output.getByRole('button', { name: 'Copiar caminho de steps.qualify.branch' }).click();
  await expect(output.getByRole('status')).toHaveText('Caminho copiado.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('steps.qualify.branch');
  input = await area('Entrada');
  await input.getByRole('button', { name: 'Copiar valor de lead.score' }).click();
  await expect(input.getByRole('status')).toHaveText('Valor copiado.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('42');

  // Seletor do bloco de entrada: o lead desta etapa ou a saída do gatilho anterior.
  const source = input.getByRole('combobox', { name: 'Dados de' });
  await expect(source.locator('option')).toHaveText([
    'Lead recebido por esta etapa',
    /saída \(anterior direto\)/,
  ]);
  await source.selectOption('trigger');
  await expect(input.locator('.ndv-schema-line', { hasText: 'accepted' })).toContainText('booleano');
  await source.selectOption('');

  if (mobile)
    for (const name of ['Entrada', 'Parâmetros', 'Saída'] as const) {
      await area(name);
      await noHorizontalScroll();
    }
  input = await area('Entrada');

  // Navegação entre blocos sem fechar: atalho fora de campos de texto e botões nas bordas.
  await input.getByRole('button', { name: 'Esquema' }).focus();
  await page.keyboard.press(']');
  await expect(page.getByRole('dialog', { name: /Detalhes do bloco: (?!Qualificar)/ })).toBeVisible();
  output = await area('Saída');
  await expect(output).toContainText('não foi percorrido');
  await dialog.getByRole('button', { name: /Ir para o bloco anterior: Qualificar oportunidade/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Detalhes do bloco: Qualificar oportunidade' }),
  ).toBeVisible();
  // Em um campo de texto o atalho não navega: a tecla vira texto e o bloco continua o mesmo.
  output = await area('Saída');
  const search = output.getByRole('searchbox', { name: 'Buscar na Saída' });
  await search.focus();
  await page.keyboard.press(']');
  await page.keyboard.press('[');
  await expect(search).toHaveValue('][');
  await page.waitForTimeout(600);
  await expect(
    page.getByRole('dialog', { name: 'Detalhes do bloco: Qualificar oportunidade' }),
  ).toBeVisible();
  await expect(
    output.getByRole('columnheader', { name: 'branch' }).or(output.locator('.ndv-json')),
  ).toHaveCount(0);
  await search.fill('');
  await expect(output.getByTestId('count-output')).toHaveText('1 item');
  // Fora de campos de texto, [ volta ao bloco anterior.
  await output.getByRole('button', { name: 'Tabela' }).focus();
  await page.keyboard.press('[');
  await expect(page.getByRole('dialog', { name: /Detalhes do bloco: Novo lead/ })).toBeVisible();
  await page.keyboard.press(']');
  await expect(
    page.getByRole('dialog', { name: 'Detalhes do bloco: Qualificar oportunidade' }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: /Ir para o próximo bloco: Iniciar relacionamento \(Não\)/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Detalhes do bloco: Iniciar relacionamento' })).toBeVisible();

  // Erro da etapa com detalhe expansível.
  output = await area('Saída');
  await expect(output.getByRole('alert')).toContainText('A etapa falhou');
  await expect(output.getByRole('alert')).toContainText('Conta de e-mail não configurada.');
  await output.getByText('Ver detalhe do erro').click();
  await expect(output.getByRole('alert')).toContainText('EMAIL_ACCOUNT_REQUIRED');

  if (!mobile) {
    // Arrastar um campo permitido da Entrada para um parâmetro de texto insere a variável.
    input = dialog.getByRole('region', { name: 'Entrada' });
    const subject = dialog.getByRole('textbox', { name: 'Assunto · texto 1' });
    const pills = dialog.locator('.variable-pill select');
    const before = await pills.evaluateAll((items) => items.map((item) => (item as HTMLSelectElement).value));
    await input.locator('.ndv-key.draggable', { hasText: 'score' }).dragTo(subject);
    await expect
      .poll(() => pills.evaluateAll((items) => items.map((item) => (item as HTMLSelectElement).value)))
      .toEqual(expect.arrayContaining([...before, 'lead.score']));
    // Campo fora da lista de variáveis: a soltura é recusada e o motivo aparece.
    await input.getByRole('combobox', { name: 'Dados de' }).selectOption({ index: 1 });
    await expect(input.locator('.ndv-schema-line', { hasText: 'expected' })).toBeVisible();
    const count = await pills.count();
    const subjectValue = await subject.inputValue();
    await input.locator('.ndv-key.draggable', { hasText: 'expected' }).dragTo(subject);
    await expect(input.getByRole('status')).toContainText('não pode ser solto em um parâmetro');
    await expect(dialog.locator('.variable-drop-hint')).toContainText('Este campo não pode ser usado aqui');
    await expect(pills).toHaveCount(count);
    await expect(subject).toHaveValue(subjectValue);
    await expect(input.locator('.ndv-key.draggable', { hasText: 'branch' }).first()).toHaveAttribute(
      'data-variable',
      'steps.qualify.branch',
    );
    // Campos comuns (nome do bloco, busca) não recebem a variável ao soltar.
    await input.getByRole('combobox', { name: 'Dados de' }).selectOption('');
    const name = dialog.getByRole('textbox', { name: 'Nome do bloco' });
    const nameValue = await name.inputValue();
    await input.locator('.ndv-key.draggable', { hasText: 'score' }).dragTo(name);
    const inputSearch = input.getByRole('searchbox', { name: 'Buscar na Entrada' });
    await input.locator('.ndv-key.draggable', { hasText: 'company' }).dragTo(inputSearch);
    await page.waitForTimeout(400);
    await expect(name).toHaveValue(nameValue);
    await expect(inputSearch).toHaveValue('');
    await expect(pills).toHaveCount(count);
  }

  // Dados grandes: aviso com baixar e exibir mesmo assim.
  await dialog.getByRole('button', { name: /Ir para o bloco anterior: Qualificar oportunidade/ }).click();
  await dialog.getByLabel('Dados da etapa').selectOption('run-large');
  output = await area('Saída');
  await expect(output).toContainText('acima do limite');
  const download = page.waitForEvent('download');
  await output.getByRole('button', { name: 'Baixar JSON' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await output.getByRole('button', { name: 'Exibir mesmo assim' }).click();
  await expect(output.getByText('acima do limite')).toHaveCount(0);
  await expect(output.getByTestId('count-output')).toHaveText('1 item');

  // Sem execução: orientação para testar ou escolher uma execução.
  await dialog.getByLabel('Dados da etapa').selectOption('');
  input = await area('Entrada');
  await expect(input).toContainText('Sem dados para exibir');
  await expect(input).toContainText('Testar');
  await dialog.getByLabel('Dados da etapa').selectOption('run-fixture');
  output = await area('Saída');
  await expect(output.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true');
  await noHorizontalScroll();
  if (mobile) await area('Saída');
  else {
    await dialog
      .getByRole('region', { name: 'Entrada' })
      .getByRole('button', { name: 'Copiar caminho de lead.score' })
      .hover();
  }
  await page.screenshot({
    path: `docs/validation/editor-node-detail-${info.project.name}.png`,
    fullPage: true,
  });

  // Fechar e reabrir mantém a vista; o nome editado é salvo.
  await (await area('Parâmetros')).getByRole('textbox', { name: 'Nome do bloco' }).fill('Conferir dados');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('block-qualify')).toContainText('Conferir dados');
  const viewOf = async (detail: Locator, name: 'Entrada' | 'Saída', view: string) => {
    if (mobile)
      await detail.getByRole('tablist', { name: 'Área exibida' }).getByRole('tab', { name }).click();
    await expect(detail.getByRole('region', { name }).getByRole('button', { name: view })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  };
  const reopened = await openDetail(page, 'qualify');
  await viewOf(reopened, 'Saída', 'JSON');
  await page.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('block-qualify')).toContainText('Conferir dados');
  // A vista escolhida por lado sobrevive ao recarregamento da página.
  await expect(page.getByText('Contato de teste')).toBeVisible();
  const afterReload = await openDetail(page, 'qualify');
  await viewOf(afterReload, 'Saída', 'JSON');
  await viewOf(afterReload, 'Entrada', 'Esquema');
  await page.keyboard.press('Escape');
  await expect(afterReload).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
