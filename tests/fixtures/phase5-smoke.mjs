// Local API -> durable queue -> running worker -> PostgreSQL. No external connector action.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sampleLead } from '@eimax/workflow-schema';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const headers = {
  Authorization: `Bearer ${sessions.owner}`,
  'Content-Type': 'application/json',
  'x-eimax-client': 'workspace',
};
async function api(path, method = 'GET', body, customHeaders = headers) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: customHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Local API failed (${response.status})`);
  return response.json();
}
const workflow = await api('/workflows', 'POST', {
  template: 'sdr',
  name: 'Fase 5 · verificação API e worker locais',
});
const draft = workflow.draft;
draft.nodes = [
  { ...draft.nodes[0], type: 'webhook.received', config: { credentialRef: 'ingress' } },
  draft.nodes.find((node) => node.type === 'tag.add'),
];
draft.edges = [{ id: 'smoke-edge', source: draft.nodes[0].id, target: draft.nodes[1].id }];
const saved = await api(`/workflows/${workflow.id}`, 'PATCH', { revision: workflow.revision, draft });
await api(`/workflows/${workflow.id}/publish`, 'POST', { revision: saved.revision });
const eventKey = `phase5-smoke:${randomUUID()}`;
const webhookHeaders = {
  'Content-Type': 'application/json',
  'x-eimax-webhook-secret': sessions.webhook,
  'x-eimax-event-key': eventKey,
};
const queued = await api(`/webhooks/${workflow.id}`, 'POST', sampleLead, webhookHeaders);
const duplicate = await api(`/webhooks/${workflow.id}`, 'POST', sampleLead, webhookHeaders);
if (queued.executionId !== duplicate.executionId) throw new Error('Event was duplicated');
let execution;
for (let attempt = 0; attempt < 100; attempt++) {
  execution = await api(`/executions/${queued.executionId}`);
  if (['COMPLETED', 'FAILED'].includes(execution.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (execution?.status !== 'COMPLETED' || !execution.lead?.tags.includes('Lead qualificado'))
  throw new Error('Local worker did not persist expected effects');
const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
    },
  },
});
try {
  const count = await db.execution.count({ where: { workflowId: workflow.id, eventKey } });
  const persisted = await db.execution.findUniqueOrThrow({ where: { id: queued.executionId } });
  if (count !== 1 || !persisted.versionId || persisted.attempt !== 1)
    throw new Error('Durable execution verification failed');
  const evidence = {
    generatedAt: new Date().toISOString(),
    evidenceType: 'local-api-running-worker-postgresql',
    externalProviderRequests: 0,
    workflowId: workflow.id,
    executionId: persisted.id,
    versionId: persisted.versionId,
    ingressStatus: queued.status,
    finalStatus: persisted.status,
    attempt: persisted.attempt,
    executionsForEvent: count,
    persistedTags: execution.lead.tags,
    steps: execution.steps.length,
  };
  writeFileSync('docs/validation/phase5-worker-pipeline.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await db.$disconnect();
}
