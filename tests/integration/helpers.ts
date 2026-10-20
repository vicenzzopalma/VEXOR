import { PrismaClient } from '@prisma/client';
import { runNextExecution } from '@eimax/workflow-runtime';
export async function waitForExecution(id: string) {
  const db = new PrismaClient({
    datasources: {
      db: {
        url:
          process.env.DATABASE_URL ??
          'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
      },
    },
  });
  try {
    for (let i = 0; i < 100; i++) {
      const row = await db.execution.findUniqueOrThrow({ where: { id }, include: { steps: true } });
      if (['COMPLETED', 'FAILED'].includes(row.status)) return row;
      await runNextExecution(db);
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Execution did not finish');
  } finally {
    await db.$disconnect();
  }
}
