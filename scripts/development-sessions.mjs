
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
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(sessions), { mode: 0o600 });
  for (const [name, token] of Object.entries(sessions))
    process.env[`DEV_${name.toUpperCase()}_TOKEN`] = token;
  return sessions;
}
