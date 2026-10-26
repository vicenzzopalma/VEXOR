import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connection } from 'next/server';
import { WhatsAppClientPage } from '@/components/whatsapp-connection-actions';

// The quarantine marker lives at the repository root; next dev runs from apps/web.
function quarantined() {
  return ['.local', '../../.local'].some((dir) =>
    existsSync(/*turbopackIgnore: true*/ resolve(process.cwd(), dir, 'whatsapp-service-quarantined.json')),
  );
}

export default async function WhatsAppPage() {
  // Read the marker per request, never at build time.
  await connection();
  return <WhatsAppClientPage initialQuarantined={quarantined()} />;
}
