import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const execute = (file, args) =>
  new Promise((accept, reject) => {
    // Ignore inherited pipes: Windows postgres children otherwise keep pg_ctl's pipes open.
    const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`pg_ctl falhou (${code}). Consulte .local/postgres.log.`)),
    );
  });

export async function startDatabase() {
  // Outra instância na mesma máquina (ex.: servidor) usa POSTGRES_PORT e DATABASE_URL próprios.
  const port = Number(process.env.POSTGRES_PORT ?? 55432);
  const databaseDir = resolve('.local/postgres');
  mkdirSync(resolve('.local'), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'eimax',
    password: 'eimax_local_only',
    port,
    persistent: true,
    postgresFlags: ['-h', '127.0.0.1'],
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (message) => {
      if (String(message).includes('FATAL')) console.error('PostgreSQL:', String(message));
    },
  });
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await pg.initialise();
  // pg_ctl drops Windows Administrator privileges for the server process.
  // Direct postgres.exe refuses Administrator; no service/account changes are needed.
  const pgCtl = resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
  if (process.platform === 'win32') {
    let alreadyRunning = false;
    try {
      await execute(pgCtl, ['status', '-D', databaseDir]);
      alreadyRunning = true;
    } catch {}
    if (!alreadyRunning) {
      await execute(pgCtl, [
        'start',
        '-D',
        databaseDir,
        '-l',
        resolve('.local/postgres.log'),
        '-o',
        `-h 127.0.0.1 -p ${port}`,
        '-w',
        '-t',
        '30',
      ]);
    }
  } else await pg.start();
  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname='eimax'");
  if (!result.rows.length) await client.query('CREATE DATABASE eimax');
  await client.end();
  console.log(`PostgreSQL local pronto em 127.0.0.1:${port}.`);
  return {
    stop: async () => {
      if (process.platform === 'win32')
        await execute(pgCtl, ['stop', '-D', databaseDir, '-m', 'fast', '-w', '-t', '30']);
      else await pg.stop();
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pg = await startDatabase();
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 60000);
}
