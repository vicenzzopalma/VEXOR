import 'dotenv/config';
import { afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
afterAll(() => db.$disconnect());
async function archive(id: string, updatedAt: Date, role = 'owner') {
  return fetch(`http://127.0.0.1:4000/integrations/whatsapp/${id}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      ...(role ? { Authorization: `Bearer ${sessions[role]}` } : {}),
    },
    body: JSON.stringify({ expectedUpdatedAt: updatedAt.toISOString() }),
  });
}
it('remove cadastro local sem apagar eventos; preserva RBAC, organização e revisão', async () => {
  const row = await db.whatsAppConnection.create({
    data: {
      organizationId: 'org-local',
      name: 'Verificação de remoção local',
      provider: 'META',
      settings: {},
      enabled: false,
      state: 'DISCONNECTED',
    },
  });
  const event = await db.whatsAppEvent.create({
    data: { connectionId: row.id, providerEventId: randomUUID(), kind: 'STATUS', payload: {} },
  });
  try {
    expect((await archive(row.id, row.updatedAt, '')).status).toBe(401);
    expect((await archive(row.id, row.updatedAt, 'viewer')).status).toBe(403);
    expect((await archive(row.id, row.updatedAt, 'editor')).status).toBe(403);
    expect((await archive(row.id, row.updatedAt, 'other')).status).toBe(404);
    expect((await archive(row.id, new Date(0))).status).toBe(409);
    expect((await archive(row.id, row.updatedAt)).status).toBe(201);
    expect(await db.whatsAppEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
    expect(await db.whatsAppConnection.findUnique({ where: { id: row.id } })).toMatchObject({
      state: 'ARCHIVED',
      enabled: false,
    });
    const response = await fetch('http://127.0.0.1:4000/integrations/whatsapp', {
      headers: { Authorization: `Bearer ${sessions.owner}` },
    });
    expect((await response.json()).some((item: { id: string }) => item.id === row.id)).toBe(false);
    expect((await archive(row.id, row.updatedAt)).status).toBe(404);
    const edit = await fetch(`http://127.0.0.1:4000/integrations/whatsapp/${row.id}/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessions.owner}`, 'x-eimax-client': 'workspace' },
    });
    expect(edit.status).toBe(404);
  } finally {
    await db.whatsAppConnection.update({
      where: { id: row.id },
      data: { state: 'ARCHIVED', enabled: false },
    });
  }
});
it('exige desconexão antes de arquivar uma conta ativa', async () => {
  const row = await db.whatsAppConnection.create({
    data: {
      organizationId: 'org-local',
      name: 'Verificação de guarda de remoção',
      provider: 'META',
      settings: {},
      enabled: true,
      state: 'CONNECTED',
    },
  });
  try {
    expect((await archive(row.id, row.updatedAt)).status).toBe(409);
  } finally {
    await db.whatsAppConnection.update({
      where: { id: row.id },
      data: { state: 'ARCHIVED', enabled: false },
    });
  }
});
