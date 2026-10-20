import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const prisma = new PrismaClient();
async function request(path, role = 'owner', method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      Authorization: `Bearer ${sessions[role]}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function run() {
  const memberId = process.env.DEMO_MEMBERSHIP_ID;
  assert.ok(memberId, 'Defina DEMO_MEMBERSHIP_ID com um responsável explicitamente escolhido.');
  const members = await request('/memberships');
  assert.ok(
    members.data.some((member) => member.id === memberId),
    'Responsável indisponível nesta organização.',
  );
  const created = await request('/workflows', 'owner', 'POST', {
    template: 'sdr',
    name: `Validação operacional local ${Date.now()}`,
  });
  assert.equal(created.status, 201);
  let workflow = created.data;
  workflow.draft.nodes.find((node) => node.type === 'sdr.assign').config.team = `membership:${memberId}`;
  const saved = await request(`/workflows/${workflow.id}`, 'owner', 'PATCH', {
    revision: workflow.revision,
    draft: workflow.draft,
  });
  assert.equal(saved.status, 200);
  workflow = saved.data;
  const published = await request(`/workflows/${workflow.id}/publish`, 'owner', 'POST', {
    revision: workflow.revision,
  });
  assert.equal(published.status, 201);
  const payload = {
    eventKey: `local-verification-${Date.now()}`,
    lead: {
      name: 'Lead de validação local',
      email: 'fixture@example.com',
      company: 'Fixture operacional',
      budget: 1500,
      score: 0,
      source: 'validacao_local',
    },
  };
  const queued = await request(`/workflows/${workflow.id}/execute`, 'owner', 'POST', payload);
  assert.equal(queued.status, 201);
  assert.equal(queued.data.status, 'QUEUED');
  let execution;
  for (let attempt = 0; attempt < 150; attempt++) {
    execution = (await request(`/executions/${queued.data.id}`)).data;
    if (['COMPLETED', 'FAILED'].includes(execution.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(execution.status, 'COMPLETED', 'O worker deve estar ativo; consulte o histórico da execução.');
  const row = await prisma.execution.findUniqueOrThrow({
    where: { id: execution.id },
    include: { lead: true, notifications: true },
  });
  assert.equal(row.versionId, published.data.id);
  assert.equal(row.lead.assignedMembershipId, memberId);
  assert.deepEqual(row.lead.tags, ['Lead qualificado']);
  assert.equal(row.notifications.length, 1);
  assert.equal(row.notifications[0].status, 'AVAILABLE');
  const repeated = await request(`/workflows/${workflow.id}/execute`, 'owner', 'POST', payload);
  assert.equal(repeated.data.id, execution.id);
  assert.equal(repeated.data.idempotentHit, true);
  assert.equal(await prisma.notification.count({ where: { executionId: execution.id } }), 1);
  assert.equal((await request(`/leads/${row.leadId}`, 'other')).status, 404);
  console.log(
    JSON.stringify(
      {
        mode: 'local-postgresql-verification',
        externalMessagesSent: 0,
        executionId: row.id,
        versionId: row.versionId,
        status: row.status,
        attempt: row.attempt,
        notificationStatus: row.notifications[0].status,
        idempotencyVerified: true,
        isolationVerified: true,
      },
      null,
      2,
    ),
  );
}
run()
  .catch(() => {
    console.error('A validação local falhou. Verifique API, worker e DEMO_MEMBERSHIP_ID.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
