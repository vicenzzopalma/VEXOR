// Read-only audit. Private fingerprints stay in ignored .local; no row values or secrets are emitted.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
    },
  },
});
const label = process.argv.find((value) => value.startsWith('--label='))?.slice(8) ?? 'phase52';
if (!/^phase5[12](?:-[a-z0-9]+)*$/.test(label)) throw new Error('Invalid audit label');
try {
  const constraints =
    await db.$queryRaw`SELECT conrelid::regclass::text AS "table", conname AS name, pg_get_constraintdef(oid) AS definition, convalidated AS validated FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' ORDER BY conrelid::regclass::text, conname`;
  const defaults =
    await db.$queryRaw`SELECT table_name AS "table", column_name AS "column", column_default AS "default" FROM information_schema.columns WHERE table_schema='public' AND column_default IS NOT NULL ORDER BY table_name, column_name`;
  const migrations =
    await db.$queryRaw`SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY started_at`;
  const checksums = migrations.map((migration) => ({
    name: migration.name,
    finished: migration.finished,
    rolledBack: migration.rolledBack,
    matchesFile:
      createHash('sha256')
        .update(readFileSync(`packages/database/prisma/migrations/${migration.name}/migration.sql`))
        .digest('hex') === migration.checksum,
  }));
  const tables =
    await db.$queryRaw`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const fingerprints = {};
  for (const { name } of tables) {
    if (!/^[a-zA-Z_]+$/.test(name)) throw new Error('Unexpected table identifier');
    const rows = await db.$queryRawUnsafe(
      `SELECT to_jsonb(t)::text AS value FROM "${name}" t ORDER BY to_jsonb(t)::text COLLATE "C"`,
    );
    const hash = createHash('sha256');
    for (const row of rows) hash.update(`${Buffer.byteLength(row.value)}:${row.value}`);
    fingerprints[name] = { rows: rows.length, hash: hash.digest('hex') };
  }
  mkdirSync('.local', { recursive: true });
  const path = `.local/${label}-data-before.json`;
  let preserved;
  if (process.argv.includes('--snapshot')) writeFileSync(path, JSON.stringify(fingerprints), { mode: 0o600 });
  if (process.argv.includes('--verify-preserved')) {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    preserved = Object.entries(previous).every(
      ([name, value]) => JSON.stringify(value) === JSON.stringify(fingerprints[name]),
    );
    if (!preserved) throw new Error('Data changed since snapshot; investigate before proceeding');
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: process.argv.includes('--snapshot') ? 'before' : 'after',
    preserved,
    tables: Object.fromEntries(Object.entries(fingerprints).map(([name, value]) => [name, value.rows])),
    migrations: checksums,
    constraints,
    defaults,
  };
  const suffix = process.argv.includes('--snapshot')
    ? 'before'
    : process.argv.includes('--verify-preserved')
      ? 'after'
      : 'current';
  writeFileSync(`docs/validation/${label}-database-${suffix}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      tables: tables.length,
      records: Object.values(fingerprints).reduce((sum, table) => sum + table.rows, 0),
      migrations: checksums.length,
      checksumsMatch: checksums.every((row) => row.matchesFile && row.finished && !row.rolledBack),
      preserved,
    }),
  );
} finally {
  await db.$disconnect();
}
