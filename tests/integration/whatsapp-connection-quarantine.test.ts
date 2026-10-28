import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { processNextWhatsAppEvent } from '@eimax/workflow-runtime';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const created: string[] = [];

async function request(path: string, role = 'owner', method = 'GET', body?: unknown) {
  const result = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessions[role]}`,
      'x-eimax-client': 'workspace',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: result.status, data: await result.json() };
}

async function sandbox() {
  const res = await request('/integrations/whatsapp', 'owner', 'POST', {
    name: `MOCK Sandbox ${randomUUID()}`,
    provider: 'MOCK',
    settings: { mockName: 'quarentena' },
  });
  expect(res.status).toBe(201);
  created.push(res.data.id);
  const connected = await request(`/integrations/whatsapp/${res.data.id}/connect`, 'owner', 'POST');
  expect(connected.data.state).toBe('CONNECTED');
  return connected.data;
}

async function processUntilHandled(connectionId: string) {
  for (let i = 0; i < 200; i++) {
    const pending = await db.whatsAppEvent.count({ where: { connectionId, status: 'PENDING' } });
    if (!pending) return;
    await processNextWhatsAppEvent(db);
  }
  throw new Error('Evento não processado');
}

afterAll(async () => {
  await db.whatsAppConnection.updateMany({
    where: { id: { in: created } },
    data: { state: 'ARCHIVED', enabled: false },
  });
  await db.$disconnect();
});

describe.sequential('Quarentena por conta (como VERITAS): uma conta restrita não afeta as outras', () => {
  it('sessão encerrada com 403 isola só a conta afetada e bloqueia novas operações nela', async () => {
    const banned = await sandbox();
    const healthy = await sandbox();
    const closed = await request(`/integrations/whatsapp/${banned.id}/simulate`, 'owner', 'POST', {
      kind: 'CONNECTION_CLOSED',
      id: `close-${randomUUID()}`,
      statusReason: 403,
    });
    expect(closed.status).toBe(201);
    await processUntilHandled(banned.id);

    const rows = (await request('/integrations/whatsapp')).data as Array<Record<string, any>>;
    const bannedRow = rows.find((r) => r.id === banned.id)!;
    const healthyRow = rows.find((r) => r.id === healthy.id)!;
    expect(bannedRow).toMatchObject({ quarantined: true, quarantineReason: 'PROVIDER_STATUS_403', state: 'ERROR' });
    expect(healthyRow).toMatchObject({ quarantined: false, state: 'CONNECTED' });

    const blocked = await request(`/integrations/whatsapp/${banned.id}/connect`, 'owner', 'POST');
    expect(blocked.status).toBe(409);
    expect((await request(`/integrations/whatsapp/${healthy.id}/refresh`, 'owner', 'POST')).status).toBe(201);
  });

  it('fechamento comum (sem código de restrição) apenas desconecta', async () => {
    const account = await sandbox();
    await request(`/integrations/whatsapp/${account.id}/simulate`, 'owner', 'POST', {
      kind: 'CONNECTION_CLOSED',
      id: `close-${randomUUID()}`,
      statusReason: 428,
    });
    await processUntilHandled(account.id);
    const row = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.quarantinedAt).toBeNull();
    expect(row.state).toBe('DISCONNECTED');
  });

  it('liberação exige titular, organização da sessão e revisão atual', async () => {
    const account = await sandbox();
    await db.whatsAppConnection.update({
      where: { id: account.id },
      data: { quarantinedAt: new Date(), quarantineReason: 'PROVIDER_STATUS_401', enabled: false, state: 'ERROR' },
    });
    const row = (await request('/integrations/whatsapp')).data.find((r: any) => r.id === account.id);
    const path = `/integrations/whatsapp/${account.id}/release-quarantine`;
    expect((await request(path, 'editor', 'POST', { expectedUpdatedAt: row.updatedAt })).status).toBe(403);
    expect((await request(path, 'other', 'POST', { expectedUpdatedAt: row.updatedAt })).status).toBe(404);
    expect(
      (await request(path, 'owner', 'POST', { expectedUpdatedAt: new Date(0).toISOString() })).status,
    ).toBe(409);
    const released = await request(path, 'owner', 'POST', { expectedUpdatedAt: row.updatedAt });
    expect(released.status).toBe(201);
    expect(released.data).toMatchObject({ quarantined: false, state: 'DISCONNECTED' });
    expect((await request(`/integrations/whatsapp/${account.id}/connect`, 'owner', 'POST')).data.state).toBe(
      'CONNECTED',
    );
  });
});
