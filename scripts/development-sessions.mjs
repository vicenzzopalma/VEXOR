import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function loadDevelopmentSessions() {
  mkdirSync('.local', { recursive: true });
  const path = resolve('.local/development-sessions.json');
  const sessions = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : Object.fromEntries(
        ['owner', 'other', 'editor', 'viewer'].map((name) => [name, randomBytes(32).toString('hex')]),
      );
  sessions.webhook ??= process.env.WEBHOOK_SECRET ?? randomBytes(32).toString('hex');
  sessions.connectorKey ??= process.env.CONNECTOR_ENCRYPTION_KEY ?? randomBytes(32).toString('hex');
  writeFileSync(path, JSON.stringify(sessions), { mode: 0o600 });
  process.env.WEBHOOK_SECRET ??= sessions.webhook;
  process.env.CONNECTOR_ENCRYPTION_KEY ??= sessions.connectorKey;
  process.env.WEBHOOK_CREDENTIALS_JSON ??= JSON.stringify({
    'org-local:ingress': sessions.webhook,
    'org-local:signed-ingress': { secret: sessions.webhook, mode: 'hmac' },
  });
  for (const [name, token] of Object.entries(sessions))
    process.env[`DEV_${name.toUpperCase()}_TOKEN`] = token;
  return sessions;
}
