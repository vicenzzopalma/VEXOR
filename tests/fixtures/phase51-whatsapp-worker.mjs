// Local end-to-end contract: authenticated WhatsApp webhook -> durable inbox -> worker -> lead/history.
// Connection state is explicitly synthetic; this does not prove a provider session or send a message.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const db = new PrismaClient();
const apiRoot = 'http://127.0.0.1:4000';
const orgId = 'org-local';
const signingSecret = `phase51-fixture-${randomUUID()}`;
let connection;
let workflow;

async function request(path, method = 'GET', body, auth = sessions.owner) {
  const response = await fetch(`${apiRoot}${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}`, 'x-eimax-client': 'workspace' } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`API ${method} ${path} failed (${response.status})`);
  return data;
}

try {
  const createdConnection = await request('/integrations/whatsapp', 'POST', {
    name: `Phase 5.1 fixture ${randomUUID()}`,
    provider: 'META',
    settings: { phoneNumberId: '1234567890', apiVersion: 'v99.0' },
    credentials: {
      accessToken: 'phase51-fixture-access-token',
      appSecret: signingSecret,
      verifyToken: 'phase51-fixture-verification-token',
    },
  });
  connection = createdConnection;
  assert.equal(connection.configurationRequired, true);
  await db.whatsAppConnection.update({
    where: { id: connection.id },
    data: { state: 'CONNECTED', enabled: true },
  });

  const createdWorkflow = await request('/workflows', 'POST', {
    template: 'sdr',
    name: `Phase 5.1 inbound ${randomUUID()}`,
  });
  workflow = createdWorkflow;
  const draft = JSON.parse(JSON.stringify(workflow.draft));
  const trigger = draft.nodes[0];
  trigger.type = 'whatsapp.message.received';
  trigger.config = { connectionId: connection.id };
  const update = {
    id: 'phase51-update',
    type: 'whatsapp.lead.update',
    name: 'Atualizar empresa pela conversa',
    description: '',
    position: { x: 250, y: 220 },
    config: { field: 'company', value: '{{lead.message}}' },
  };
  const tag = draft.nodes.find((node) => node.type === 'tag.add');
  assert.ok(tag);
  tag.config.tag = 'Phase 5.1 inbound processed';
  draft.nodes = [trigger, update, tag];
  draft.edges = [
    { id: 'phase51-trigger-update', source: trigger.id, target: update.id },
    { id: 'phase51-update-tag', source: update.id, target: tag.id },
  ];
  const saved = await request(`/workflows/${workflow.id}`, 'PATCH', {
    revision: workflow.revision,
    draft,
  });
  const published = await request(`/workflows/${workflow.id}/publish`, 'POST', {
    revision: saved.revision,
  });

  const providerEventId = `phase51-${randomUUID()}`;
  const company = `Inbound ${randomUUID()}`;
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '1234567890' },
              messages: [
                {
                  id: providerEventId,
                  from: '5511999999999',
                  text: { body: company },
                  timestamp: String(Math.floor(Date.now() / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac('sha256', signingSecret).update(raw).digest('hex')}`;
  const webhookHeaders = {
    'Content-Type': 'application/json',
    'x-hub-signature-256': signature,
  };
  const firstResponse = await fetch(`${apiRoot}/webhooks/whatsapp/${connection.id}`, {
    method: 'POST',
    headers: webhookHeaders,
    body: raw,
  });
  assert.equal(firstResponse.status, 201);
  const ingress = await firstResponse.json();
  assert.equal(ingress.accepted, true);
  assert.equal(ingress.persistedEvents, 1);
  const duplicateResponse = await fetch(`${apiRoot}/webhooks/whatsapp/${connection.id}`, {
    method: 'POST',
    headers: webhookHeaders,
    body: raw,
  });
  assert.equal(duplicateResponse.status, 201);

  let lead;
  let execution;
  for (let attempt = 0; attempt < 150; attempt++) {
    lead = await db.lead.findFirst({ where: { organizationId: orgId, workflowId: workflow.id } });
    execution = await db.execution.findFirst({
      where: { organizationId: orgId, workflowId: workflow.id },
      include: { steps: true },
    });
    if (execution?.status === 'COMPLETED' && lead?.company === company) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(lead);
  assert.equal(lead.company, company);
  assert.deepEqual(lead.tags, ['Phase 5.1 inbound processed']);
  assert.ok(execution);
  assert.equal(execution.status, 'COMPLETED');
  assert.equal(execution.versionId, published.id);
  assert.equal(await db.whatsAppEvent.count({ where: { connectionId: connection.id, providerEventId } }), 1);
  assert.equal(
    await db.execution.count({
      where: { workflowId: workflow.id, eventKey: `whatsapp:${connection.id}:${providerEventId}` },
    }),
    1,
  );
  const history = await request(`/leads/${lead.id}`);
  assert.ok(history.executions.some((item) => item.id === execution.id));

  const evidence = {
    generatedAt: new Date().toISOString(),
    evidenceType: 'local-api-postgresql-worker-whatsapp-contract-fixture',
    providerConnection: 'synthetic-CONNECTED-state; not provider-homologated',
    externalProviderRequests: 0,
    externalMessagesSent: 0,
    ingressAuthenticated: true,
    duplicateWebhookAccepted: true,
    inboxEventsForProviderEvent: 1,
    executionsForProviderEvent: 1,
    executionId: execution.id,
    executionStatus: execution.status,
    attempt: execution.attempt,
    versionId: execution.versionId,
    leadId: lead.id,
    leadCompanyUpdated: lead.company === company,
    historyVisible: true,
    steps: execution.steps.length,
  };
  writeFileSync('docs/validation/phase51-whatsapp-worker.json', `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  if (connection?.id) {
    await db.whatsAppConnection.updateMany({
      where: { id: connection.id, organizationId: orgId },
      data: { enabled: false, state: 'DISCONNECTED' },
    });
  }
  await db.$disconnect();
}
