import { PrismaClient, Prisma } from '@prisma/client';

// The execution row is always locked first, in the same order as the runner.
// A committed READY checkpoint survives a crash before a worker claims the job.
export async function resumeDueExecution(
  prisma: PrismaClient,
  scope?: { organizationId: string; executionId: string },
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e.id FROM "Execution" e JOIN "ExecutionCheckpoint" c ON c.execution_id=e.id
      WHERE e.status='SUSPENDED' AND c.status='WAITING'
        AND c."resumeAt" <= (NOW() AT TIME ZONE 'UTC')
        ${scope ? Prisma.sql`AND e.id=${scope.executionId} AND e.organization_id=${scope.organizationId}` : Prisma.empty}
      ORDER BY c."resumeAt", e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1`);
    if (!rows[0]) return null;
    const checkpoint = await tx.executionCheckpoint.findFirstOrThrow({
      where: { executionId: rows[0].id, status: 'WAITING' },
    });
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT (NOW() AT TIME ZONE 'UTC') AS now`;
    const expired = checkpoint.expiresAt && checkpoint.expiresAt <= now;
    await tx.executionCheckpoint.update({
      where: { id: checkpoint.id, revision: checkpoint.revision },
      data: {
        status: expired ? 'EXPIRED' : 'READY',
        resumedAt: expired ? null : now,
        recoveryError: expired ? 'WAIT_EXPIRED' : null,
        revision: { increment: 1 },
      },
    });
    return tx.execution.update({
      where: { id: rows[0].id, status: 'SUSPENDED' },
      data: {
        status: expired ? 'FAILED' : 'QUEUED',
        availableAt: now,
        segmentAttempt: 0,
        errorCode: expired ? 'WAIT_EXPIRED' : null,
        finishedAt: expired ? now : null,
      },
    });
  });
}
