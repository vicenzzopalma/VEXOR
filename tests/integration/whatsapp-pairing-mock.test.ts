import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));

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

describe('WhatsApp Pairing Code & MOCK Sandbox Integration', () => {
  let mockConnection: any;
  let metaConnection: any;
  const createdIds: string[] = [];

  // Fixtures must not remain visible in the local workspace after the suite.
  afterAll(async () => {
    for (const id of [mockConnection?.id, metaConnection?.id, ...createdIds].filter(Boolean)) {
      await request(`/integrations/whatsapp/${id}/disconnect`, 'owner', 'POST');
      const rows = (await request('/integrations/whatsapp')).data as Array<{ id: string; updatedAt: string }>;
      const row = rows.find((r) => r.id === id);
      if (row)
        await request(`/integrations/whatsapp/${id}/archive`, 'owner', 'POST', { expectedUpdatedAt: row.updatedAt });
    }
  });

  beforeAll(async () => {
    // 1. Create a MOCK sandbox connection
    const mockRes = await request('/integrations/whatsapp', 'owner', 'POST', {
      name: `MOCK Sandbox ${randomUUID()}`,
      provider: 'MOCK',
      settings: { mockName: 'sandbox-local' },
    });
    expect(mockRes.status).toBe(201);
    expect(mockRes.data.configurationRequired).toBe(false);
    mockConnection = mockRes.data;

    // 2. Create a META connection to test negative pairing-code capability
    const metaRes = await request('/integrations/whatsapp', 'owner', 'POST', {
      name: `META Cloud ${randomUUID()}`,
      provider: 'META',
      settings: { phoneNumberId: '1234567890', apiVersion: 'v21.0' },
      credentials: {
        accessToken: 'fixture-access-token',
        appSecret: 'fixture-app-secret-app-secret-app-secret',
        verifyToken: 'fixture-verification-token',
      },
    });
    expect(metaRes.status).toBe(201);
    metaConnection = metaRes.data;
  });

  it('conecta conexão MOCK imediatamente sem rede externa', async () => {
    const connectRes = await request(`/integrations/whatsapp/${mockConnection.id}/connect`, 'owner', 'POST');
    expect(connectRes.status).toBe(201);
    expect(connectRes.data.state).toBe('CONNECTED');
  });

  it('gera código de pareamento de 8 dígitos para a conexão MOCK via endpoint da API', async () => {
    const pairingRes = await request(`/integrations/whatsapp/${mockConnection.id}/pairing-code`, 'owner', 'POST', {
      phoneNumber: '+55 11 98765-4321',
    });
    expect(pairingRes.status).toBe(201);
    expect(pairingRes.data.id).toBe(mockConnection.id);
    expect(pairingRes.data.code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(pairingRes.data.expiresAt).toBeDefined();
  });

  it('rejeita pareamento por código para conta META com erro amigável', async () => {
    const pairingRes = await request(`/integrations/whatsapp/${metaConnection.id}/pairing-code`, 'owner', 'POST', {
      phoneNumber: '+55 11 98765-4321',
    });
    expect(pairingRes.status).toBe(400);
    expect(pairingRes.data.message).toBe('Esta conta não suporta pareamento por código.');
  });

  it('rejeita telefone inválido no endpoint de pairing-code', async () => {
    const pairingRes = await request(`/integrations/whatsapp/${mockConnection.id}/pairing-code`, 'owner', 'POST', {
      phoneNumber: 'telefone-invalido',
    });
    expect(pairingRes.status).toBe(400);
  });

  it('simula evento do Sandbox pela rota autenticada e persiste', async () => {
    const event = {
      kind: 'MESSAGE',
      id: `mock-msg-${randomUUID()}`,
      from: '5511999990000',
      text: 'Olá via Sandbox',
      name: 'Lead Simulado',
    };
    const viewer = await request(`/integrations/whatsapp/${mockConnection.id}/simulate`, 'viewer', 'POST', event);
    expect(viewer.status).toBe(403);
    const otherOrganization = await request(`/integrations/whatsapp/${mockConnection.id}/simulate`, 'other', 'POST', event);
    expect(otherOrganization.status).toBe(404);
    const res = await request(`/integrations/whatsapp/${mockConnection.id}/simulate`, 'owner', 'POST', event);
    expect(res.status).toBe(201);
    expect(res.data.accepted).toBe(true);
    expect(res.data.persistedEvents).toBe(1);
  });

  it('webhook público nunca aceita o Sandbox, com ou sem proxy', async () => {
    for (const headers of [{}, { 'x-forwarded-for': '' }, { 'x-forwarded-for': '203.0.113.10' }]) {
      const res = await fetch(`http://127.0.0.1:4000/webhooks/whatsapp/${mockConnection.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ kind: 'MESSAGE', id: `mock-${randomUUID()}`, from: '5511999990000', text: 'x' }),
      });
      expect(res.status).toBe(401);
    }
  });

  it('webhook Z-API exige o Client-Token configurado', async () => {
    const instance = `inst${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const created = await request('/integrations/whatsapp', 'owner', 'POST', {
      name: `Z-API ${randomUUID()}`,
      provider: 'Z_API',
      settings: { instance },
      credentials: { token: 'fixturetoken123', clientToken: 'fixture-client-token' },
    });
    expect(created.status).toBe(201);
    createdIds.push(created.data.id);
    expect(JSON.stringify(created.data)).not.toContain('fixture-client-token');
    const payload = JSON.stringify({
      instanceId: instance,
      type: 'ReceivedCallback',
      phone: '5511988887777',
      messageId: `zapi-${randomUUID()}`,
      text: { message: 'oi' },
    });
    const send = (headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:4000/webhooks/whatsapp/${created.data.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
      });
    expect((await send({})).status).toBe(401);
    expect((await send({ 'client-token': 'wrong-token' })).status).toBe(401);
    expect((await send({ 'client-token': 'fixture-client-token' })).status).toBe(201);
  });

  it('recusa token Z-API em settings em texto puro', async () => {
    const res = await request('/integrations/whatsapp', 'owner', 'POST', {
      name: `Z-API ${randomUUID()}`,
      provider: 'Z_API',
      settings: { instance: 'inst1', token: 'plaintext' },
    });
    expect(res.status).toBe(400);
  });

  it('desconecta a conta MOCK limpando o estado', async () => {
    const disconnRes = await request(`/integrations/whatsapp/${mockConnection.id}/disconnect`, 'owner', 'POST');
    expect(disconnRes.status).toBe(201);
    expect(disconnRes.data.state).toBe('DISCONNECTED');
  });
});
