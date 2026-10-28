import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { durableFixture } from '../fixtures/durable-flow';

test('editor configura segundos e histórico real acompanha suspensão e retomada', async ({
  page,
}, testInfo) => {
  process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
  const db = new PrismaClient();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const f = await durableFixture(db, 8, 'org-local', new Date(Date.now() + 300000));
    await page.goto(`/editor/${f.workflow.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(5);
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Fechar propriedades' }).click();
    await page.locator('.react-flow__node[data-id="n2"]').click();
    await expect(page.getByLabel('Tempo de espera', { exact: true })).toHaveValue('8');
    await expect(page.getByRole('combobox', { name: 'Unidade', exact: true })).toHaveValue('seconds');
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Fechar propriedades' }).click();
    await db.execution.update({ where: { id: f.execution.id }, data: { availableAt: new Date() } });
    child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/durable-worker.ts'], {
      env: { ...process.env, WHATSAPP_EXTERNAL_ENABLED: 'false', EMAIL_EXTERNAL_ENABLED: 'false' },
      windowsHide: true,
      stdio: 'ignore',
    });
    await page.getByRole('button', { name: /Aguardando · Lead de teste durável/ }).click();
    await expect(page.getByRole('region', { name: 'Resultado da execução real' })).toContainText(
      'Previsão de continuar',
    );
    await page.screenshot({ path: `docs/validation/phase6a-editor-${testInfo.project.name}.png` });
    await page.goto('/execucoes');
    const card = page.locator('.run-card').filter({ hasText: 'Lead de teste durável' }).first();
    await card.getByRole('button', { name: 'Consultar resultado' }).click();
    await expect(page.getByRole('region', { name: 'Resultado da execução real' })).toContainText(
      'Retomada:',
      { timeout: 20000 },
    );
    await expect
      .poll(async () => (await db.execution.findUniqueOrThrow({ where: { id: f.execution.id } })).status)
      .toBe('COMPLETED');
    const steps = await db.executionStep.findMany({ where: { executionId: f.execution.id } });
    expect(steps).toHaveLength(5);
    expect(steps.filter((s) => s.nodeType === 'tag.add')).toHaveLength(1);
  } finally {
    if (child && child.exitCode === null) {
      const closed = new Promise((resolve) => child!.once('close', resolve));
      child.kill('SIGKILL');
      await closed;
    }
    await db.$disconnect();
  }
});
