import { PrismaClient } from '@prisma/client';
import { startWorkerLoop } from '../../apps/worker/src/index';
const db = new PrismaClient();
void startWorkerLoop(db, 100).then((worker) => {
  console.log(JSON.stringify({ event: 'WORKER_STARTED', pid: process.pid }));
  process.once('SIGTERM', () => {
    void worker.stop().then(() => db.$disconnect());
  });
  process.once('SIGINT', () => {
    void worker.stop().then(() => db.$disconnect());
  });
});
