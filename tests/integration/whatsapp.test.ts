import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSdrTemplate, sampleLead, type Workflow } from '@eimax/workflow-schema';
import {
  dispatchNextWhatsApp,
  enqueueWorkflowExecution,
  processNextWhatsAppEvent,
} from '@eimax/workflow-runtime';
import { waitForExecution } from './helpers';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const fixtureSecret = 'contract-fixture-app-secret-not-a-provider-credential';
let connection: any;
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
function signed(body: unknown, valid = true) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac('sha256', valid ? fixtureSecret : 'invalid')
    .update(raw)
    .digest('hex')}`;
  return fetch(`http://127.0.0.1:4000/webhooks/whatsapp/${connection.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
    body: raw,
  });
}
function meta(value: unknown) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234' }, ...(value as object) } }] }],
  };
}
beforeAll(async () => {
  const result = await request('/integrations/whatsapp', 'owner', 'POST', {
    name: `Fixture de contrato · sem envio externo ${randomUUID()}`,
    provider: 'META',
    settings: { phoneNumberId: '1234', apiVersion: 'v99.0' },
    credentials: {
      accessToken: 'fixture-access-token',
      appSecret: fixtureSecret,
      verifyToken: 'fixture-verification-token',
    },
  });
  expect(result.status).toBe(201);
  connection = result.data;
});
afterAll(async () => {
  if (connection?.id)
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { state: 'ARCHIVED', enabled: false },
    });
  await db.$disconnect();
});
describe.sequential('WhatsApp: contratos persistentes, sem provedor ou entrega real', () => {
  it('criptografa credenciais, mascara respostas e aplica RBAC e organização', async () => {
    expect(connection.configurationRequired).toBe(true);
    expect(connection.state).toBe('DISCONNECTED');
    expect(JSON.stringify(connection)).not.toContain('fixture-access-token');
    expect(connection.credentials).toBeUndefined();
    const stored = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(stored.credentials).toBeTruthy();
    expect(stored.credentials).not.toContain(fixtureSecret);
    await expect(
      db.notification.create({
        data: {
          organizationId: 'org-other',
          connectionId: connection.id,
          channel: 'WHATSAPP',
          recipient: 'fixture',
          title: 'Invalid cross-tenant fixture',
          message: '',
        },
      }),
    ).rejects.toThrow();
    expect(
      (await request('/integrations/whatsapp', 'other')).data.some((c: any) => c.id === connection.id),
    ).toBe(false);
    expect(
      (
        await request(`/integrations/whatsapp/${connection.id}`, 'other', 'PATCH', {
          name: 'invadir',
          provider: 'META',
          settings: {},
        })
      ).status,
    ).toBe(404);
    expect((await request('/integrations/whatsapp', 'viewer', 'POST', {})).status).toBe(403);
    expect((await request(`/integrations/whatsapp/${connection.id}/connect`, 'owner', 'POST')).status).toBe(
      400,
    );
    expect((await db.whatsAppConnection.findUniqueOrThrow({ where: { id: connection.id } })).state).toBe(
      'DISCONNECTED',
    );
  });
  it('valida assinatura e handshake e não regride recibos fora de ordem', async () => {
    const wrong = await fetch(
      `http://127.0.0.1:4000/webhooks/whatsapp/${connection.id}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42`,
    );
    expect(wrong.status).toBe(401);
    const valid = await fetch(
      `http://127.0.0.1:4000/webhooks/whatsapp/${connection.id}?hub.mode=subscribe&hub.verify_token=fixture-verification-token&hub.challenge=42`,
    );
    expect(await valid.text()).toBe('42');
    const notification = await db.notification.create({
      data: {
        organizationId: 'org-local',
        connectionId: connection.id,
        providerMessageId: 'receipt-fixture',
        channel: 'WHATSAPP',
        recipient: 'fixture',
        title: 'Fixture de recibo · sem envio externo',
        message: '',
        status: 'PENDING',
      },
    });
    expect(
      (await signed(meta({ statuses: [{ id: 'receipt-fixture', status: 'read' }] }), false)).status,
    ).toBe(401);
    for (const status of ['read', 'delivered', 'sent', 'read'])
      expect((await signed(meta({ statuses: [{ id: 'receipt-fixture', status }] }))).status).toBe(201);
    expect((await signed(meta({ statuses: [{ id: 'receipt-failed-fixture', status: 'failed' }] }))).status).toBe(201);
    await dispatchNextWhatsApp(db);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).status).toBe('READ');
    expect(
      await db.whatsAppEvent.count({
        where: { connectionId: connection.id, providerEventId: 'receipt-fixture' },
      }),
    ).toBe(3);
    expect(
      await db.whatsAppEvent.count({
        where: { connectionId: connection.id, providerEventId: 'receipt-failed-fixture', kind: 'FAILED' },
      }),
    ).toBe(1);
  });
  it('bloqueia publicação com conta desconectada e evento de conversa não suportado', async () => {
    const flow = createSdrTemplate();
    flow.nodes[0] = {
      ...flow.nodes[0],
      type: 'whatsapp.message.received',
      config: { connectionId: connection.id },
    };
    const row = await db.workflow.create({ data: { organizationId: 'org-local', draft: flow } });
    expect((await request(`/workflows/${row.id}/publish`, 'owner', 'POST', { revision: 1 })).status).toBe(
      400,
    );
  });
  it('mensagens de fixture autenticadas geram jobs idempotentes e reutilizam o lead', async () => {
    // Synthetic session state exercises ingress contracts; it is never evidence of a provider connection.
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { state: 'CONNECTED', enabled: true },
    });
    try {
      const template = createSdrTemplate();
      const flow: Workflow = {
        ...template,
        name: 'Fixture inbound · sem provedor',
        nodes: [
          {
            ...template.nodes[0],
            type: 'whatsapp.message.received',
            config: { connectionId: connection.id },
          },
          {
            ...template.nodes[1],
            id: 'conversation-update',
            type: 'whatsapp.lead.update',
            config: { field: 'company', value: '{{lead.message}}' },
          },
          template.nodes.find((n) => n.type === 'tag.add')!,
        ],
        edges: [
          { id: 'edge', source: 'trigger', target: 'conversation-update' },
          { id: 'edge-update', source: 'conversation-update', target: 'tag' },
        ],
      };
      const workflow = await db.workflow.create({ data: { organizationId: 'org-local', draft: flow } });
      await db.workflowVersion.create({
        data: { organizationId: 'org-local', workflowId: workflow.id, number: 1, snapshot: flow },
      });
      for (const id of ['inbound-fixture-1', 'inbound-fixture-1', 'inbound-fixture-2'])
        expect(
          (
            await signed(
              meta({
                messages: [
                  {
                    id,
                    from: '5511999999999',
                    text: { body: `${id} & Empresa` },
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              }),
            )
          ).status,
        ).toBe(201);
      const accepted = await db.whatsAppEvent.findMany({
        where: { connectionId: connection.id, kind: 'MESSAGE' },
      });
      expect(accepted).toHaveLength(2);
      expect(accepted.every((event) => Array.isArray(event.routing) && event.routing.length === 1)).toBe(
        true,
      );
      const changed = structuredClone(flow);
      changed.nodes.find((n) => n.type === 'tag.add')!.config.tag = 'Novo snapshot';
      await db.workflowVersion.create({
        data: { organizationId: 'org-local', workflowId: workflow.id, number: 2, snapshot: changed },
      });
      while (await processNextWhatsAppEvent(db)) {
        /* drain durable fixture inbox */
      }
      await expect
        .poll(
          async () => {
            await processNextWhatsAppEvent(db);
            return db.execution.count({ where: { workflowId: workflow.id } });
          },
          { timeout: 5000, interval: 50 },
        )
        .toBe(2);
      const executions = await db.execution.findMany({ where: { workflowId: workflow.id } });
      expect(executions).toHaveLength(2);
      const version = await db.workflowVersion.findFirstOrThrow({
        where: { workflowId: workflow.id, number: 1 },
      });
      expect(executions.every((execution) => execution.versionId === version.id)).toBe(true);
      expect(new Set(executions.map((execution) => (execution.eventData as any).message)).size).toBe(2);
      expect(new Set(executions.map((e) => e.leadId)).size).toBe(1);
      for (const execution of executions)
        expect((await waitForExecution(execution.id)).status).toBe('COMPLETED');
      const lead = await db.lead.findFirstOrThrow({ where: { workflowId: workflow.id } });
      expect(lead.whatsappConsent).toBe(false);
      expect(lead.phone).toBe('5511999999999');
      expect(lead.company).toBe('inbound-fixture-2 & Empresa');
      expect(lead.tags).toEqual(['Lead qualificado']);
      const history = await request(`/leads/${lead.id}`);
      expect(history.data.conversation).toHaveLength(2);
      expect((await request(`/leads/${lead.id}`, 'other')).status).toBe(404);
    } finally {
      await db.whatsAppConnection.update({
        where: { id: connection.id },
        data: { state: 'DISCONNECTED', enabled: false },
      });
    }
  });
  it('outbox mantém aceitação PENDING com ID sem reenviar e falha reservas abandonadas', async () => {
    const accepted = await db.notification.create({
      data: {
        organizationId: 'org-local',
        connectionId: connection.id,
        providerMessageId: 'accepted-fixture',
        channel: 'WHATSAPP',
        recipient: 'fixture',
        title: 'Fixture · sem envio externo',
        message: '',
        status: 'PENDING',
      },
    });
    const abandoned = await db.notification.create({
      data: {
        organizationId: 'org-local',
        connectionId: connection.id,
        channel: 'WHATSAPP',
        recipient: 'fixture',
        title: 'Fixture · sem envio externo',
        message: '',
        status: 'PROCESSING',
        processingAt: new Date(Date.now() - 120000),
      },
    });
    await dispatchNextWhatsApp(db);
    expect((await db.notification.findUniqueOrThrow({ where: { id: accepted.id } })).attempt).toBe(0);
    expect((await db.notification.findUniqueOrThrow({ where: { id: abandoned.id } })).errorCode).toBe(
      'DELIVERY_UNKNOWN_RECONCILIATION_REQUIRED',
    );
  });
  it('bloco nativo exige consentimento e cria outbox transacional; sem provedor não alega envio', async () => {
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { state: 'CONNECTED', enabled: true },
    });
    try {
      const template = createSdrTemplate();
      const flow: Workflow = {
        ...template,
        name: 'Fixture outbox · sem provedor',
        nodes: [
          template.nodes[0],
          {
            ...template.nodes[2],
            id: 'whatsapp',
            type: 'whatsapp.text.send',
            config: { connectionId: connection.id, text: 'Fixture de contrato' },
          },
        ],
        edges: [{ id: 'edge', source: 'trigger', target: 'whatsapp' }],
      };
      const workflow = await db.workflow.create({ data: { organizationId: 'org-local', draft: flow } });
      await db.workflowVersion.create({
        data: { organizationId: 'org-local', workflowId: workflow.id, number: 1, snapshot: flow },
      });
      const params = {
        prisma: db,
        organizationId: 'org-local',
        workflowId: workflow.id,
        eventKey: 'without-consent',
        leadData: { ...sampleLead, phone: '+5511999999999' },
      };
      const blocked = await enqueueWorkflowExecution(params);
      expect((await waitForExecution(blocked.execution.id)).status).toBe('FAILED');
      const permitted = await enqueueWorkflowExecution({ ...params, eventKey: 'with-consent' });
      await db.lead.update({
        where: { id: permitted.execution.leadId! },
        data: { whatsappConsent: true, lastInboundAt: new Date() },
      });
      expect((await waitForExecution(permitted.execution.id)).status).toBe('COMPLETED');
      const outbox = await db.notification.findFirstOrThrow({
        where: { executionId: permitted.execution.id },
      });
      expect(['PENDING', 'FAILED']).toContain(outbox.status);
      await dispatchNextWhatsApp(db);
      expect((await db.notification.findUniqueOrThrow({ where: { id: outbox.id } })).errorCode).toBe(
        'CONFIGURATION_REQUIRED',
      );
    } finally {
      await db.whatsAppConnection.update({
        where: { id: connection.id },
        data: { state: 'DISCONNECTED', enabled: false },
      });
    }
  });
  it('quarentena bloqueia operacoes ativas para provedor Evolution e mantem estado seguro', async () => {
    const evoResult = await request('/integrations/whatsapp/managed', 'owner', 'POST', {
      name: `Fixture Evolution Quarentena ${randomUUID()}`,
    });
    expect(evoResult.status).toBe(201);
    const evoConn = evoResult.data;
    try {
      await db.whatsAppConnection.update({
        where: { id: evoConn.id },
        data: { quarantinedAt: new Date(), quarantineReason: 'PROVIDER_STATUS_403' },
      });
      for (const op of ['connect', 'reconnect', 'refresh', 'create-instance']) {
        const res = await request(`/integrations/whatsapp/${evoConn.id}/${op}`, 'owner', 'POST');
        expect(res.status).toBe(409);
        expect(res.data.message).toMatch(/Esta conta está em quarentena/);
      }
      const disc = await request(`/integrations/whatsapp/${evoConn.id}/disconnect`, 'owner', 'POST');
      expect(disc.status).toBe(201);
      expect(disc.data.state).toBe('DISCONNECTED');
      const stored = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: evoConn.id } });
      expect(stored.state).toBe('DISCONNECTED');
      expect(stored.enabled).toBe(false);
    } finally {
      await db.whatsAppConnection.update({
        where: { id: evoConn.id },
        data: { state: 'ARCHIVED', enabled: false },
      });
    }
  });
  it('recusa criacao de instancia para conexao Meta de imediato', async () => {
    const res = await request(`/integrations/whatsapp/${connection.id}/create-instance`, 'owner', 'POST');
    expect(res.status).toBe(400);
    expect(res.data.message).toBe('Esta conta não suporta criação de instâncias.');
  });
});
