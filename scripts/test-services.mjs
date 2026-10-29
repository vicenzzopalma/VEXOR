import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { configureTestEnvironment } from './test-environment.mjs';

const url = configureTestEnvironment();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
for (const [name, token] of Object.entries(sessions)) process.env[`DEV_${name.toUpperCase()}_TOKEN`] = token;
process.env.CONNECTOR_ENCRYPTION_KEY ??= sessions.connectorKey;
// The gateway confirmation is off in production (the phone confirms); its tests still cover it.
process.env.OPT_OUT_GATEWAY_CONFIRMATION ??= 'true';
process.env.WEBHOOK_SECRET ??= sessions.webhook;
process.env.WEBHOOK_CREDENTIALS_JSON = JSON.stringify({
  'org-local:ingress': sessions.webhook,
  'org-local:signed-ingress': { secret: sessions.webhook, mode: 'hmac' },
});
const mode = process.argv[2];
const children = [];
function run(args, cwd = process.cwd()) {
  const p = spawn(process.execPath, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true });
  children.push(p);
  return p;
}
const finished = (p) =>
  new Promise((resolve, reject) => {
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Command failed: ${code}`))));
  });
const stop = () => {
  for (const p of children)
    if (p.exitCode === null && p.pid) {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else p.kill();
    }
};
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(143);
});
async function ready(address) {
  for (let n = 0; n < 120; n++) {
    try {
      if ((await fetch(address)).ok) return;
    } catch {
      /* server starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Test service unavailable: ${address}`);
}
try {
  // Refuse occupied test ports rather than accidentally talking to an unrelated API.
  for (const port of [4001, ...(mode === 'e2e' ? [3001] : [])]) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      throw new Error(`Test port ${port} is occupied`);
    } catch (error) {
      if (error.message.includes('occupied')) throw error;
    }
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  const dbName = url.pathname.slice(1);
  try {
    const found = await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname=${dbName}`;
    if (!found.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }
  await finished(
    run([
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'packages/database/prisma/schema.prisma',
    ]),
  );
  run(['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts']);
  await ready('http://127.0.0.1:4001/health');
  if (mode === 'e2e') {
    run(
      [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3001'],
      resolve('apps/web'),
    );
    await ready('http://127.0.0.1:3001');
    await finished(run(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)]));
  } else
    await finished(
      run([
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.integration.config.mts',
        ...process.argv.slice(3),
      ]),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stop();
}
