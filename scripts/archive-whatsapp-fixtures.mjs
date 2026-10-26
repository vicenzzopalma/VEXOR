import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { isWhatsAppTestFixture } from './lib/whatsapp-fixtures.mjs';
const localUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
);
if (localUrl.hostname !== '127.0.0.1' || localUrl.port !== '55432' || localUrl.pathname !== '/eimax')
  throw new Error('Fixture archival is restricted to the local VEXOR database');
const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
    },
  },
});
try {
  const candidates = await db.whatsAppConnection.findMany({
    where: {
      organizationId: 'org-local',
      enabled: false,
      state: { in: ['DISCONNECTED', 'ERROR'] },
    },
    select: { id: true, name: true, updatedAt: true },
  });
  const fixtures = candidates.filter((row) => isWhatsAppTestFixture(row.name));
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ matchedTestAccounts: fixtures.length, changed: false }));
  } else {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.whatsAppEvent.count({
        where: { connectionId: { in: fixtures.map((row) => row.id) } },
      });
      let archived = 0;
      for (const row of fixtures)
        archived += (
          await tx.whatsAppConnection.updateMany({
            where: {
              id: row.id,
              organizationId: 'org-local',
              enabled: false,
              updatedAt: row.updatedAt,
              state: { in: ['DISCONNECTED', 'ERROR'] },
            },
            data: { state: 'ARCHIVED', checkedAt: new Date() },
          })
        ).count;
      const after = await tx.whatsAppEvent.count({
        where: { connectionId: { in: fixtures.map((row) => row.id) } },
      });
      if (before !== after) throw new Error('Historical event count changed');
      return { archivedTestAccounts: archived, preservedEvents: after, externalCalls: false };
    });
    console.log(JSON.stringify(result));
  }
} finally {
  await db.$disconnect();
}
