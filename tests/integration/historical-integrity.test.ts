import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { createSdrTemplate, sampleLead } from '@eimax/workflow-schema';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
afterAll(() => db.$disconnect());

const rollback = new Error('ROLLBACK_OWN_TEST_FIXTURES');

describe('Fase 5.2 — Integridade Histórica e Preservação de Versões', () => {
  async function createFixtures(tx: Prisma.TransactionClient) {
    const suffix = randomUUID();
    const orgA = await tx.organization.create({ data: { name: `Tenant A ${suffix}` } });
    const orgB = await tx.organization.create({ data: { name: `Tenant B ${suffix}` } });

    const flowA = await tx.workflow.create({
      data: {
        organizationId: orgA.id,
        draft: createSdrTemplate() as unknown as Prisma.InputJsonValue,
      },
    });

    const flowB = await tx.workflow.create({
      data: {
        organizationId: orgB.id,
        draft: createSdrTemplate() as unknown as Prisma.InputJsonValue,
      },
    });

    const versionA = await tx.workflowVersion.create({
      data: {
        organizationId: orgA.id,
        workflowId: flowA.id,
        number: 1,
        snapshot: createSdrTemplate() as unknown as Prisma.InputJsonValue,
      },
    });

    const leadA = await tx.lead.create({
      data: {
        organizationId: orgA.id,
        workflowId: flowA.id,
        eventKey: `event-${suffix}`,
        ...sampleLead,
        data: sampleLead,
      },
    });

    const executionA = await tx.execution.create({
      data: {
        organizationId: orgA.id,
        workflowId: flowA.id,
        versionId: versionA.id,
        leadId: leadA.id,
        eventKey: `exec-${suffix}`,
        status: 'COMPLETED',
      },
    });

    return { orgA, orgB, flowA, flowB, versionA, leadA, executionA };
  }

  it('1. UPDATE de versão publicada é bloqueado por gatilho SQL no PostgreSQL', async () => {
    let updateBlocked = false;
    let errorMessage = '';

    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        await tx.$executeRawUnsafe('SAVEPOINT test_sp_update');
        try {
          await tx.$executeRawUnsafe(
            `UPDATE "WorkflowVersion" SET "snapshot" = '{"hacked": true}'::jsonb WHERE "id" = $1`,
            f.versionA.id,
          );
        } catch (error: any) {
          updateBlocked = true;
          errorMessage = error?.message ?? '';
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT test_sp_update');
        }

        const currentVersion = await tx.workflowVersion.findUniqueOrThrow({
          where: { id: f.versionA.id },
        });
        expect((currentVersion.snapshot as any).name).toBe('Qualificação de leads');

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(updateBlocked).toBe(true);
    expect(errorMessage).toContain('Published workflow versions are immutable and cannot be updated');
  });

  it('2. DELETE de versão publicada é bloqueado por gatilho SQL no PostgreSQL', async () => {
    let deleteBlocked = false;
    let errorMessage = '';

    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        await tx.$executeRawUnsafe('SAVEPOINT test_sp_delete');
        try {
          await tx.$executeRawUnsafe(
            `DELETE FROM "WorkflowVersion" WHERE "id" = $1`,
            f.versionA.id,
          );
        } catch (error: any) {
          deleteBlocked = true;
          errorMessage = error?.message ?? '';
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT test_sp_delete');
        }

        const versionStillExists = await tx.workflowVersion.findUnique({
          where: { id: f.versionA.id },
        });
        expect(versionStillExists).not.toBeNull();
        expect(versionStillExists?.id).toBe(f.versionA.id);

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(deleteBlocked).toBe(true);
    expect(errorMessage).toContain('Published workflow versions are immutable and cannot be deleted');
  });

  it('3. Exclusão do workflow pai não apaga versões publicadas (bloqueio por RESTRICT e trigger)', async () => {
    let parentDeleteBlocked = false;
    let errorMessage = '';

    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        await tx.$executeRawUnsafe('SAVEPOINT test_sp_parent');
        try {
          await tx.$executeRawUnsafe(
            `DELETE FROM "Workflow" WHERE "id" = $1`,
            f.flowA.id,
          );
        } catch (error: any) {
          parentDeleteBlocked = true;
          errorMessage = error?.message ?? '';
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT test_sp_parent');
        }

        const preservedVersion = await tx.workflowVersion.findUnique({
          where: { id: f.versionA.id },
        });
        expect(preservedVersion).not.toBeNull();
        expect(preservedVersion?.workflowId).toBe(f.flowA.id);

        const preservedFlow = await tx.workflow.findUnique({
          where: { id: f.flowA.id },
        });
        expect(preservedFlow).not.toBeNull();

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(parentDeleteBlocked).toBe(true);
    expect(
      errorMessage.includes('Workflows with published versions cannot be deleted') ||
      errorMessage.includes('WorkflowVersion_workflowId_organization_id_fkey') ||
      errorMessage.includes('violates foreign key constraint')
    ).toBe(true);
  });

  it('4. Tentativas de TRUNCATE não apagam histórico protegido', async () => {
    let truncateVersionBlocked = false;
    let truncateWorkflowBlocked = false;

    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        // 4a. TRUNCATE direto na tabela WorkflowVersion (com CASCADE para testar o gatilho)
        // Flush phase 6A deferred execution checks so this case reaches the historical guard itself.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        await tx.$executeRawUnsafe('SAVEPOINT sp_trunc_v');
        try {
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "WorkflowVersion" CASCADE`);
        } catch (error: any) {
          truncateVersionBlocked = true;
          expect(error.message).toContain('Published workflow versions cannot be truncated');
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_trunc_v');
        }

        // 4b. TRUNCATE na tabela Workflow CASCADE
        await tx.$executeRawUnsafe('SAVEPOINT sp_trunc_w');
        try {
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "Workflow" CASCADE`);
        } catch (error: any) {
          truncateWorkflowBlocked = true;
          expect(
            error.message.includes('Workflows table cannot be truncated while published versions exist') ||
            error.message.includes('Published workflow versions cannot be truncated')
          ).toBe(true);
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_trunc_w');
        }

        const version = await tx.workflowVersion.findUnique({ where: { id: f.versionA.id } });
        expect(version).not.toBeNull();

        const flow = await tx.workflow.findUnique({ where: { id: f.flowA.id } });
        expect(flow).not.toBeNull();

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(truncateVersionBlocked).toBe(true);
    expect(truncateWorkflowBlocked).toBe(true);
  });

  it('5. Arquivamento lógico preserva a versão e todos os seus relacionamentos', async () => {
    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        // Arquivamento lógico: atualiza archivedAt sem remover dados
        const now = new Date();
        const archived = await tx.workflow.update({
          where: { id: f.flowA.id },
          data: { archivedAt: now },
        });

        expect(archived.archivedAt).not.toBeNull();
        expect(new Date(archived.archivedAt!).getTime()).toBeCloseTo(now.getTime(), -3);

        // Versão publicada continua preservada e acessível
        const version = await tx.workflowVersion.findUniqueOrThrow({
          where: { id: f.versionA.id },
        });
        expect(version.workflowId).toBe(f.flowA.id);

        // Execuções históricas continuam vinculadas à versão e ao workflow
        const execution = await tx.execution.findUniqueOrThrow({
          where: { id: f.executionA.id },
          include: { version: true, workflow: true, lead: true },
        });
        expect(execution.versionId).toBe(f.versionA.id);
        expect(execution.workflowId).toBe(f.flowA.id);
        expect(execution.workflow.archivedAt).not.toBeNull();
        expect(execution.leadId).toBe(f.leadA.id);

        // Desarquivamento lógico
        const unarchived = await tx.workflow.update({
          where: { id: f.flowA.id },
          data: { archivedAt: null },
        });
        expect(unarchived.archivedAt).toBeNull();

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('6. Dois tenants continuam isolados em dados, versões e arquivamento', async () => {
    let crossTenantBlocked = false;

    await db
      .$transaction(async (tx) => {
        const f = await createFixtures(tx);

        const flowsA = await tx.workflow.findMany({
          where: { organizationId: f.orgA.id },
        });
        expect(flowsA.map((w) => w.id)).toContain(f.flowA.id);
        expect(flowsA.map((w) => w.id)).not.toContain(f.flowB.id);

        const flowsB = await tx.workflow.findMany({
          where: { organizationId: f.orgB.id },
        });
        expect(flowsB.map((w) => w.id)).toContain(f.flowB.id);
        expect(flowsB.map((w) => w.id)).not.toContain(f.flowA.id);

        await tx.$executeRawUnsafe('SAVEPOINT sp_tenant');
        try {
          await tx.execution.create({
            data: {
              organizationId: f.orgB.id,
              workflowId: f.flowB.id,
              versionId: f.versionA.id, // Versão do Tenant A!
              eventKey: `cross-tenant-${randomUUID()}`,
            },
          });
        } catch {
          crossTenantBlocked = true;
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_tenant');
        }

        await tx.workflow.update({
          where: { id: f.flowA.id },
          data: { archivedAt: new Date() },
        });

        const checkFlowB = await tx.workflow.findUniqueOrThrow({
          where: { id: f.flowB.id },
        });
        expect(checkFlowB.archivedAt).toBeNull();

        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });

    expect(crossTenantBlocked).toBe(true);
  });

  it('7. Replay completo de migrações aplica o schema atual sem diff em banco isolado', async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/verify-migration-replay.mjs', '--label=phase52'], {
        env: process.env,
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve(output) : reject(new Error(`Migration replay failed with code ${code}`)),
      );
    });

    const parsed = JSON.parse(output.trim());
    expect(parsed).toMatchObject({
      database: 'eimax_phase52_migration_replay',
      migrations: 20,
      schemaDiffEmpty: true,
      applicationDatabaseReset: false,
    });
  });
});
