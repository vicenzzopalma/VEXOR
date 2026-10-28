import 'dotenv/config';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sealSecrets } from '@eimax/connectors';
import {
  dispatchNextEmail,
  dispatchNextWhatsApp,
  enqueueWorkflowExecution,
  processNextWhatsAppEvent,
  runNextExecution,
} from '@eimax/workflow-runtime';
import { createSdrTemplate, sampleLead, type Workflow } from '@eimax/workflow-schema';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const { ConnectorError } = createRequire(import.meta.url)('@eimax/connectors');
const ownedJobs: string[] = [];
afterEach(async () => {
  await db.notification.updateMany({
    where: {
      id: { in: ownedJobs.splice(0) },
      providerMessageId: null,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    data: { status: 'FAILED', errorCode: 'TEST_FIXTURE_FINISHED_WITHOUT_EXTERNAL_SEND' },
  });
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
async function emailFixture() {
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  vi.stubEnv('EMAIL_EXTERNAL_ENABLED', 'true');
  const organization = await db.organization.create({ data: { name: 'Phase 5.1 isolated contract' } });
  const connection = await db.integrationConnection.create({
    data: {
      organizationId: organization.id,
      provider: 'RESEND',
      name: 'Fixture, no provider',
      enabled: true,
      state: 'CONNECTED',
      settings: { from: 'team@example.com' },
      credentials: sealSecrets({ apiKey: 'fixture' }),
    },
  });
  const job = await db.notification.create({
    data: {
      organizationId: organization.id,
      integrationId: connection.id,
      channel: 'EMAIL',
      recipient: 'fixture@example.com',
      title: 'Fixture',
      message: 'Fixture',
      payload: {
        from: 'team@example.com',
        to: 'fixture@example.com',
        subject: 'Fixture',
        text: 'Fixture',
        connectionRevision: connection.updatedAt.toISOString(),
      },
    },
  });
  ownedJobs.push(job.id);
  return { connection, job };
}
it('não repete e-mail de resultado incerto após expirar a janela de idempotência', async () => {
  const { job } = await emailFixture();
  await db.notification.update({
    where: { id: job.id },
    data: {
      attempt: 1,
      createdAt: new Date(Date.now() - 25 * 3600000),
      errorCode: 'PROVIDER_REQUEST_UNCERTAIN',
    },
  });
  const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
  const result = await dispatchNextEmail(db, transport);
  expect(transport).not.toHaveBeenCalled();
  expect(result?.status).toBe('FAILED');
  expect(result?.errorCode).toBe('IDEMPOTENCY_WINDOW_EXPIRED_RECONCILIATION_REQUIRED');
});
it('recupera reserva antiga de e-mail sem timestamp de processamento', async () => {
  const { job } = await emailFixture();
  await db.notification.update({
    where: { id: job.id },
    data: { status: 'PROCESSING', processingAt: null, attempt: 1 },
  });
  const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
  const result = await dispatchNextEmail(db, transport);
  expect(result?.id).toBe(job.id);
  expect(result?.attempt).toBe(2);
  expect(result?.providerMessageId).toBeTruthy();
});
async function inboxFixture() {
  const organization = await db.organization.create({ data: { name: 'Phase 5.1 inbox contract' } });
  const connection = await db.whatsAppConnection.create({
    data: {
      organizationId: organization.id,
      provider: 'META',
      name: 'Fixture, no provider',
      enabled: true,
      state: 'CONNECTED',
      settings: { phoneNumberId: '1234', apiVersion: 'v99.0' },
      credentials: 'not-used-no-external-action',
    },
  });
  const template = createSdrTemplate();
  const flow: Workflow = {
    ...template,
    nodes: [
      { ...template.nodes[0], type: 'whatsapp.message.received', config: { connectionId: connection.id } },
      {
        ...template.nodes[1],
        id: 'update',
        type: 'whatsapp.lead.update',
        config: { field: 'company', value: '{{lead.message}}' },
      },
      template.nodes.find((node) => node.type === 'tag.add')!,
    ],
    edges: [
      { id: 'a', source: 'trigger', target: 'update' },
      { id: 'b', source: 'update', target: 'tag' },
    ],
  };
  const workflow = await db.workflow.create({ data: { organizationId: organization.id, draft: flow } });
  const version = await db.workflowVersion.create({
    data: { workflowId: workflow.id, organizationId: organization.id, number: 1, snapshot: flow },
  });
  async function event(text: string, timestamp: number) {
    return db.whatsAppEvent.create({
      data: {
        connectionId: connection.id,
        providerEventId: randomUUID(),
        kind: 'MESSAGE',
        status: 'PENDING',
        routing: [version.id],
        payload: { from: '5511999999999', text, timestamp: String(timestamp) },
      },
    });
  }
  return { organization, connection, workflow, version, event };
}
async function drain() {
  while (await processNextWhatsAppEvent(db)) {
    /* durable local inbox */
  }
  while (await runNextExecution(db)) {
    /* no external nodes */
  }
}
it('mensagem antiga recebida depois não sobrescreve dados mais novos do contato', async () => {
  const fixture = await inboxFixture();
  const now = Math.floor(Date.now() / 1000);
  await fixture.event('Empresa nova', now);
  await drain();
  await fixture.event('Empresa antiga', now - 3600);
  await drain();
  const lead = await db.lead.findFirstOrThrow({ where: { workflowId: fixture.workflow.id } });
  expect(lead.company).toBe('Empresa nova');
  expect(lead.lastInboundAt?.getTime()).toBe(now * 1000);
});
it('mensagem autenticada já persistida continua processável após queda da sessão', async () => {
  const fixture = await inboxFixture();
  const event = await fixture.event('Empresa offline', Math.floor(Date.now() / 1000));
  await db.whatsAppConnection.update({
    where: { id: fixture.connection.id },
    data: { state: 'DISCONNECTED' },
  });
  await drain();
  expect((await db.whatsAppEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('COMPLETED');
  expect((await db.execution.findFirstOrThrow({ where: { workflowId: fixture.workflow.id } })).status).toBe(
    'COMPLETED',
  );
});
it('dois consumidores de inbox preservam 20 mensagens concorrentes do mesmo contato', async () => {
  const fixture = await inboxFixture();
  const now = Math.floor(Date.now() / 1000);
  for (let index = 0; index < 20; index++) await fixture.event(`Empresa ${index}`, now - 20 + index);
  await Promise.all([drain(), drain()]);
  expect(
    await db.whatsAppEvent.count({ where: { connectionId: fixture.connection.id, status: 'COMPLETED' } }),
  ).toBe(20);
  expect(await db.execution.count({ where: { workflowId: fixture.workflow.id, status: 'COMPLETED' } })).toBe(
    20,
  );
  expect(await db.lead.count({ where: { workflowId: fixture.workflow.id } })).toBe(1);
});
it('reconciliação não repete autenticação inválida, mesmo após outro polling', async () => {
  const { job } = await emailFixture();
  const transport = vi.fn().mockRejectedValue(new ConnectorError('AUTHENTICATION_FAILED'));
  await dispatchNextEmail(db, transport);
  await dispatchNextEmail(db, transport);
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await db.notification.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FAILED');
});
async function queuedEmailFixture() {
  const f = await emailFixture();
  await db.notification.update({
    where: { id: f.job.id },
    data: { status: 'FAILED', errorCode: 'FIXTURE_SETUP_ONLY' },
  });
  const template = createSdrTemplate();
  const action = template.nodes.find((node) => node.type === 'email.send')!;
  const flow: Workflow = {
    ...template,
    nodes: [template.nodes[0], { ...action, config: { ...action.config, connectionId: f.connection.id } }],
    edges: [{ id: 'edge', source: 'trigger', target: action.id }],
  };
  const workflow = await db.workflow.create({
    data: { organizationId: f.connection.organizationId, draft: flow },
  });
  await db.workflowVersion.create({
    data: { organizationId: f.connection.organizationId, workflowId: workflow.id, number: 1, snapshot: flow },
  });
  const { execution } = await enqueueWorkflowExecution({
    prisma: db,
    organizationId: f.connection.organizationId,
    workflowId: workflow.id,
    eventKey: randomUUID(),
    leadData: sampleLead,
  });
  await drain();
  expect((await db.execution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('COMPLETED');
  const job = await db.notification.findFirstOrThrow({ where: { executionId: execution.id } });
  ownedJobs.push(job.id);
  return { connection: f.connection, job };
}
it('consulta de estado não invalida e-mail enfileirado, mas troca do remetente invalida', async () => {
  const f = await queuedEmailFixture();
  await db.integrationConnection.update({
    where: { id: f.connection.id },
    data: { state: 'CONNECTED', updatedAt: new Date(f.connection.updatedAt.getTime() + 1000) },
  });
  const transport = vi.fn().mockResolvedValue({ id: randomUUID() });
  expect((await dispatchNextEmail(db, transport))?.providerMessageId).toBeTruthy();
  expect(transport).toHaveBeenCalledTimes(1);
  const changed = await queuedEmailFixture();
  await db.integrationConnection.update({
    where: { id: changed.connection.id },
    data: { settings: { from: 'changed@example.com' } },
  });
  const blocked = vi.fn();
  expect((await dispatchNextEmail(db, blocked))?.errorCode).toBe('CONNECTION_CHANGED');
  expect(blocked).not.toHaveBeenCalled();
});
async function queuedWhatsAppFixture() {
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'true');
  const f = await inboxFixture();
  await db.whatsAppConnection.update({
    where: { id: f.connection.id },
    data: {
      credentials: sealSecrets({ accessToken: 'fixture', appSecret: 'fixture', verifyToken: 'fixture' }),
    },
  });
  const template = createSdrTemplate();
  const action = {
    ...template.nodes[1],
    id: 'whatsapp',
    type: 'whatsapp.text.send' as const,
    config: { connectionId: f.connection.id, text: 'Fixture, no real provider' },
  };
  const flow: Workflow = {
    ...template,
    nodes: [template.nodes[0], action],
    edges: [{ id: 'edge', source: 'trigger', target: action.id }],
  };
  const workflow = await db.workflow.create({ data: { organizationId: f.organization.id, draft: flow } });
  await db.workflowVersion.create({
    data: { organizationId: f.organization.id, workflowId: workflow.id, number: 1, snapshot: flow },
  });
  const { execution } = await enqueueWorkflowExecution({
    prisma: db,
    organizationId: f.organization.id,
    workflowId: workflow.id,
    eventKey: randomUUID(),
    leadData: { ...sampleLead, phone: '5511999999999' },
  });
  await db.lead.update({
    where: { id: execution.leadId! },
    data: { whatsappConsent: true, lastInboundAt: new Date() },
  });
  await drain();
  expect((await db.execution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('COMPLETED');
  const job = await db.notification.findFirstOrThrow({ where: { executionId: execution.id } });
  ownedJobs.push(job.id);
  return { ...f, job };
}
it('trocar a identidade da conta WhatsApp não redireciona uma mensagem já enfileirada', async () => {
  const f = await queuedWhatsAppFixture();
  await db.whatsAppConnection.update({
    where: { id: f.connection.id },
    data: { settings: { phoneNumberId: '5678', apiVersion: 'v99.0' } },
  });
  const transport = vi.fn().mockResolvedValue({ id: '5678', status: 'CONNECTED' });
  const result = await dispatchNextWhatsApp(db, transport);
  expect(result?.id).toBe(f.job.id);
  expect(result?.errorCode).toBe('CONNECTION_CHANGED');
  expect(transport).not.toHaveBeenCalled();
});
it('sessão desconectada observada no despacho atualiza o estado e impede envio', async () => {
  const f = await queuedWhatsAppFixture();
  const transport = vi.fn().mockResolvedValue({ id: '1234', status: 'DISCONNECTED' });
  expect((await dispatchNextWhatsApp(db, transport))?.errorCode).toBe('SESSION_DISCONNECTED');
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await db.whatsAppConnection.findUniqueOrThrow({ where: { id: f.connection.id } })).state).toBe(
    'DISCONNECTED',
  );
});
it('resultado de dispatcher atrasado não regride entrega após recuperar sua reserva', async () => {
  const f = await queuedEmailFixture();
  const providerId = randomUUID();
  let complete: ((value: unknown) => void) | undefined;
  const slow = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const first = dispatchNextEmail(db, slow);
  for (let index = 0; !complete && index < 100; index++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(complete).toBeDefined();
  await db.notification.update({
    where: { id: f.job.id },
    data: { processingAt: new Date(Date.now() - 120000) },
  });
  const fast = vi.fn().mockResolvedValue({ id: providerId });
  await dispatchNextEmail(db, fast);
  await db.notification.update({ where: { id: f.job.id }, data: { status: 'DELIVERED' } });
  complete!({ id: providerId });
  await first;
  expect((await db.notification.findUniqueOrThrow({ where: { id: f.job.id } })).status).toBe('DELIVERED');
  expect(slow.mock.calls[0][2]['Idempotency-Key']).toBe(fast.mock.calls[0][2]['Idempotency-Key']);
});
