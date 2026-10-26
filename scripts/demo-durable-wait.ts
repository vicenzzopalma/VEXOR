import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { durableFixture } from '../tests/fixtures/durable-flow';
import { enqueueWorkflowExecution } from '@eimax/workflow-runtime';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
const children: ReturnType<typeof spawn>[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (id: string) =>
  db.execution.findUniqueOrThrow({
    where: { id },
    include: { steps: { orderBy: { createdAt: 'asc' } }, checkpoints: true, lead: true, notifications: true },
  });
async function until(id: string, status: string) {
  for (let i = 0; i < 600; i++) {
    const row = await read(id);
    if (row.status === status) return row;
    if (row.status === 'FAILED') throw new Error(row.errorCode ?? 'EXECUTION_FAILED');
    await pause(100);
  }
  throw new Error('DEMO_TIMEOUT');
}
function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/worker/src/index.ts'], {
    env: { ...process.env, WHATSAPP_EXTERNAL_ENABLED: 'false', EMAIL_EXTERNAL_ENABLED: 'false' },
    windowsHide: true,
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}
async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.kill('SIGKILL');
  await closed;
}
async function main() {
  const f = await durableFixture(db, 30, 'org-local');
  const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
  const accepted = await fetch(`http://127.0.0.1:4000/workflows/${f.workflow.id}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      Authorization: `Bearer ${sessions.owner}`,
    },
    body: JSON.stringify({ eventKey: f.params.eventKey, lead: f.params.leadData }),
  });
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).id, f.execution.id);
  const first = start();
  const suspended = await until(f.execution.id, 'SUSPENDED');
  assert.equal(suspended.leaseToken, null);
  assert.equal(suspended.leaseUntil, null);
  assert.equal(suspended.steps.length, 3);
  const tagStep = suspended.steps.find((step) => step.nodeType === 'tag.add')!;
  const checkpoint = suspended.checkpoints[0];
  console.log(
    JSON.stringify({ event: 'SUSPENDED', executionId: f.execution.id, resumeAt: checkpoint.resumeAt }),
  );

  const nextFlow = structuredClone(f.flow);
  nextFlow.nodes = nextFlow.nodes.filter((node) => node.type !== 'wait');
  nextFlow.nodes.at(-1)!.config.message = 'Versão nova, somente para a execução de controle.';
  nextFlow.edges = nextFlow.nodes
    .slice(1)
    .map((node, i) => ({ id: `probe${i}`, source: nextFlow.nodes[i].id, target: node.id }));
  const version2 = await db.workflowVersion.create({
    data: { workflowId: f.workflow.id, organizationId: f.organization.id, number: 2, snapshot: nextFlow },
  });
  const probe = await enqueueWorkflowExecution({
    ...f.params,
    eventKey: `${f.params.eventKey}:probe`,
    versionId: version2.id,
  });
  const completedProbe = await until(probe.execution.id, 'COMPLETED');
  assert.equal((await read(f.execution.id)).status, 'SUSPENDED');
  await db.workflow.update({
    where: { id: f.workflow.id },
    data: { archivedAt: new Date(), draft: nextFlow },
  });
  await stop(first);
  const restartedAt = new Date();
  const second = start();
  const completed = await until(f.execution.id, 'COMPLETED');
  assert.equal(completed.versionId, f.version.id);
  assert.equal(completed.lead?.status, 'QUALIFIED');
  assert.equal(completed.steps.length, 5);
  assert.equal(completed.steps.filter((step) => step.nodeType === 'tag.add').length, 1);
  assert.equal(completed.steps.find((step) => step.nodeType === 'tag.add')!.id, tagStep.id);
  assert.deepEqual(completed.lead?.tags, suspended.lead?.tags);
  assert.equal(completed.notifications.length, 1);
  assert.ok(completed.notifications[0].message.includes(f.member.displayName));
  assert.ok(completed.checkpoints[0].resumedAt! >= checkpoint.resumeAt);
  assert.equal(completed.checkpoints[0].status, 'CONSUMED');
  await stop(second);
  const evidence = {
    generatedAt: new Date().toISOString(),
    evidenceType: 'real-worker-restart-local-postgresql',
    externalCalls: false,
    executionId: completed.id,
    workflowId: f.workflow.id,
    versionId: completed.versionId,
    newerVersionId: version2.id,
    suspendedAt: checkpoint.suspendedAt,
    scheduledResumeAt: checkpoint.resumeAt,
    resumedAt: completed.checkpoints[0].resumedAt,
    completedAt: completed.finishedAt,
    restart: { previousPid: first.pid, newPid: second.pid, restartedAt, interruptedDuringWait: true },
    workerReleased: {
      leaseToken: suspended.leaseToken,
      leaseUntil: suspended.leaseUntil,
      controlExecutionId: completedProbe.id,
      controlCompletedAt: completedProbe.finishedAt,
      originalStillSuspended: true,
    },
    originalTagStepId: tagStep.id,
    tagApplications: 1,
    finalLeadStatus: completed.lead?.status,
    originalVersionPreserved: true,
    archivedDuringWait: true,
    notifications: completed.notifications.map((n) => ({ id: n.id, channel: n.channel, status: n.status })),
    steps: completed.steps.map((step) => ({
      id: step.id,
      nodeId: step.nodeId,
      nodeType: step.nodeType,
      name: step.name,
      status: step.status,
      createdAt: step.createdAt,
    })),
    attemptHistory: completed.attemptHistory,
  };
  writeFileSync('docs/validation/phase6a-durable-restart.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    JSON.stringify({
      event: 'COMPLETED',
      executionId: completed.id,
      steps: completed.steps.length,
      tagApplications: 1,
      versionPreserved: true,
      workerRestarted: true,
    }),
  );
}
main()
  .finally(async () => {
    await Promise.all(children.map(stop));
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
