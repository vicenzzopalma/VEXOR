import { test, expect } from '@playwright/test';

test('Evolution desconectado informa indisponibilidade sem exigir configuração técnica', async ({ page }) => {
  await page.goto('/integracoes/whatsapp');
  await page.request.post('/api/development/session', { headers: { 'x-eimax-client': 'workspace' } });
  const name = `Conta sem provedor ${Date.now()}`;
  const response = await page.request.post('/api/integrations/whatsapp', {
    headers: { 'x-eimax-client': 'workspace' },
    data: { name, provider: 'EVOLUTION', settings: {} },
  });
  expect(response.status()).toBe(201);
  const connection = await response.json();
  try {
    await page.reload();
    const device = page.locator('.run-card').filter({ hasText: name });
    await expect(device).toContainText('Desconectada');
    await expect(device.getByRole('button', { name: 'Desconectar', exact: true })).toHaveCount(0);
    await device.getByRole('button', { name: 'Conectar com QR Code', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Conectar WhatsApp/ })).toContainText(
      'Serviço de conexão WhatsApp indisponível',
    );
    await expect(page.getByRole('textbox', { name: 'Endereço HTTPS do gateway' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Chave da API' })).toHaveCount(0);
    await expect(page.locator('.whatsapp-qr')).toHaveCount(0);
    await page.getByRole('button', { name: 'Fechar janela', exact: true }).click();
    await expect(device.getByRole('button', { name: 'Conectar com QR Code', exact: true })).toBeEnabled();
    await device.getByRole('button', { name: 'Remover da lista', exact: true }).click();
    await expect(device).toHaveCount(0);
  } finally {
    await page.request.post(`/api/integrations/whatsapp/${connection.id}/archive`, {
      headers: { 'x-eimax-client': 'workspace' },
      data: { expectedUpdatedAt: connection.updatedAt },
    });
  }
});

test('novo celular pede apenas nome, sem gateway, instância ou chaves', async ({ page }) => {
  const name = `Conta sem provedor ${Date.now()}`;
  await page.goto('/integracoes/whatsapp');
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Endereço HTTPS do gateway' })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Nome da instância existente' })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Chave da API' })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Nome da conta', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator('.run-card').filter({ hasText: name });
  await card.getByRole('button', { name: 'Conectar com QR Code', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Conectar WhatsApp/ })).toContainText(
    'Você não precisa configurar',
  );
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  await card.getByRole('button', { name: 'Renomear', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Endereço HTTPS do gateway' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar janela', exact: true }).click();
  await card.getByRole('button', { name: 'Remover da lista', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('ações seguem a sessão e QR é exibido apenas quando retornado pelo servidor (contrato local)', async ({
  page,
}) => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=';
  let connection = {
    id: 'ui-contract-only',
    name: 'Contrato de sessão · sem provedor real',
    provider: 'EVOLUTION',
    state: 'DISCONNECTED',
    configurationRequired: false,
    credentialsConfigured: true,
    settings: { instance: 'contract' },
    updatedAt: new Date().toISOString(),
    webhookPath: '/webhooks/whatsapp/ui-contract-only',
  };
  await page.route('**/api/integrations/whatsapp', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/integrations/whatsapp/ui-contract-only/*', async (route) => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'connect') connection = { ...connection, state: 'WAITING_FOR_QR' };
    if (action === 'refresh') connection = { ...connection, state: 'CONNECTED' };
    if (action === 'disconnect') connection = { ...connection, state: 'DISCONNECTED' };
    await route.fulfill({
      json: {
        ...connection,
        ...(action === 'connect' ? { qr: png, expiresAt: new Date(Date.now() + 30000).toISOString() } : {}),
      },
    });
  });
  await page.goto('/integracoes/whatsapp');
  const device = page.locator('.run-card').filter({ hasText: connection.name });
  await expect(device.getByRole('button', { name: 'Desconectar', exact: true })).toHaveCount(0);
  await expect(device.getByRole('button', { name: 'Conectar com QR Code', exact: true })).toBeEnabled();
  // Evolution reports "connecting" while a QR is available: reloading must not trap the user.
  connection = { ...connection, state: 'CONNECTING' };
  await page.reload();
  await device.getByRole('button', { name: 'Ver QR Code', exact: true }).click();
  await expect(page.locator('.whatsapp-qr')).toHaveAttribute('src', png);
  await expect(page.getByRole('dialog', { name: /Conectar WhatsApp/ })).toBeHidden({ timeout: 12000 });
  await expect(device).toContainText('Conectada');
  await device.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(device).toContainText('Desconectada');
  await expect(device.getByRole('button', { name: 'Desconectar', exact: true })).toHaveCount(0);
  await expect(device.getByRole('button', { name: 'Conectar com QR Code', exact: true })).toBeEnabled();
  await expect(page.locator('.whatsapp-qr')).toHaveCount(0);
});

test('Sandbox local conecta sem rede externa e pode ser removido', async ({ page }) => {
  const name = `Sandbox ${Date.now()}`;
  await page.goto('/integracoes/whatsapp');
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nome da conta', exact: true }).fill(name);
  await dialog.getByRole('combobox', { name: 'Provedor', exact: true }).selectOption('MOCK');
  await expect(dialog.getByRole('textbox', { name: 'Token da instância' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator('.run-card').filter({ hasText: name });
  await expect(card).toContainText('Sandbox local');
  await card.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(card).toContainText('Conectada');
  await card.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(card).toContainText('Desconectada');
  await card.getByRole('button', { name: 'Remover da lista', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('conta em quarentena fica isolada e as outras seguem conectáveis (contrato local)', async ({ page }) => {
  const base = {
    provider: 'EVOLUTION',
    managed: true,
    state: 'DISCONNECTED',
    configurationRequired: false,
    credentialsConfigured: true,
    settings: {},
    updatedAt: new Date().toISOString(),
  };
  const rows = [
    {
      ...base,
      id: 'q-banned',
      name: 'Número restringido',
      state: 'ERROR',
      quarantined: true,
      quarantinedAt: new Date().toISOString(),
      quarantineReason: 'PROVIDER_STATUS_403',
      webhookPath: '/webhooks/whatsapp/q-banned',
    },
    { ...base, id: 'q-ok', name: 'Número novo', quarantined: false, webhookPath: '/webhooks/whatsapp/q-ok' },
  ];
  let released = false;
  await page.route('**/api/integrations/whatsapp', (route) => route.fulfill({ json: rows }));
  await page.route('**/api/integrations/whatsapp/q-banned/release-quarantine', (route) => {
    released = true;
    return route.fulfill({ status: 201, json: { ...rows[1], id: 'q-banned', name: 'Número restringido' } });
  });
  await page.goto('/integracoes/whatsapp');
  const banned = page.locator('.run-card').filter({ hasText: 'Número restringido' });
  const healthy = page.locator('.run-card').filter({ hasText: 'Número novo' });
  await expect(banned).toContainText('restringiu esta sessão (403)');
  await expect(banned.getByRole('button', { name: 'Conectar com QR Code', exact: true })).toHaveCount(0);
  await expect(banned.getByRole('button', { name: 'Código de pareamento', exact: true })).toHaveCount(0);
  await expect(healthy.getByRole('button', { name: 'Conectar com QR Code', exact: true })).toBeEnabled();
  await banned.getByRole('button', { name: 'Liberar quarentena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Liberar quarentena/ });
  await expect(dialog).toContainText('As outras contas não são afetadas');
  await dialog.getByRole('button', { name: 'Liberar quarentena', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(released).toBe(true);
});
