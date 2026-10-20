import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runNextExecution, dispatchNextWhatsApp } from './runner';
export * from './runner';

export async function startWorkerLoop(prisma: PrismaClient, pollIntervalMs = 500) {
  let running = true;
  let wake: (() => void) | undefined;
  const done = (async () => {
    while (running) {
      try {
        const result = await runNextExecution(prisma);
        const delivery = await dispatchNextWhatsApp(prisma);
        if (result || delivery) continue;
      } catch {
        console.error('Worker: falha de banco; a reserva será recuperada pelo lease.');
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollIntervalMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  })();
  return {
    stop: async () => {
      running = false;
      wake?.();
      await done;
    },
  };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  startWorkerLoop(prisma)
    .then((worker) => {
      const stop = async () => {
        await worker.stop();
        await prisma.$disconnect();
      };
      process.once('SIGINT', () => {
        void stop();
      });
      process.once('SIGTERM', () => {
        void stop();
      });
    })
    .catch(async () => {
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}
