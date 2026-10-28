import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  runNextExecution,
  dispatchNextWhatsApp,
  dispatchNextEmail,
  dispatchNextOptOut,
  dispatchNextOptOutConfirmation,
  activateOptOutConfirmations,
  processNextWhatsAppEvent,
} from './runner';
export * from './runner';

export async function startWorkerLoop(prisma: PrismaClient, pollIntervalMs = 500) {
  await activateOptOutConfirmations(prisma);
  let running = true;
  // Independent loop: a slow confirmation provider never delays the Esfera outbox.
  const confirmations = (async () => {
    while (running) {
      try {
        await dispatchNextOptOutConfirmation(prisma);
      } catch {
        console.error('Confirmation queue: retry on next poll.');
      }
      if (running) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  })();
  let wake: (() => void) | undefined;
  const done = (async () => {
    while (running) {
      try {
        const incoming = await processNextWhatsAppEvent(prisma);
        const optOut = await dispatchNextOptOut(prisma);
        const result = await runNextExecution(prisma);
        const delivery = await dispatchNextWhatsApp(prisma);
        const email = await dispatchNextEmail(prisma);
        if (incoming || result || delivery || email || optOut) continue;
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
      await confirmations;
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
