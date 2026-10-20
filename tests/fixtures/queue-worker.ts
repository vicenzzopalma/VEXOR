import { PrismaClient } from '@prisma/client';
import { reserveExecution, processReservedExecution } from '@eimax/workflow-runtime';
const db = new PrismaClient();
async function main() {
  if (process.argv.includes('--crash')) {
    const job = await reserveExecution(db, 500);
    if (!job) throw new Error('No job');
    await processReservedExecution(db, job);
    return;
  }
  while (true) {
    const job = await reserveExecution(db);
    if (!job) break;
    const result = await processReservedExecution(db, job);
    if (result) console.log(JSON.stringify({ id: result.id, status: result.status }));
  }
}
main()
  .finally(() => db.$disconnect())
  .catch(() => {
    process.exitCode = 1;
  });
