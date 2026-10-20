import 'dotenv/config';
import { PrismaClient, ExecutionStatus } from '@prisma/client';
import { processWorkflowExecution } from './runner';

export * from './runner';

export async function startWorkerLoop(prisma: PrismaClient, pollIntervalMs = 2000) {
  let isRunning = true;
  console.log('Worker iniciado. Aguardando execuções enfileiradas...');

  const loop = async () => {
    while (isRunning) {
      try {
        const queued = await prisma.execution.findFirst({
          where: { status: ExecutionStatus.QUEUED },
          include: { lead: true },
          orderBy: { createdAt: 'asc' },
        });

        if (queued && queued.lead) {
          console.log(`Processando execução enfileirada: ${queued.id} (${queued.eventKey})`);
          await processWorkflowExecution({
            prisma,
            organizationId: queued.organizationId,
            workflowId: queued.workflowId,
            eventKey: queued.eventKey,
            leadData: queued.lead.data,
            versionId: queued.versionId ?? undefined,
          });
        }
      } catch (err: any) {
        console.error('Erro no loop do worker:', err?.message);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  };

  loop();

  return {
    stop: () => {
      isRunning = false;
    },
  };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  startWorkerLoop(prisma).catch((err) => {
    console.error('Falha fatal no worker:', err);
    process.exit(1);
  });
}
