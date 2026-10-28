import { configureTestEnvironment } from './test-environment.mjs';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

configureTestEnvironment();
const url = new URL(
  process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
);
console.log(JSON.stringify({ host: url.hostname, port: url.port, database: url.pathname }));
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
try {
  const migrations =
    await db.$queryRaw`SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY migration_name`;
  const verified = migrations.map(({ checksum, ...row }) => ({
    ...row,
    matchesFile:
      checksum ===
      createHash('sha256')
        .update(readFileSync(`packages/database/prisma/migrations/${row.name}/migration.sql`))
        .digest('hex'),
  }));
  assert.ok(verified.some((row) => row.name === '202610200013_phase52_historical_integrity'));
  assert.ok(verified.every((row) => row.finished && !row.rolledBack && row.matchesFile));
  console.log(JSON.stringify(verified, null, 2));
} finally {
  await db.$disconnect();
}
