import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createSdrTemplate } from '@eimax/workflow-schema';
import { randomUUID } from 'node:crypto';

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test('filtra e navega no histórico real sem limitar a primeira página', async ({ page }, info) => {
  test.setTimeout(90000);
  const name = `Histórico de teste ${info.project.name} ${Date.now()}`;
  const flow = await db.workflow.create({
    data: { organizationId: 'org-local', draft: { ...createSdrTemplate(), name } },
  });
  await db.execution.createMany({
    data: Array.from({ length: 23 }, () => ({
      organizationId: 'org-local',
      workflowId: flow.id,
      eventKey: randomUUID(),
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    })),
  });
  await page.goto('/execucoes');
  const filter = page.getByRole('combobox', { name: 'Fluxo', exact: true });
  await expect(filter).toContainText(name);
  await filter.selectOption({ label: name });
  await expect(filter).toHaveValue(flow.id);
  const pages = page.getByRole('navigation', { name: 'Páginas de execuções' });
  await expect(pages).toContainText('23 execuções');
  await expect(pages).toContainText('Página 1 de 2');
  await expect(page.locator('.run-card')).toHaveCount(20);
  if (info.project.name === 'mobile') await page.locator('.execution-filters').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/validation/executions-filters-${info.project.name}.png`,
    fullPage: false,
  });
  await pages.getByRole('button', { name: 'Próxima' }).click();
  await expect(pages).toContainText('Página 2 de 2');
  await expect(page.locator('.run-card')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('FAILED');
  await expect(pages).toContainText('0 execuções');
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('QUEUED');
  await page.getByLabel('De', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-01-01');
  await expect(pages).toContainText('23 execuções');
  await page.getByLabel('De', { exact: true }).fill('2026-01-02');
  await expect(page.locator('.execution-filters').getByRole('alert')).toContainText('data inicial');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('.execution-filters').getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mantém o histórico acessível quando a API ainda não tem a busca nova', async ({ page }) => {
  await page.route('**/api/executions/search?*', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/executions', (route) => route.fulfill({ json: [] }));
  await page.goto('/execucoes');
  await expect(page.getByText('A API em execução ainda não oferece filtros e paginação.', { exact: false })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Fluxo', exact: true })).toBeDisabled();
  await expect(page.getByText('Nenhuma execução real registrada')).toBeVisible();
});
