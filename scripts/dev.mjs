import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { closeSync, existsSync, openSync } from 'node:fs';
import { startDatabase } from './database.mjs';
import { loadDevelopmentSessions } from './development-sessions.mjs';
import {
  closeQuarantinedInstances,
  loadLocalWhatsAppConfiguration,
  localWhatsAppDirectory,
  localWhatsAppProcessEnvironment,
} from './lib/local-whatsapp.mjs';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
process.env.DEVELOPMENT_WORKSPACE ??= 'true';
loadDevelopmentSessions();
const localWhatsApp = loadLocalWhatsAppConfiguration();
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
async function stop(exitCode = 0, reason = 'desconhecido') {
  if (stopping) return;
  stopping = true;
  console.error(`[dev.mjs] Encerrando serviços (motivo: ${reason}, código: ${exitCode})...`);
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
process.on('SIGINT', () => stop(0, 'SIGINT'));
process.on('SIGTERM', () => stop(0, 'SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[dev.mjs] uncaughtException:', err);
  stop(1, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[dev.mjs] unhandledRejection:', reason);
});
try {
  await finish(
    run('node_modules/typescript/bin/tsc', [
      '-b',
      'packages/workflow-schema',
      'packages/workflow-engine',
      'packages/workflow-runtime',
      'packages/connectors',
    ]),
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
  if (localWhatsApp) {
    const entry = resolve(localWhatsAppDirectory, 'dist/main.js');
    if (!existsSync(entry) || !existsSync(resolve('.local/whatsapp-service-ready.json')))
      throw new Error('Conclua a instalação WhatsApp com npm run whatsapp:setup antes de iniciar.');
    // Fail closed: if quarantined sessions cannot be pinned offline, do not start the gateway.
    const pinned = await closeQuarantinedInstances(localWhatsApp);
    if (pinned) console.log(`Sessões em quarentena mantidas offline: ${pinned}.`);
    const log = openSync(resolve('.local/whatsapp-service.log'), 'a', 0o600);
    const gateway = run(entry, [], {
      cwd: localWhatsAppDirectory,
      env: localWhatsAppProcessEnvironment(localWhatsApp),
      stdio: ['ignore', log, log],
    });
    closeSync(log);
    children.push(gateway);
    gateway.on('error', () => void stop(1, 'Falha ao iniciar serviço WhatsApp local'));
    gateway.on('exit', (code) => {
      if (!stopping)
        void stop(code ?? 1, 'Serviço WhatsApp local encerrou; consulte .local/whatsapp-service.log');
    });
    let available = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${localWhatsApp.EVOLUTION_GATEWAY_URL}/instance/fetchInstances`, {
          headers: { apikey: localWhatsApp.EVOLUTION_API_KEY },
        });
        if (response.ok) {
          available = true;
          break;
        }
      } catch {}
      await new Promise((accept) => setTimeout(accept, 500));
    }
    if (!available)
      throw new Error('Serviço WhatsApp local não iniciou. Consulte .local/whatsapp-service.log.');
    console.log('Serviço WhatsApp local pronto: sessões/QR habilitados, envio externo desativado.');
  }
  const api = run('node_modules/tsx/dist/cli.mjs', [
    '--tsconfig',
    'apps/api/tsconfig.json',
    'apps/api/src/main.ts',
  ]);
  api.on('error', (err) => console.error('[dev.mjs] Erro ao disparar API:', err));
  api.on('exit', (code, signal) => {
    if (!stopping) stop(code ?? 1, `API (NestJS) encerrou com code=${code}, signal=${signal}`);
  });
  children.push(api);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:4000/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!ready) throw new Error('A API não iniciou em 30 segundos. Verifique os logs acima.');
  if (process.env.RUN_WORKER !== 'false') {
    const worker = run('node_modules/tsx/dist/cli.mjs', ['apps/worker/src/index.ts']);
    worker.on('error', (err) => console.error('[dev.mjs] Erro ao disparar Worker:', err));
    worker.on('exit', (code, signal) => {
      if (!stopping) stop(code ?? 1, `Worker encerrou com code=${code}, signal=${signal}`);
    });
    children.push(worker);
  }
  const web = run('node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: resolve('apps/web'),
  });
  web.on('error', (err) => console.error('[dev.mjs] Erro ao disparar Web:', err));
  web.on('exit', (code, signal) => {
    if (!stopping) stop(code ?? 1, `Web (Next.js) encerrou com code=${code}, signal=${signal}`);
  });
  children.push(web);
  console.log('VEXOR: http://localhost:3000 — ambiente local, sem envios externos.');
  await new Promise(() => {});
} catch (error) {
  console.error(error?.message ?? 'Falha ao iniciar o ambiente local. Verifique .local/postgres.log.');
  await stop(1);
}
