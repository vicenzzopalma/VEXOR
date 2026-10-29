import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { OnboardingPlan } from '@eimax/workflow-schema';
import {
  executeOnboardingPlan,
  openSecrets,
  provisioningClientsFromEnv,
  sealSecrets,
  type ProvisioningClients,
  type Secrets,
} from '@eimax/connectors';

/** Um plano leva poucos minutos; após o lease a solicitação volta à fila (tarefas são idempotentes). */
export const PROVISIONING_LEASE_MS = 15 * 60000;

export async function dispatchNextProvisioning(
  db: PrismaClient,
  deps: { clients?: ProvisioningClients; env?: Record<string, string | undefined> } = {},
) {
  const env = deps.env ?? process.env;
  // Fail closed: sem habilitação explícita no servidor, aprovações aguardam sem tocar cPanel/Tarifando.
  if (env.TI_PROVISIONING_ENABLED !== 'true') return null;
  await db.provisioningRequest.updateMany({
    where: { status: 'PROCESSING', processingAt: { lt: new Date(Date.now() - PROVISIONING_LEASE_MS) } },
    data: { status: 'APPROVED', processingToken: null, errorCode: 'RECOVERED_AFTER_LEASE' },
  });
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "ProvisioningRequest" WHERE "status"='APPROVED' AND "attempt" < 3 ORDER BY "decidedAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    return tx.provisioningRequest.update({
      where: { id: rows[0].id },
      data: {
        status: 'PROCESSING',
        processingToken: randomUUID(),
        processingAt: new Date(),
        attempt: { increment: 1 },
      },
    });
  });
  if (!job) return null;
  const owned = { id: job.id, status: 'PROCESSING', processingToken: job.processingToken };
  try {
    const clients = deps.clients ?? provisioningClientsFromEnv(env);
    const run = await executeOnboardingPlan(job.plan as unknown as OnboardingPlan, clients, {
      emailPasswordTemplate: env.TI_EMAIL_PASSWORD_TEMPLATE,
    });
    // Keep passwords from earlier attempts: a retry only adds what it created now.
    const previous = job.secrets ? (openSecrets(job.secrets) as Record<string, string>) : {};
    const secrets = { ...previous, ...run.secrets };
    const failed = run.outcomes.some((o) => o.status === 'falhou');
    await db.provisioningRequest.updateMany({
      where: owned,
      data: {
        status: failed ? 'PARTIAL' : 'COMPLETED',
        result: { outcomes: run.outcomes } as unknown as Prisma.InputJsonValue,
        secrets: Object.keys(secrets).length ? sealSecrets(secrets as Secrets) : null,
        errorCode: failed ? 'SOME_TASKS_FAILED' : null,
        processingToken: null,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await db.provisioningRequest.updateMany({
      where: owned,
      data: {
        status: 'FAILED',
        errorCode: (error instanceof Error ? error.message : 'PROVISIONING_FAILED').slice(0, 300),
        processingToken: null,
        finishedAt: new Date(),
      },
    });
  }
  return db.provisioningRequest.findUniqueOrThrow({ where: { id: job.id } });
}
