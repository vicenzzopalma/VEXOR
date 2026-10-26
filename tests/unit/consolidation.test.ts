import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('consolida fontes não rastreados e exclui credenciais, dados, builds e temporários', async () => {
  // @ts-expect-error The consolidation script is a standalone Node module.
  const { collectSourceFiles } = await import('../../scripts/generate-monstro.mjs');
  const root = mkdtempSync(join(tmpdir(), 'vexor-consolidation-'));
  try {
    const paths = [
      'scripts/new.mjs',
      'docs/report.md',
      'tests/integration/new.test.ts',
      'packages/database/prisma/migrations/14/migration.sql',
      '.env',
      '.env.production',
      '.npmrc',
      'apps/web/.env.local',
      'apps/web/credentials.json',
      'apps/web/private/customer.json',
      '.local/state.json',
      'node_modules/pkg/index.js',
      'packages/runtime/dist/index.js',
      'tests/tmp/secret.ts',
      'docs/validation/session.local.json',
      'monstro.txt',
    ];
    for (const path of paths) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), 'fixture');
    }
    expect(collectSourceFiles(root)).toEqual([
      'docs/report.md',
      'packages/database/prisma/migrations/14/migration.sql',
      'scripts/new.mjs',
      'tests/integration/new.test.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
