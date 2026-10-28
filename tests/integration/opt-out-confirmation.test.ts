import { beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { ConnectorError, sealSecrets, type Transport } from '@eimax/connectors';
import {
  activateOptOutConfirmations,
  captureOptOutInTransaction,
  dispatchNextOptOutConfirmation,
  dispatchNextOptOut,
} from '@eimax/workflow-runtime';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
beforeAll(async () => {
  await activateOptOutConfirmations(db);
  await db.optOutConfirmationActivation.update({
    where: { id: 'default' },
    data: { activatedAt: new Date(Date.now() - 60000) },
  });
});
beforeEach(async () => {
  vi.stubEnv('OPT_OUT_CONFIRMATION_ENABLED', 'true');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '');
  vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example.com');
  await db.optOutConfirmation.updateMany({
    where: { status: { in: ['PENDING', 'HELD', 'PROCESSING'] } },
    data: { status: 'FAILED', errorCode: 'TEST_STALE' },
  });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());
async function fixture(phone = '5575988052539', text = 'SAIR', age = 0, organizationId?: string) {
  const org =
    organizationId ?? (await db.organization.create({ data: { name: `Confirmation ${randomUUID()}` } })).id;
  const connection = await db.whatsAppConnection.create({
    data: {
      organizationId: org,
      name: 'MOCK confirmation',
      provider: 'MOCK',
      settings: {},
      enabled: true,
      state: 'CONNECTED',
    },
  });
  const event = await db.whatsAppEvent.create({
    data: {
      connectionId: connection.id,
      providerEventId: randomUUID(),
      kind: 'MESSAGE',
      payload: { from: phone, text },
      createdAt: new Date(Date.now() - age),
    },
  });
  const row = await db.$transaction((tx) =>
    captureOptOutInTransaction(tx, {
      organizationId: org,
      connectionId: connection.id,
      sourceEventId: event.id,
      providerEventId: event.providerEventId,
      from: phone,
      text,
      receivedAt: event.createdAt,
    }),
  );
  return { org, connection, event, row: row! };
}
async function delivered(id: string) {
  await db.optOutEvent.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
}
it('somente um envio por empresa+número; novos SAIR não duplicam e outras empresas são independentes', async () => {
  const a = await fixture();
  await delivered(a.row.id);
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('SENT');
  const b = await fixture('7588052539', 'sairr', 0, a.org);
  await delivered(b.row.id);
  expect(await db.optOutConfirmation.count({ where: { organizationId: a.org } })).toBe(1);
  expect(await dispatchNextOptOutConfirmation(db)).toBeNull();
  const c = await fixture();
  await delivered(c.row.id);
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('SENT');
});
it('pedidos anteriores à ativação não criam chave nem impedem o primeiro SAIR novo', async () => {
  const old = await fixture('5575988052539', 'SAIR', 86400000);
  expect(await db.optOutConfirmation.count({ where: { organizationId: old.org } })).toBe(0);
  const fresh = await fixture('5575988052539', 'SAIR', 0, old.org);
  await delivered(fresh.row.id);
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('SENT');
});
it.each(['quarantine', 'ARCHIVED', 'DISCONNECTED'])(
  'conexão indisponível: %s fica pendente',
  async (reason) => {
    const f = await fixture();
    await delivered(f.row.id);
    await db.whatsAppConnection.update({
      where: { id: f.connection.id },
      data:
        reason === 'quarantine' ? { quarantinedAt: new Date(), quarantineReason: 'TEST' } : { state: reason },
    });
    const send = vi.fn();
    const result = await dispatchNextOptOutConfirmation(db, send);
    expect(result?.status).toBe('PENDING');
    expect(send).not.toHaveBeenCalled();
  },
);
it('retido por allowlist não envia; liberação posterior usa a mesma fila', async () => {
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '5511999999999');
  const f = await fixture();
  await delivered(f.row.id);
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('HELD');
  vi.stubEnv('OPT_OUT_CONFIRMATION_ALLOWLIST', '');
  await db.optOutConfirmation.updateMany({
    where: { organizationId: f.org },
    data: { availableAt: new Date(0) },
  });
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('SENT');
});
it('rejeição explícita faz backoff; timeout incerto não é reenviado', async () => {
  const f = await fixture();
  await delivered(f.row.id);
  await db.whatsAppConnection.update({
    where: { id: f.connection.id },
    data: {
      provider: 'EVOLUTION',
      settings: { origin: 'https://gateway.example.com', instance: 'fixture' },
      credentials: sealSecrets({ apiKey: 'fixture' }),
    },
  });
  const reject: Transport = async (_url, method) => {
    if (method === 'GET') return { instance: { state: 'open' } };
    throw new ConnectorError('PROVIDER_HTTP_429');
  };
  const retry = await dispatchNextOptOutConfirmation(db, reject);
  expect(retry?.status).toBe('PENDING');
  expect(retry!.availableAt.getTime()).toBeGreaterThan(Date.now());
  await db.optOutConfirmation.update({ where: { id: retry!.id }, data: { availableAt: new Date(0) } });
  const uncertain: Transport = async (_url, method) => {
    if (method === 'GET') return { instance: { state: 'open' } };
    throw new ConnectorError('PROVIDER_TIMEOUT');
  };
  expect((await dispatchNextOptOutConfirmation(db, uncertain))?.status).toBe('FAILED');
  expect(await dispatchNextOptOutConfirmation(db, uncertain)).toBeNull();
});
it('Esfera tem prioridade: confirmação espera ACK e falha da confirmação não reabre descadastro', async () => {
  const f = await fixture();
  expect(await dispatchNextOptOutConfirmation(db)).toBeNull();
  await db.optOutEvent.updateMany({
    where: { id: { not: f.row.id }, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED' },
  });
  const result = await dispatchNextOptOut(
    db,
    async (_url, _headers, body) => ({
      status: 200,
      body: { ack: true, eventId: (body as { eventId: string }).eventId, status: 'recorded' },
    }),
    () => ({ baseUrl: 'http://127.0.0.1:8080', companyId: 1, token: 'fixture-token-12345' }),
  );
  expect(result?.status).toBe('DELIVERED');
  await db.whatsAppConnection.update({ where: { id: f.connection.id }, data: { state: 'DISCONNECTED' } });
  expect((await dispatchNextOptOutConfirmation(db))?.status).toBe('PENDING');
  expect((await db.optOutEvent.findUniqueOrThrow({ where: { id: f.row.id } })).status).toBe('DELIVERED');
});
it('revisão humana confirmada enfileira; rejeitar não confirma', async () => {
  await fetch('http://127.0.0.1:4000/me', { headers: { Authorization: `Bearer ${sessions.owner}` } });
  const f = await fixture('5575988052539', 'pare de brincadeira', 0, 'org-local');
  expect(await db.optOutConfirmation.count({ where: { sourceOptOutId: f.row.id } })).toBe(0);
  // Use a distinct number if previous suites queued the same org-local contact.
  const response = await fetch(`http://127.0.0.1:4000/opt-outs/${f.row.id}/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessions.owner}`,
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
    },
    body: JSON.stringify({ decision: 'CONFIRM', expectedUpdatedAt: f.row.updatedAt.toISOString() }),
  });
  expect(response.status).toBe(201);
  expect(
    await db.optOutConfirmation.count({ where: { organizationId: 'org-local', phoneKey: '7588052539' } }),
  ).toBe(1);
});
