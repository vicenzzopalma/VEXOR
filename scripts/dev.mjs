
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { startDatabase } from './database.mjs';
import { loadDevelopmentSessions } from './development-sessions.mjs';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
process.env.DEVELOPMENT_WORKSPACE ??= 'true';
loadDevelopmentSessions();
const children = [];
let pg;
const run = (file, args, options = {}) =>
  spawn(process.execPath, [resolve(file), ...args], {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
    ...options,
  });
const finish = (child) =>
  new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? accept() : reject(new Error(`Comando falhou (${code}).`))));
  });
let stopping = false;
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid)
      await new Promise((ok) => {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('exit', ok);
      });
    else child.kill('SIGTERM');
  }
  if (pg) await pg.stop();
  process.exit(exitCode);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  await finish(
    run('node_modules/typescript/bin/tsc', ['-b', 'packages/workflow-schema', 'packages/workflow-engine']),
  );
  await finish(
    run('node_modules/prisma/build/index.js', [
      'generate',
      '--schema',
      'packages/database/prisma/schema.prisma',
    ]),
  );
  if (process.env.USE_EXTERNAL_DATABASE !== 'true') pg = await startDatabase();
  await finish(
    run('node_modules/prisma/build/index.js', [
      'migrate',
      'deploy',
      '--schema',
      'packages/database/prisma/schema.prisma',
    ]),
  );
  const api = run('node_modules/tsx/dist/cli.mjs', [
    '--tsconfig',
    'apps/api/tsconfig.json',
    'apps/api/src/main.ts',
  ]);
  children.push(api);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:4000/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!ready) throw new Error('A API não iniciou em 15 segundos. Verifique os logs acima.');
  const web = run('node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: resolve('apps/web'),
  });
  children.push(web);
  for (const child of children)
    child.on('exit', (code) => {
      if (!stopping) stop(code ?? 1);
    });
  console.log('EIMAX: http://localhost:3000 — ambiente local, sem envios externos.');
} catch (error) {
  console.error(error?.message ?? 'Falha ao iniciar o ambiente local. Verifique .local/postgres.log.');
  await stop(1);
}
