import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSdrTemplate, sampleLead, type Workflow } from '@eimax/workflow-schema';
import {
  enqueueWorkflowExecution,
  reserveExecution,
  processReservedExecution,
} from '@eimax/workflow-runtime';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
function evidence(name: string, value: unknown) {
  mkdirSync('docs/validation', { recursive: true });
  writeFileSync(
    `docs/validation/${name}.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), evidenceType: 'local-postgresql-test', result: value },
      null,
      2,
    ),
  );
}
afterAll(() => db.$disconnect());
async function setup(type: 'tag.add' | 'email.send' = 'tag.add') {
  const organization = await db.organization.create({ data: { name: 'Queue verification' } });
  const template = createSdrTemplate();
  const action = template.nodes.find((n) => n.type === type)!;
  const flow: Workflow = {
    ...template,
    nodes: [template.nodes[0], action],
    edges: [{ id: 'edge', source: template.nodes[0].id, target: action.id }],
  };
  const workflow = await db.workflow.create({ data: { organizationId: organization.id, draft: flow } });
  const version = await db.workflowVersion.create({
    data: { workflowId: workflow.id, organizationId: organization.id, number: 1, snapshot: flow },
  });
  const params = {
    prisma: db,
    organizationId: organization.id,
    workflowId: workflow.id,
    eventKey: randomUUID(),
    leadData: sampleLead,
  };
  return { params, version };
}
function worker(crash = false) {
  const child = spawn(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'tests/fixtures/queue-worker.ts', ...(crash ? ['--crash'] : [])],
    { env: process.env, windowsHide: true },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  const done = new Promise<string>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(output) : reject(new Error(`Worker exit ${code}`))));
  });
  return { child, done, output: () => output };
}
describe.sequential('Fila PostgreSQL real', () => {
  it('webhook autenticado repetido usa snapshot publicado e cria um único job', async () => {
    const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
    const flow = createSdrTemplate();
    flow.nodes = [
      { ...flow.nodes[0], type: 'webhook.received', config: { credentialRef: 'ingress' } },
      flow.nodes.find((n) => n.type === 'tag.add')!,
    ];
    flow.edges = [{ id: 'edge', source: 'trigger', target: 'tag' }];
    const workflow = await db.workflow.create({ data: { organizationId: 'org-local', draft: flow } });
    await db.workflowVersion.create({
      data: { organizationId: 'org-local', workflowId: workflow.id, number: 1, snapshot: flow },
    });
    // A changed draft cannot change ingress authentication or the executed snapshot.
    await db.workflow.update({ where: { id: workflow.id }, data: { draft: createSdrTemplate() } });
    const send = (secret: string) =>
      fetch(`http://127.0.0.1:4000/webhooks/${workflow.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-eimax-webhook-secret': secret,
          'x-eimax-event-key': 'repeated',
        },
        body: JSON.stringify(sampleLead),
      });
    expect((await send('ingress')).status).toBe(401);
    const responses = await Promise.all(Array.from({ length: 5 }, () => send(sessions.webhook)));
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(results.map((r) => r.executionId)).size).toBe(1);
    expect(results.every((r) => r.status === 'QUEUED')).toBe(true);
    const foreign = await db.workflow.create({ data: { organizationId: 'org-other', draft: flow } });
    await db.workflowVersion.create({
      data: { organizationId: 'org-other', workflowId: foreign.id, number: 1, snapshot: flow },
    });
    const rejected = await fetch(`http://127.0.0.1:4000/webhooks/${foreign.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-eimax-webhook-secret': sessions.webhook },
      body: JSON.stringify(sampleLead),
    });
    expect(rejected.status).toBe(401);
    expect(await db.execution.count({ where: { workflowId: foreign.id } })).toBe(0);
    await worker().done;
    const history = await fetch(`http://127.0.0.1:4000/executions/${results[0].executionId}`, {
      headers: { Authorization: `Bearer ${sessions.owner}` },
    });
    expect((await history.json()).status).toBe('COMPLETED');
  });
  it('dois processos disputam 20 jobs sem duplicação; versão e tenant ficam fixados', async () => {
    const a = await setup();
    const b = await setup();
    const jobs = [];
    for (let i = 0; i < 20; i++)
      jobs.push(
        (await enqueueWorkflowExecution({ ...(i % 2 ? a.params : b.params), eventKey: `job-${i}` }))
          .execution,
      );
    const [outA, outB] = await Promise.all([worker().done, worker().done]);
    expect(outA.trim().length).toBeGreaterThan(0);
    expect(outB.trim().length).toBeGreaterThan(0);
    const ids = (outA + outB)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id);
    expect(ids.length).toBe(20);
    expect(new Set(ids).size).toBe(20);
    const persisted = await db.execution.findMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      include: { lead: true, steps: true },
    });
    for (const row of persisted) {
      expect(row.status).toBe('COMPLETED');
      expect(row.attempt).toBe(1);
      expect(row.versionId).toBe(
        row.organizationId === a.params.organizationId ? a.version.id : b.version.id,
      );
      expect(row.lead!.organizationId).toBe(row.organizationId);
      expect(row.lead!.tags).toEqual(['Lead qualificado']);
      expect(row.steps.length).toBe(2);
    }
    evidence('queue-concurrency', {
      workers: [outA.trim().split('\n').length, outB.trim().split('\n').length],
      total: persisted.length,
      unique: new Set(ids).size,
      executions: persisted.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        versionId: row.versionId,
        status: row.status,
        attempt: row.attempt,
        steps: row.steps.length,
      })),
    });
  });
  it('recupera reserva após matar processo com efeitos ainda não commitados', async () => {
    const { params } = await setup();
    const { execution } = await enqueueWorkflowExecution(params);
    const suffix = randomUUID().replaceAll('-', '');
    const sequence = `queue_crash_${suffix}`;
    const fn = `queue_crash_fn_${suffix}`;
    const trigger = `queue_crash_trigger_${suffix}`;
    try {
      await db.$executeRawUnsafe(`CREATE SEQUENCE "${sequence}"`);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_id = '${execution.id}' AND nextval('"${sequence}"') = 1 THEN PERFORM pg_sleep(15); END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT ON "ExecutionStep" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      const crashed = worker(true);
      const closed = crashed.done.catch(() => 'interrupted');
      let entered = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.$queryRawUnsafe<Array<{ is_called: boolean }>>(
          `SELECT is_called FROM "${sequence}"`,
        );
        if (rows[0].is_called) {
          entered = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(entered).toBe(true);
      // Kill the real processor while its local effects await commit, then restart it.
      if (process.platform === 'win32')
        await new Promise<void>((resolve) => {
          const killer = spawn('taskkill', ['/PID', String(crashed.child.pid), '/T', '/F'], {
            windowsHide: true,
          });
          killer.on('close', () => resolve());
        });
      else crashed.child.kill('SIGKILL');
      await closed;
      // pg_sleep notices the closed socket when it returns; wait for the server rollback.
      for (let i = 0; i < 180; i++) {
        const reservation = await reserveExecution(db);
        if (reservation) {
          await processReservedExecution(db, reservation);
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      const row = await db.execution.findUniqueOrThrow({
        where: { id: execution.id },
        include: { lead: true, steps: true },
      });
      expect(row.status).toBe('COMPLETED');
      expect(row.attempt).toBe(2);
      expect(row.lead!.tags).toEqual(['Lead qualificado']);
      expect(row.steps.length).toBe(2);
      expect((row.attemptHistory as any[]).map((a) => a.status)).toEqual(['ABANDONED', 'COMPLETED']);
      evidence('queue-recovery', {
        executionId: row.id,
        status: row.status,
        attempt: row.attempt,
        attemptHistory: row.attemptHistory,
        steps: row.steps.length,
        tags: row.lead!.tags,
      });
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "ExecutionStep"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
      await db.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${sequence}"`);
    }
  });
  it('deduplica 20 eventos concorrentes e recusa reprocessar reserva antiga', async () => {
    const { params } = await setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => enqueueWorkflowExecution(params)));
    expect(new Set(results.map((r) => r.execution.id)).size).toBe(1);
    expect(results.filter((r) => !r.idempotentHit).length).toBe(1);
    const job = await reserveExecution(db);
    expect(job).toBeTruthy();
    await processReservedExecution(db, job!);
    expect(await processReservedExecution(db, job!)).toBeNull();
    expect(await db.lead.count({ where: { organizationId: params.organizationId } })).toBe(1);
  });
  it('ação externa sem provedor falha sem entrega fictícia nem retry cego', async () => {
    const { params } = await setup('email.send');
    const { execution } = await enqueueWorkflowExecution(params);
    await worker().done;
    const row = await db.execution.findUniqueOrThrow({
      where: { id: execution.id },
      include: { notifications: true },
    });
    expect(row.status).toBe('FAILED');
    expect(row.attempt).toBe(1);
    expect(row.notifications.map((n) => n.status)).toEqual(['FAILED']);
    await enqueueWorkflowExecution(params);
    await worker().done;
    expect(await db.notification.count({ where: { executionId: row.id } })).toBe(1);
  });
  it('retry de erro transitório PostgreSQL desfaz os efeitos antes de tentar novamente', async () => {
    const { params } = await setup();
    const { execution } = await enqueueWorkflowExecution(params);
    const suffix = randomUUID().replaceAll('-', '');
    const sequence = `queue_retry_${suffix}`;
    const fn = `queue_retry_fn_${suffix}`;
    const trigger = `queue_retry_trigger_${suffix}`;
    try {
      await db.$executeRawUnsafe(`CREATE SEQUENCE "${sequence}"`);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_id = '${execution.id}' AND nextval('"${sequence}"') = 1 THEN RAISE EXCEPTION 'transient fixture' USING ERRCODE='40001'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT ON "ExecutionStep" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      await worker().done;
      const rolledBack = await db.execution.findUniqueOrThrow({
        where: { id: execution.id },
        include: { lead: true, steps: true },
      });
      expect(rolledBack.status).toBe('QUEUED');
      expect(rolledBack.steps).toHaveLength(0);
      expect(rolledBack.lead!.tags).toEqual([]);
      await new Promise((r) => setTimeout(r, 2200));
      await worker().done;
      const completed = await db.execution.findUniqueOrThrow({
        where: { id: execution.id },
        include: { lead: true },
      });
      expect(completed.status).toBe('COMPLETED');
      expect(completed.attempt).toBe(2);
      expect(completed.lead!.tags).toEqual(['Lead qualificado']);
      evidence('queue-retry', {
        executionId: completed.id,
        rolledBack: {
          status: rolledBack.status,
          steps: rolledBack.steps.length,
          tags: rolledBack.lead!.tags,
        },
        recovered: { status: completed.status, attempt: completed.attempt, tags: completed.lead!.tags },
      });
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "ExecutionStep"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
      await db.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${sequence}"`);
    }
  });
});
