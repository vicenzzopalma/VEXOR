import 'dotenv/config';
import { afterAll, expect, it } from 'vitest';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createSdrTemplate, sampleLead } from '@eimax/workflow-schema';
import { spawn } from 'node:child_process';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
afterAll(() => db.$disconnect());
const rollback = new Error('ROLLBACK_OWN_TEST_FIXTURES');
it('histórico completo de migrações reproduz schema e guardas em banco isolado', async () => {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-migration-replay.mjs'], {
      env: process.env,
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error('Migration replay failed'))));
  });
  expect(JSON.parse(output.trim())).toMatchObject({
    migrations: 13,
    schemaDiffEmpty: true,
    applicationDatabaseReset: false,
  });
});
async function fixtures(tx: Prisma.TransactionClient) {
  const a = await tx.organization.create({ data: { name: 'Integrity rollback A' } });
  const b = await tx.organization.create({ data: { name: 'Integrity rollback B' } });
  const wa = await tx.workflow.create({ data: { organizationId: a.id, draft: createSdrTemplate() } });
  const wb = await tx.workflow.create({ data: { organizationId: b.id, draft: createSdrTemplate() } });
  const wc = await tx.workflow.create({ data: { organizationId: a.id, draft: createSdrTemplate() } });
  const la = await tx.lead.create({
    data: { organizationId: a.id, workflowId: wa.id, eventKey: 'fixture', ...sampleLead, data: sampleLead },
  });
  const lb = await tx.lead.create({
    data: { organizationId: b.id, workflowId: wb.id, eventKey: 'fixture', ...sampleLead, data: sampleLead },
  });
  const vb = await tx.workflowVersion.create({
    data: { organizationId: a.id, workflowId: wc.id, number: 1, snapshot: createSdrTemplate() },
  });
  const eb = await tx.execution.create({
    data: { organizationId: b.id, workflowId: wb.id, leadId: lb.id, eventKey: 'fixture' },
  });
  const member = await tx.membership.create({
    data: { organizationId: b.id, displayName: 'Fixture', role: 'editor' },
  });
  return { a, b, wa, wb, wc, la, lb, vb, eb, member };
}
const cases = [
  'assignment',
  'execution-lead',
  'execution-version',
  'notification-lead',
  'notification-execution',
  'tenant-move',
  'lead-workflow-move',
] as const;
it.each(cases)('PostgreSQL rejeita vínculo inválido: %s, sem persistir fixtures', async (kind) => {
  let rejected = false;
  await db
    .$transaction(async (tx) => {
      const f = await fixtures(tx);
      try {
        if (kind === 'assignment')
          await tx.lead.update({ where: { id: f.la.id }, data: { assignedMembershipId: f.member.id } });
        if (kind === 'execution-lead')
          await tx.execution.create({
            data: { organizationId: f.a.id, workflowId: f.wa.id, leadId: f.lb.id, eventKey: 'invalid' },
          });
        if (kind === 'execution-version')
          await tx.execution.create({
            data: { organizationId: f.a.id, workflowId: f.wa.id, versionId: f.vb.id, eventKey: 'invalid' },
          });
        if (kind === 'notification-lead')
          await tx.notification.create({
            data: {
              organizationId: f.a.id,
              leadId: f.lb.id,
              channel: 'INTERNAL',
              recipient: 'fixture',
              title: 'fixture',
              message: '',
            },
          });
        if (kind === 'notification-execution')
          await tx.notification.create({
            data: {
              organizationId: f.a.id,
              executionId: f.eb.id,
              channel: 'INTERNAL',
              recipient: 'fixture',
              title: 'fixture',
              message: '',
            },
          });
        if (kind === 'tenant-move')
          await tx.membership.update({ where: { id: f.member.id }, data: { organizationId: f.a.id } });
        if (kind === 'lead-workflow-move')
          await tx.lead.update({ where: { id: f.la.id }, data: { workflowId: f.wc.id } });
      } catch {
        rejected = true;
      }
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });
  expect(rejected).toBe(true);
});
it('canal não tem default implícito e a FK de conta continua composta e validada', async () => {
  const columns = await db.$queryRaw<
    Array<{ column_default: string | null }>
  >`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='Notification' AND column_name='channel'`;
  expect(columns[0].column_default).toBeNull();
  const foreignKeys = await db.$queryRaw<
    Array<{ conname: string; convalidated: boolean; columns: number }>
  >`SELECT conname, convalidated, cardinality(conkey)::int AS columns FROM pg_constraint WHERE conrelid='"Notification"'::regclass AND contype='f' AND conname IN ('Notification_connectionId_fkey','Notification_connection_tenant_fkey')`;
  expect(foreignKeys).toEqual([
    { conname: 'Notification_connection_tenant_fkey', convalidated: true, columns: 2 },
  ]);
});
it('novas guardas preservam SET NULL dos vínculos e os registros relacionados', async () => {
  await db
    .$transaction(async (tx) => {
      const f = await fixtures(tx);
      await tx.lead.update({ where: { id: f.lb.id }, data: { assignedMembershipId: f.member.id } });
      const notification = await tx.notification.create({
        data: {
          organizationId: f.b.id,
          leadId: f.lb.id,
          executionId: f.eb.id,
          channel: 'INTERNAL',
          recipient: 'fixture',
          title: 'fixture',
          message: '',
        },
      });
      await tx.membership.delete({ where: { id: f.member.id } });
      expect((await tx.lead.findUniqueOrThrow({ where: { id: f.lb.id } })).assignedMembershipId).toBeNull();
      await tx.lead.delete({ where: { id: f.lb.id } });
      expect((await tx.execution.findUniqueOrThrow({ where: { id: f.eb.id } })).leadId).toBeNull();
      expect((await tx.notification.findUniqueOrThrow({ where: { id: notification.id } })).leadId).toBeNull();
      await tx.execution.delete({ where: { id: f.eb.id } });
      expect(
        (await tx.notification.findUniqueOrThrow({ where: { id: notification.id } })).executionId,
      ).toBeNull();
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });
});
