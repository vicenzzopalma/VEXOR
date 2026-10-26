// One-time conversion: the global marker becomes a per-connection quarantine.
// Accounts that existed during the incident stay isolated; new accounts can pair.
import 'dotenv/config';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { closeQuarantinedInstances, localWhatsAppEnvironment } from './lib/local-whatsapp.mjs';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/eimax')
  throw new Error('Conversão restrita ao banco local do VEXOR.');
const marker = resolve('.local/whatsapp-service-quarantined.json');
if (!existsSync(marker)) {
  console.log(JSON.stringify({ converted: false, reason: 'NO_GLOBAL_MARKER' }));
  process.exit(0);
}
const data = JSON.parse(readFileSync(marker, 'utf8'));
const since = new Date(data.createdAt);
if (!Number.isFinite(since.getTime())) throw new Error('Marcador global sem data válida.');
const apply = process.argv.includes('--apply');
const db = new PrismaClient();
try {
  const affected = await db.whatsAppConnection.findMany({
    where: { provider: 'EVOLUTION', createdAt: { lte: since }, quarantinedAt: null },
    select: { id: true, name: true, state: true },
  });
  if (!apply) {
    console.log(JSON.stringify({ wouldQuarantine: affected.map((r) => ({ name: r.name, state: r.state })) }));
    process.exit(0);
  }
  const quarantined = await db.whatsAppConnection.updateMany({
    where: { id: { in: affected.map((r) => r.id) }, quarantinedAt: null },
    data: {
      quarantinedAt: since,
      quarantineReason: String(data.reason ?? 'GLOBAL_INCIDENT'),
      enabled: false,
    },
  });
  // Nothing may auto-connect when the gateway starts again: close every saved session.
  const config = parse(readFileSync(localWhatsAppEnvironment));
  const closedInstances = await closeQuarantinedInstances(config, { all: true });
  const backup = resolve(`.local/whatsapp-service-quarantined.migrated-${Date.now()}.json`);
  renameSync(marker, backup);
  console.log(
    JSON.stringify({ quarantinedConnections: quarantined.count, closedInstances, markerBackup: backup }),
  );
} finally {
  await db.$disconnect();
}
