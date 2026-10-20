import 'dotenv/config';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { connectionRevision, sealSecrets } from '@eimax/connectors';
import { dispatchNextEmail, dispatchNextWhatsApp, enqueueWorkflowExecution } from '@eimax/workflow-runtime';
import { createSdrTemplate, sampleLead, type Workflow } from '@eimax/workflow-schema';
import { waitForExecution } from './helpers';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
// Use the same CommonJS class identity as the compiled runtime for injected failures.
const { ConnectorError } = createRequire(import.meta.url)('@eimax/connectors');
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
it('WhatsApp repete rejeição explícita 429 e exige conciliação para resposta incerta, sem rede', async () => {
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'true');
  const organization = await db.organization.create({ data: { name: 'Contrato retry WhatsApp' } });
  const connection = await db.whatsAppConnection.create({
    data: {
      organizationId: organization.id,
      name: 'Fixture',
      provider: 'META',
      state: 'CONNECTED',
      enabled: true,
      settings: { phoneNumberId: '1234', apiVersion: 'v99.0' },
      credentials: sealSecrets({ accessToken: 'fixture' }),
    },
  });
  const workflow = await db.workflow.create({
    data: { organizationId: organization.id, draft: createSdrTemplate() },
  });
  const lead = await db.lead.create({
    data: {
      organizationId: organization.id,
      workflowId: workflow.id,
      eventKey: randomUUID(),
      ...sampleLead,
      phone: '5511999999999',
      whatsappConsent: true,
      lastInboundAt: new Date(),
      data: sampleLead,
    },
  });
  const data = {
    organizationId: organization.id,
    connectionId: connection.id,
    leadId: lead.id,
    channel: 'WHATSAPP',
    recipient: lead.phone!,
    title: 'Fixture',
    message: 'Fixture',
    payload: { to: lead.phone!, text: 'Fixture', connectionRevision: connectionRevision(connection) },
  };
  const notification = await db.notification.create({ data });
  const transport = vi
    .fn()
    .mockResolvedValueOnce({ id: '1234', status: 'CONNECTED' })
    .mockRejectedValueOnce(new ConnectorError('PROVIDER_HTTP_429', true, 5000))
    .mockResolvedValueOnce({ id: '1234', status: 'CONNECTED' })
    .mockResolvedValueOnce({ messages: [{ id: randomUUID() }] });
  expect((await dispatchNextWhatsApp(db, transport))?.status).toBe('PENDING');
  await dispatchNextWhatsApp(db, transport);
  expect(transport).toHaveBeenCalledTimes(2);
  await db.notification.update({ where: { id: notification.id }, data: { availableAt: new Date(0) } });
  await dispatchNextWhatsApp(db, transport);
  expect(transport).toHaveBeenCalledTimes(4);
  expect(
    (await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).providerMessageId,
  ).toBeTruthy();
  const second = await db.notification.create({ data });
  const ambiguous = vi
    .fn()
    .mockResolvedValueOnce({ id: '1234', status: 'CONNECTED' })
    .mockRejectedValueOnce(new ConnectorError('PROVIDER_REQUEST_UNCERTAIN'));
  expect((await dispatchNextWhatsApp(db, ambiguous))?.errorCode).toBe('PROVIDER_REQUEST_UNCERTAIN');
  expect((await db.notification.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('FAILED');
  await dispatchNextWhatsApp(db, ambiguous);
  expect(ambiguous).toHaveBeenCalledTimes(2);
});
const fixtureSvixKey = Buffer.alloc(32, 7);
let email: any;
let sheets: any;
async function request(path: string, role = 'owner', method = 'GET', body?: unknown) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessions[role]}`,
      'x-eimax-client': 'workspace',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());
describe.sequential('Fase 5: API e PostgreSQL locais, sem serviços externos', () => {
  it('OAuth persiste estado protegido de uso único, expiração e isolamento em PostgreSQL', async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          '--tsconfig',
          'apps/api/tsconfig.json',
          'tests/fixtures/oauth-state.ts',
        ],
        { env: process.env, windowsHide: true },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve(output) : reject(new Error('OAuth contract subprocess failed')),
      );
    });
    expect(JSON.parse(output.trim())).toEqual({
      singleUse: true,
      isolated: true,
      expired: true,
      externalRequests: 0,
    });
  });
  it('catálogo declara capacidades e RBAC; conta de e-mail criptografada e isolada', async () => {
    const catalog = await request('/integrations/catalog');
    expect(catalog.data.map((item: any) => item.provider)).toEqual(
      expect.arrayContaining(['META', 'EVOLUTION', 'RESEND', 'GOOGLE_SHEETS', 'RD_STATION', 'HUBSPOT']),
    );
    expect((await request('/integrations', 'viewer', 'POST', {})).status).toBe(403);
    const result = await request('/integrations', 'owner', 'POST', {
      name: `Contrato e-mail ${randomUUID()}`,
      provider: 'RESEND',
      settings: { from: 'team@example.com' },
      credentials: { apiKey: 'fixture-api-key', webhookSecret: `whsec_${fixtureSvixKey.toString('base64')}` },
    });
    expect(result.status).toBe(201);
    email = result.data;
    expect(email.configurationRequired).toBe(true);
    expect(email.state).toBe('DISCONNECTED');
    expect(JSON.stringify(email)).not.toContain('fixture-api-key');
    expect(
      (await db.integrationConnection.findUniqueOrThrow({ where: { id: email.id } })).credentials,
    ).not.toContain('fixture-api-key');
    expect((await request('/integrations', 'other')).data.some((row: any) => row.id === email.id)).toBe(
      false,
    );
    expect((await request(`/integrations/${email.id}/disconnect`, 'other', 'POST')).status).toBe(404);
    expect((await request(`/integrations/${email.id}/enable`, 'owner', 'POST')).status).toBe(400);
    await expect(
      db.notification.create({
        data: {
          integrationId: email.id,
          organizationId: 'org-other',
          channel: 'EMAIL',
          recipient: 'fixture',
          title: 'fixture',
          message: '',
        },
      }),
    ).rejects.toThrow();
  });
  it('rejeita sobrescrita concorrente e não permite configurações desconhecidas', async () => {
    const update = {
      name: 'Contrato revisado',
      provider: 'RESEND',
      settings: { from: 'team@example.com' },
      expectedUpdatedAt: email.updatedAt,
    };
    expect((await request(`/integrations/${email.id}`, 'owner', 'PATCH', update)).status).toBe(200);
    expect((await request(`/integrations/${email.id}`, 'owner', 'PATCH', update)).status).toBe(409);
    expect(
      (
        await request('/integrations', 'owner', 'POST', {
          name: 'SSRF',
          provider: 'RESEND',
          settings: { origin: 'http://127.0.0.1' },
        })
      ).status,
    ).toBe(400);
  });
  it('Sheets prepara conta, mapeia dados locais e rejeita leads de outra organização', async () => {
    const created = await request('/integrations', 'owner', 'POST', {
      name: 'Contrato Sheets',
      provider: 'GOOGLE_SHEETS',
      settings: {},
    });
    expect(created.status).toBe(201);
    sheets = created.data;
    expect((await request(`/integrations/${sheets.id}/sheets`)).data).toEqual({
      configurationRequired: true,
      items: [],
    });
    expect(
      (await request(`/integrations/${sheets.id}/oauth/prepare`, 'owner', 'POST')).data.configurationRequired,
    ).toBe(true);
    const mapping = { spreadsheetId: 'fixture', sheet: 'Leads', fields: [{ column: 'Nome', field: 'name' }] };
    const preview = await request(`/integrations/${sheets.id}/sheets/import-preview`, 'editor', 'POST', {
      mapping,
      headers: ['Nome'],
      rows: [['Empresa & Cia']],
    });
    expect(preview.status).toBe(201);
    expect(preview.data).toMatchObject({
      mode: 'LOCAL_PREVIEW',
      persisted: false,
      rows: [{ row: 2, fields: { name: 'Empresa & Cia' } }],
    });
    expect(
      (
        await request(`/integrations/${sheets.id}/sheets/import-preview`, 'other', 'POST', {
          mapping,
          headers: ['Nome'],
          rows: [],
        })
      ).status,
    ).toBe(404);
    const foreignWorkflow = await db.workflow.create({
      data: { organizationId: 'org-other', draft: createSdrTemplate() },
    });
    const lead = await db.lead.create({
      data: {
        organizationId: 'org-other',
        workflowId: foreignWorkflow.id,
        eventKey: randomUUID(),
        ...sampleLead,
        data: sampleLead,
      },
    });
    expect(
      (
        await request(`/integrations/${sheets.id}/sheets/export-preview`, 'editor', 'POST', {
          mapping,
          leadIds: [lead.id],
        })
      ).status,
    ).toBe(404);
  });
  it('recibos de e-mail autenticados persistem, deduplicam e reconciliam fora de ordem', async () => {
    const notification = await db.notification.create({
      data: {
        organizationId: 'org-local',
        integrationId: email.id,
        channel: 'EMAIL',
        providerMessageId: randomUUID(),
        status: 'PENDING',
        recipient: 'fixture',
        title: 'Contrato de recibo, sem envio',
        message: '',
      },
    });
    async function receipt(type: string, id: string, valid = true) {
      const raw = JSON.stringify({ type, data: { email_id: notification.providerMessageId } });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', valid ? fixtureSvixKey : Buffer.alloc(32, 8))
        .update(`${id}.${timestamp}.`)
        .update(raw)
        .digest('base64');
      return fetch(`http://127.0.0.1:4000/webhooks/email/${email.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': `v1,${signature}`,
        },
        body: raw,
      });
    }
    const eventId = randomUUID();
    expect((await receipt('email.delivered', eventId, false)).status).toBe(401);
    for (const [type, id] of [
      ['email.delivered', eventId],
      ['email.delivered', eventId],
      ['email.sent', randomUUID()],
    ])
      expect((await receipt(type, id)).status).toBe(201);
    expect(await db.integrationEvent.count({ where: { integrationId: email.id } })).toBe(2);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).status).toBe(
      'PENDING',
    );
    await dispatchNextEmail(db);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).status).toBe(
      'DELIVERED',
    );
    const history = await request('/integrations/ingress/history');
    expect(
      history.data.some((row: any) => row.resourceId === email.id && row.code === 'AUTHENTICATION_REJECTED'),
    ).toBe(true);
    expect(JSON.stringify(history.data)).not.toContain(fixtureSvixKey.toString('base64'));
  });
  it('limita ingressos por recurso e registra rejeição sem armazenar segredo', async () => {
    const minute = Math.floor(Date.now() / 60000);
    const keys: string[] = [];
    for (const address of ['127.0.0.1', '::ffff:127.0.0.1']) {
      const key = createHash('sha256').update(`${minute}:route:EMAIL:${email.id}:${address}`).digest('hex');
      keys.push(key);
      await db.webhookRateBucket.upsert({
        where: { key },
        create: { key, count: 120, expiresAt: new Date((minute + 2) * 60000) },
        update: { count: 120 },
      });
    }
    try {
      expect(
        (
          await fetch(`http://127.0.0.1:4000/webhooks/email/${email.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
        ).status,
      ).toBe(429);
    } finally {
      await db.webhookRateBucket.deleteMany({ where: { key: { in: keys } } });
    }
    expect(
      await db.webhookIngressLog.count({ where: { resourceId: email.id, code: 'RATE_LIMITED' } }),
    ).toBeGreaterThan(0);
  });
  it('webhook HMAC autentica bytes, rejeita replay antigo e enfileira evento repetido uma vez', async () => {
    const template = createSdrTemplate();
    const flow: Workflow = {
      ...template,
      nodes: [
        { ...template.nodes[0], type: 'webhook.received', config: { credentialRef: 'signed-ingress' } },
        template.nodes.find((n) => n.type === 'tag.add')!,
      ],
      edges: [{ id: 'edge', source: 'trigger', target: 'tag' }],
    };
    const workflow = await db.workflow.create({ data: { organizationId: 'org-local', draft: flow } });
    await db.workflowVersion.create({
      data: { organizationId: 'org-local', workflowId: workflow.id, number: 1, snapshot: flow },
    });
    const raw = JSON.stringify({ ...sampleLead, name: `HMAC ${randomUUID()}` });
    async function signed(timestamp: string, altered = false, eventKey?: string, bindEventKey = false) {
      const signature = `sha256=${createHmac('sha256', sessions.webhook)
        .update(`${timestamp}.${bindEventKey && eventKey ? `${eventKey}.` : ''}${raw}`)
        .digest('hex')}`;
      return fetch(`http://127.0.0.1:4000/webhooks/${workflow.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vexor-timestamp': timestamp,
          'x-vexor-signature': signature,
          ...(eventKey !== undefined ? { 'x-eimax-event-key': eventKey } : {}),
        },
        body: altered ? raw + ' ' : raw,
      });
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect((await signed(timestamp, true)).status).toBe(401);
    expect((await signed(String(Math.floor(Date.now() / 1000) - 600))).status).toBe(401);
    expect((await signed(timestamp)).status).toBe(201);
    expect((await signed(timestamp, false, 'unsigned-replay-key')).status).toBe(401);
    expect((await signed(timestamp, false, '')).status).toBe(400);
    expect(
      (await signed(timestamp, false, createHash('sha256').update(raw).digest('hex'), true)).status,
    ).toBe(201);
    expect((await signed(timestamp)).status).toBe(201);
    expect(await db.execution.count({ where: { workflowId: workflow.id } })).toBe(1);
    const execution = await db.execution.findFirstOrThrow({ where: { workflowId: workflow.id } });
    expect((await waitForExecution(execution.id)).status).toBe('COMPLETED');
  });
});

describe.sequential('Outbox e-mail com transporte de contrato injetado, sem rede', () => {
  async function fixture() {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
    vi.stubEnv('EMAIL_EXTERNAL_ENABLED', 'true');
    const organization = await db.organization.create({ data: { name: 'Contrato outbox Fase5' } });
    const connection = await db.integrationConnection.create({
      data: {
        organizationId: organization.id,
        name: 'Fixture',
        provider: 'RESEND',
        state: 'CONNECTED',
        enabled: true,
        settings: { from: 'team@example.com' },
        credentials: sealSecrets({ apiKey: 'fixture' }),
      },
    });
    const notification = await db.notification.create({
      data: {
        organizationId: organization.id,
        integrationId: connection.id,
        channel: 'EMAIL',
        recipient: 'lead@example.com',
        title: 'Fixture',
        message: 'Fixture',
        payload: {
          from: 'team@example.com',
          to: 'lead@example.com',
          subject: 'Fixture',
          text: 'Fixture',
          connectionRevision: connection.updatedAt.toISOString(),
        },
      },
    });
    return { connection, notification };
  }
  it('workflow persiste outbox transacional e ID do nó antes de qualquer chamada', async () => {
    const { connection, notification } = await fixture();
    await db.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
    const template = createSdrTemplate();
    const action = template.nodes.find((n) => n.type === 'email.send')!;
    const flow: Workflow = {
      ...template,
      nodes: [
        template.nodes[0],
        {
          ...action,
          config: { ...action.config, connectionId: connection.id, subject: 'Olá {{lead.name}}' },
        },
      ],
      edges: [{ id: 'edge', source: 'trigger', target: action.id }],
    };
    const workflow = await db.workflow.create({
      data: { organizationId: connection.organizationId, draft: flow },
    });
    await db.workflowVersion.create({
      data: { organizationId: connection.organizationId, workflowId: workflow.id, number: 1, snapshot: flow },
    });
    const { execution } = await enqueueWorkflowExecution({
      prisma: db,
      organizationId: connection.organizationId,
      workflowId: workflow.id,
      eventKey: randomUUID(),
      leadData: sampleLead,
    });
    expect((await waitForExecution(execution.id)).status).toBe('COMPLETED');
    const outbox = await db.notification.findFirstOrThrow({ where: { executionId: execution.id } });
    expect(outbox.nodeId).toBe(action.id);
    expect(outbox.attempt).toBe(0);
    expect(outbox.providerMessageId).toBeNull();
    expect(outbox.title).toContain(sampleLead.name);
    const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
    await dispatchNextEmail(db, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await db.notification.findUniqueOrThrow({ where: { id: outbox.id } })).status).toBe('PENDING');
  });
  it('duas reservas concorrentes não despacham o mesmo item', async () => {
    const { notification } = await fixture();
    const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
    await Promise.all([dispatchNextEmail(db, transport), dispatchNextEmail(db, transport)]);
    expect(transport).toHaveBeenCalledTimes(1);
    const saved = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(saved.attempt).toBe(1);
    expect(saved.status).toBe('PENDING');
    expect(saved.providerMessageId).toBeTruthy();
    await dispatchNextEmail(db, transport);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('retry mantém a chave idempotente após resposta incerta; autenticação não repete', async () => {
    const { notification } = await fixture();
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new ConnectorError('PROVIDER_REQUEST_UNCERTAIN'))
      .mockResolvedValueOnce({ id: randomUUID() });
    expect((await dispatchNextEmail(db, transport))?.status).toBe('PENDING');
    await db.notification.update({ where: { id: notification.id }, data: { availableAt: new Date(0) } });
    await dispatchNextEmail(db, transport);
    expect(transport.mock.calls[0][2]['Idempotency-Key']).toBe(transport.mock.calls[1][2]['Idempotency-Key']);
    const saved = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(saved.attempt).toBe(2);
    expect(saved.providerMessageId).toBeTruthy();
    const second = await fixture();
    const rejected = vi.fn().mockRejectedValue(new ConnectorError('AUTHENTICATION_FAILED'));
    expect((await dispatchNextEmail(db, rejected))?.status).toBe('FAILED');
    await dispatchNextEmail(db, rejected);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect((await db.notification.findUniqueOrThrow({ where: { id: second.notification.id } })).attempt).toBe(
      1,
    );
  });
  it('recupera lease de e-mail com idempotência e bloqueia despacho de configuração alterada', async () => {
    const { connection, notification } = await fixture();
    await db.notification.update({
      where: { id: notification.id },
      data: {
        status: 'PROCESSING',
        processingAt: new Date(Date.now() - 120000),
        attempt: 1,
        deliveryToken: randomUUID(),
      },
    });
    const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
    await dispatchNextEmail(db, transport);
    expect(transport.mock.calls[0][2]['Idempotency-Key']).toBe(`vexor-email:${notification.id}`);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).attempt).toBe(2);
    const second = await fixture();
    await db.integrationConnection.update({
      where: { id: second.connection.id },
      data: { settings: { from: 'other@example.com' } },
    });
    const saved = await dispatchNextEmail(db, transport);
    expect(saved?.errorCode).toBe('CONNECTION_CHANGED');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(connection.id).not.toBe(second.connection.id);
  });
});
