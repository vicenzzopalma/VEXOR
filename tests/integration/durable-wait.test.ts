import 'dotenv/config';
import { afterAll, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { durableFixture } from '../fixtures/durable-flow';
import {
  enqueueWorkflowExecution,
  reserveExecution,
  processReservedExecution,
  resumeDueExecution,
} from '@eimax/workflow-runtime';
import { sampleLead } from '@eimax/workflow-schema';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
afterAll(() => db.$disconnect());

it('API de retomada aplica sessão, RBAC, organização e prazo; não expõe o estado do checkpoint', async () => {
  const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
  const f = await durableFixture(db, 30, 'org-local');
  await processUntil(f.execution.id);
  const request = (id: string, token?: string) =>
    fetch(`http://127.0.0.1:4000/executions/${id}/resume`, {
      method: 'POST',
      headers: { 'x-eimax-client': 'workspace', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  expect((await request(f.execution.id)).status).toBe(401);
  expect((await request(f.execution.id, sessions.viewer)).status).toBe(403);
  expect((await request(f.execution.id, sessions.other)).status).toBe(404);
  const foreign = await durableFixture(db, 30, 'org-other');
  expect((await request(foreign.execution.id, sessions.owner)).status).toBe(404);
  expect((await request(randomUUID(), sessions.owner)).status).toBe(404);
  expect((await request(f.execution.id, sessions.owner)).status).toBe(409);
  const response = await fetch(`http://127.0.0.1:4000/executions/${f.execution.id}`, {
    headers: { Authorization: `Bearer ${sessions.owner}` },
  });
  const detail = await response.json();
  expect(detail.status).toBe('SUSPENDED');
  expect(detail.checkpoints[0]).not.toHaveProperty('state');
  expect(detail.checkpoints[0]).not.toHaveProperty('organizationId');
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, valid: (value: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (valid(value)) return value;
    await pause(100);
  }
  throw new Error('Durable workflow did not reach expected persistent state');
}
async function processUntil(id: string) {
  for (let i = 0; i < 1000; i++) {
    const job = await reserveExecution(db);
    if (!job) throw new Error('Target job unavailable');
    const result = await processReservedExecution(db, job);
    if (job.id === id) return result;
  }
  throw new Error('Too many pending jobs');
}
async function history(id: string) {
  return db.execution.findUniqueOrThrow({
    where: { id },
    include: { steps: true, checkpoints: true, lead: true, notifications: true },
  });
}
function worker() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/durable-worker.ts'], {
    env: { ...process.env, WHATSAPP_EXTERNAL_ENABLED: 'false', EMAIL_EXTERNAL_ENABLED: 'false' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => {
    errors += data.toString();
  });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.once('data', () => resolve());
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code) reject(new Error(`Worker failed: ${errors}`));
    });
  });
  return {
    child,
    ready,
    stop: async () => {
      const done = new Promise((resolve) => child.once('close', resolve));
      child.kill('SIGKILL');
      await done;
    },
  };
}

it('suspende no PostgreSQL e libera lease com etapas anteriores e variáveis persistidas', async () => {
  const f = await durableFixture(db);
  expect((await processUntil(f.execution.id))?.status).toBe('SUSPENDED');
  const row = await history(f.execution.id);
  expect(row.leaseToken).toBeNull();
  expect(row.leaseUntil).toBeNull();
  expect(row.finishedAt).toBeNull();
  expect(row.steps.map((s) => s.nodeId)).toEqual(['n0', 'n1', 'n2']);
  expect(row.checkpoints[0]).toMatchObject({ status: 'WAITING', versionId: f.version.id, nextNodeId: 'n3' });
  expect((row.checkpoints[0].state as any).lead.name).toBe('Lead de teste durável');
  expect(
    await resumeDueExecution(db, { organizationId: f.organization.id, executionId: f.execution.id }),
  ).toBeNull();
});

it('retoma automaticamente após reiniciar o processo do worker durante a espera sem repetir etiqueta', async () => {
  const f = await durableFixture(db, 3);
  const first = worker();
  await first.ready;
  try {
    await until(
      () => history(f.execution.id),
      (r) => r.status === 'SUSPENDED',
    );
  } finally {
    await first.stop();
  }
  const before = await history(f.execution.id);
  const second = worker();
  await second.ready;
  try {
    const result = await until(
      () => history(f.execution.id),
      (r) => r.status === 'COMPLETED',
    );
    expect(result.steps.filter((s) => s.nodeId === 'n1')).toHaveLength(1);
    expect(result.steps.find((s) => s.nodeId === 'n1')!.id).toBe(
      before.steps.find((s) => s.nodeId === 'n1')!.id,
    );
    expect(result.lead?.status).toBe('QUALIFIED');
    expect(result.notifications).toHaveLength(1);
    expect(result.checkpoints[0].resumedAt!.getTime()).toBeGreaterThanOrEqual(
      result.checkpoints[0].resumeAt.getTime(),
    );
  } finally {
    await second.stop();
  }
}, 20000);

it('dois processos de worker retomam uma única vez e preservam versão publicada e arquivamento', async () => {
  const f = await durableFixture(db, 2);
  await processUntil(f.execution.id);
  const changed = structuredClone(f.flow);
  changed.nodes[3].config.team = 'invalid-new-version';
  await db.workflowVersion.create({
    data: { organizationId: f.organization.id, workflowId: f.workflow.id, number: 2, snapshot: changed },
  });
  await db.workflow.update({
    where: { id: f.workflow.id },
    data: { archivedAt: new Date(), draft: changed },
  });
  const a = worker();
  const b = worker();
  await Promise.all([a.ready, b.ready]);
  try {
    const result = await until(
      () => history(f.execution.id),
      (r) => r.status === 'COMPLETED',
    );
    expect(result.versionId).toBe(f.version.id);
    expect(result.steps).toHaveLength(5);
    expect(result.checkpoints).toHaveLength(1);
    expect(result.checkpoints[0].status).toBe('CONSUMED');
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].message).toContain(f.member.displayName);
    expect(
      await resumeDueExecution(db, { organizationId: f.organization.id, executionId: f.execution.id }),
    ).toBeNull();
    expect(await enqueueWorkflowExecution(f.params)).toMatchObject({ idempotentHit: true });
  } finally {
    await Promise.all([a.stop(), b.stop()]);
  }
}, 20000);

it('READY persiste após queda entre enfileirar retomada e reservar; reserva antiga é cercada', async () => {
  const f = await durableFixture(db);
  await processUntil(f.execution.id);
  await pause(1100);
  expect(
    (await resumeDueExecution(db, { organizationId: f.organization.id, executionId: f.execution.id }))
      ?.status,
  ).toBe('QUEUED');
  const a = await reserveExecution(db, 20);
  expect(a?.id).toBe(f.execution.id);
  await pause(40);
  const b = await reserveExecution(db);
  expect(b?.id).toBe(f.execution.id);
  expect(await processReservedExecution(db, a!)).toBeNull();
  expect((await processReservedExecution(db, b!))?.status).toBe('COMPLETED');
  expect((await history(f.execution.id)).steps).toHaveLength(5);
});

it('isola organização e execução inexistente no agendador; FK rejeita checkpoint cruzado', async () => {
  const f = await durableFixture(db);
  await processUntil(f.execution.id);
  await pause(1100);
  const other = await db.organization.create({ data: { name: 'Outra empresa 6A' } });
  expect(await resumeDueExecution(db, { organizationId: other.id, executionId: f.execution.id })).toBeNull();
  expect(
    await resumeDueExecution(db, { organizationId: f.organization.id, executionId: randomUUID() }),
  ).toBeNull();
  await expect(
    db.executionCheckpoint.create({
      data: {
        executionId: f.execution.id,
        organizationId: other.id,
        workflowId: f.workflow.id,
        versionId: f.version.id,
        nodeId: 'n2',
        state: {},
        resumeAt: new Date(),
      },
    }),
  ).rejects.toThrow();
  expect((await history(f.execution.id)).status).toBe('SUSPENDED');
});

it('expiração opcional falha explicitamente sem executar etapas seguintes', async () => {
  const f = await durableFixture(db);
  await processUntil(f.execution.id);
  const checkpoint = (await history(f.execution.id)).checkpoints[0];
  await db.executionCheckpoint.update({
    where: { id: checkpoint.id },
    data: { resumeAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) },
  });
  await resumeDueExecution(db, { organizationId: f.organization.id, executionId: f.execution.id });
  const row = await history(f.execution.id);
  expect(row.status).toBe('FAILED');
  expect(row.errorCode).toBe('WAIT_EXPIRED');
  expect(row.steps).toHaveLength(3);
});

it('falha ao persistir checkpoint desfaz efeitos, etapas e suspensão na mesma transação', async () => {
  const f = await durableFixture(db);
  const fn = `fail_checkpoint_${randomUUID().replaceAll('-', '')}`;
  await db.$executeRawUnsafe(
    `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_id = '${f.execution.id}' THEN RAISE EXCEPTION 'INJECTED_CHECKPOINT_FAILURE'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER ${fn} BEFORE INSERT ON "ExecutionCheckpoint" FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
  );
  try {
    await processUntil(f.execution.id);
    const row = await history(f.execution.id);
    expect(row.status).toBe('FAILED');
    expect(row.errorCode).toBe('CHECKPOINT_PERSISTENCE_FAILURE');
    expect(row.steps).toHaveLength(0);
    expect(row.checkpoints).toHaveLength(0);
    expect(row.lead?.tags).toEqual([]);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "ExecutionCheckpoint"`);
    await db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
  }
});

it('transições inválidas e troca da versão fixada são bloqueadas pelo banco', async () => {
  const f = await durableFixture(db);
  await processUntil(f.execution.id);
  await expect(
    db.execution.update({ where: { id: f.execution.id }, data: { status: 'COMPLETED' } }),
  ).rejects.toThrow();
  await expect(
    db.execution.update({ where: { id: f.execution.id }, data: { versionId: null } }),
  ).rejects.toThrow();
  expect((await history(f.execution.id)).status).toBe('SUSPENDED');
});

it('mais de três esperas consecutivas não esgotam tentativas e preservam variáveis anteriores', async () => {
  const f = await durableFixture(db);
  // A new immutable version places the assignment before four consecutive waits.
  const flow = structuredClone(f.flow);
  flow.nodes = [
    flow.nodes[0],
    flow.nodes[3],
    ...Array.from({ length: 4 }, (_, i) => ({ ...flow.nodes[2], id: `w${i}` })),
    flow.nodes[4],
  ];
  flow.edges = flow.nodes
    .slice(1)
    .map((node, i) => ({ id: `x${i}`, source: flow.nodes[i].id, target: node.id }));
  const version = await db.workflowVersion.create({
    data: { organizationId: f.organization.id, workflowId: f.workflow.id, number: 2, snapshot: flow },
  });
  // Finish the originally queued fixture before exercising the new version.
  await processUntil(f.execution.id);
  const queued = await enqueueWorkflowExecution({
    ...f.params,
    versionId: version.id,
    eventKey: randomUUID(),
    leadData: sampleLead,
  });
  for (let i = 0; i < 4; i++) {
    expect((await processUntil(queued.execution.id))?.status).toBe('SUSPENDED');
    await pause(1100);
    await resumeDueExecution(db, { organizationId: f.organization.id, executionId: queued.execution.id });
  }
  expect((await processUntil(queued.execution.id))?.status).toBe('COMPLETED');
  const row = await history(queued.execution.id);
  expect(row.checkpoints).toHaveLength(4);
  expect(row.steps).toHaveLength(7);
  expect(row.notifications[0].message).toContain(f.member.displayName);
}, 20000);

it('checkpoint READY que vence o prazo na fila falha sem executar as etapas seguintes', async () => {
  const f = await durableFixture(db);
  await processUntil(f.execution.id);
  const checkpoint = (await history(f.execution.id)).checkpoints[0];
  await db.executionCheckpoint.update({
    where: { id: checkpoint.id },
    data: { resumeAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() + 300) },
  });
  expect(
    (await resumeDueExecution(db, { organizationId: f.organization.id, executionId: f.execution.id }))?.status,
  ).toBe('QUEUED');
  await pause(600);
  const job = await reserveExecution(db);
  expect(job?.id).toBe(f.execution.id);
  const result = await processReservedExecution(db, job!);
  expect(result?.status).toBe('FAILED');
  const row = await history(f.execution.id);
  expect(row.errorCode).toBe('WAIT_EXPIRED');
  expect(row.checkpoints[0].status).toBe('EXPIRED');
  expect(row.steps).toHaveLength(3);
});
