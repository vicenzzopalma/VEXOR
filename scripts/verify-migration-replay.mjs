import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const url = new URL(
  process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
);
if (url.hostname !== '127.0.0.1' || url.port !== '55432')
  throw new Error('Migration replay is restricted to the local test database');
const label = process.argv.find((v) => v.startsWith('--label='))?.slice(8) ?? 'phase52';
const name = `eimax_${label}_migration_replay`;
const marker = `VEXOR ${label} isolated migration replay; no application data`;
const admin = new PrismaClient({ datasources: { db: { url: url.href } } });
try {
  const existing =
    await admin.$queryRaw`SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname=${name}`;
  if (!existing.length) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    await admin.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
  } else if (existing[0].comment !== marker) throw new Error('Refusing to use an unmarked database');
} finally {
  await admin.$disconnect();
}
url.pathname = `/${name}`;
async function prisma(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
      env: { ...process.env, DATABASE_URL: url.href },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
}
const schema = 'packages/database/prisma/schema.prisma';
if ((await prisma(['migrate', 'deploy', '--schema', schema])).code !== 0)
  throw new Error('Isolated migration replay failed');
const diff = await prisma([
  'migrate',
  'diff',
  '--from-schema-datasource',
  schema,
  '--to-schema-datamodel',
  schema,
  '--exit-code',
]);
if (diff.code !== 0) throw new Error('Replay database differs from Prisma schema');
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
try {
  const migrations =
    await db.$queryRaw`SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  const triggers =
    await db.$queryRaw`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('"Lead"'::regclass,'"Execution"'::regclass,'"Notification"'::regclass,'"Membership"'::regclass,'"WorkflowVersion"'::regclass,'"Workflow"'::regclass) ORDER BY tgname`;
  const evidence = {
    generatedAt: new Date().toISOString(),
    evidenceType: 'isolated-local-migration-replay',
    database: name,
    reset: false,
    schemaDiffEmpty: true,
    migrations,
    triggers,
  };
  writeFileSync(`docs/validation/${label}-migration-replay.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    JSON.stringify({
      database: name,
      migrations: migrations.length,
      schemaDiffEmpty: true,
      applicationDatabaseReset: false,
    }),
  );
} finally {
  await db.$disconnect();
}
