import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { startDatabase } from './database.mjs';
import {
  localWhatsAppCommit,
  localWhatsAppDirectory,
  localWhatsAppEnvironment,
  loadLocalWhatsAppConfiguration,
  localWhatsAppProcessEnvironment,
} from './lib/local-whatsapp.mjs';

const npmCli =
  process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
async function run(command, args, cwd = localWhatsAppDirectory, env = process.env) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`Instalação WhatsApp falhou (${code}).`)),
    );
  });
}

if (existsSync(resolve('.local/whatsapp-service-quarantined.json')))
  throw new Error(
    'Pareamento suspenso por incidente de conta. O setup não pode reativá-lo durante a investigação.',
  );
mkdirSync(resolve('.local'), { recursive: true });
if (!existsSync(resolve(localWhatsAppDirectory, 'package.json'))) {
  await run(
    'git',
    [
      'clone',
      '--depth',
      '1',
      'https://github.com/evolution-foundation/evolution-api.git',
      localWhatsAppDirectory,
    ],
    process.cwd(),
  );
}
// Pin the upstream runtime; future updates require an explicit compatibility review.
await run('git', ['fetch', '--depth', '1', 'origin', localWhatsAppCommit]);
await run('git', ['checkout', '--detach', localWhatsAppCommit]);
if (!existsSync(localWhatsAppEnvironment)) {
  const password = randomBytes(32).toString('hex');
  const config = {
    EVOLUTION_GATEWAY_URL: 'http://127.0.0.1:8088',
    EVOLUTION_API_KEY: randomBytes(32).toString('hex'),
    EVOLUTION_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    EVOLUTION_DATABASE_URL: `postgresql://vexor_evolution:${password}@127.0.0.1:55432/vexor_evolution?schema=public`,
  };
  writeFileSync(
    localWhatsAppEnvironment,
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600, flag: 'wx' },
  );
}
const config = loadLocalWhatsAppConfiguration();
if (!config) throw new Error('A instalação já utiliza outro gateway. Configuração existente preservada.');
const database = new URL(config.EVOLUTION_DATABASE_URL);
if (
  database.hostname !== '127.0.0.1' ||
  database.port !== '55432' ||
  database.username !== 'vexor_evolution' ||
  database.pathname !== '/vexor_evolution' ||
  !/^[a-f0-9]{64}$/.test(database.password)
)
  throw new Error('Destino PostgreSQL local inválido; nenhuma alteração aplicada.');
await startDatabase();
const adminUrl =
  process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
if (new URL(adminUrl).hostname !== '127.0.0.1') throw new Error('O setup local exige PostgreSQL local.');
const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
try {
  const roles = await admin.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname = 'vexor_evolution'`;
  if (!roles.length) {
    // Password is generated hex, never user input; PostgreSQL role names are fixed.
    await admin.$executeRawUnsafe(
      `CREATE ROLE vexor_evolution LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${database.password}'`,
    );
  }
  const databases = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = 'vexor_evolution'`;
  if (!databases.length)
    await admin.$executeRawUnsafe('CREATE DATABASE vexor_evolution OWNER vexor_evolution');
} finally {
  await admin.$disconnect();
}

if (!process.argv.includes('--dependencies-installed'))
  await run(process.execPath, [npmCli, 'ci', '--no-audit', '--no-fund'], localWhatsAppDirectory, {
    ...process.env,
    HUSKY: '0',
  });

// Upstream listens on all interfaces. The local installation must bind only loopback.
const mainPath = resolve(localWhatsAppDirectory, 'src/main.ts');
const source = readFileSync(mainPath, 'utf8');
const original =
  "server.listen(httpServer.PORT, () => logger.log(httpServer.TYPE.toUpperCase() + ' - ON: ' + httpServer.PORT));";
const restricted =
  "server.listen(httpServer.PORT, '127.0.0.1', () => logger.log(httpServer.TYPE.toUpperCase() + ' - ON: ' + httpServer.PORT));";
if (!source.includes(restricted)) {
  if (!source.includes(original)) throw new Error('Versão do gateway incompatível com bind local.');
  writeFileSync(mainPath, source.replace(original, restricted));
}
// Server-to-server requests have no Origin header; keep browser origins restricted.
const boundSource = readFileSync(mainPath, 'utf8');
const corsAnchor = "const { ORIGIN } = configService.get<Cors>('CORS');";
const nativeCors = 'if (requestOrigin === undefined) return callback(null, true);';
if (!boundSource.includes(nativeCors)) {
  if (!boundSource.includes(corsAnchor)) throw new Error('Versão do gateway incompatível com CORS local.');
  writeFileSync(mainPath, boundSource.replace(corsAnchor, `${corsAnchor}\n        ${nativeCors}`));
}
cpSync(
  resolve(localWhatsAppDirectory, 'prisma/postgresql-migrations'),
  resolve(localWhatsAppDirectory, 'prisma/migrations'),
  { recursive: true },
);
const gatewayEnv = localWhatsAppProcessEnvironment(config);
const prisma = resolve(localWhatsAppDirectory, 'node_modules/prisma/build/index.js');
await run(
  process.execPath,
  [prisma, 'generate', '--schema', 'prisma/postgresql-schema.prisma'],
  localWhatsAppDirectory,
  gatewayEnv,
);
await run(
  process.execPath,
  [prisma, 'migrate', 'deploy', '--schema', 'prisma/postgresql-schema.prisma'],
  localWhatsAppDirectory,
  gatewayEnv,
);
await run(process.execPath, [npmCli, 'run', 'build'], localWhatsAppDirectory, gatewayEnv);
writeFileSync(
  resolve('.local/whatsapp-service-ready.json'),
  JSON.stringify(
    { commit: localWhatsAppCommit, version: '2.3.7', configuredAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log('Serviço WhatsApp instalado. Reinicie npm run dev e solicite o QR no VEXOR.');
