import 'dotenv/config';
import { afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { managedEvolutionInstance } from '@eimax/connectors';
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const created: string[] = [];
afterAll(async () => {
  await db.whatsAppConnection.updateMany({
    where: { id: { in: created } },
    data: { state: 'ARCHIVED', enabled: false },
  });
  await db.$disconnect();
});
async function request(path: string, body: unknown, role = 'owner', method = 'POST') {
  const response = await fetch(`http://127.0.0.1:4000/integrations/whatsapp${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      Authorization: `Bearer ${sessions[role]}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
it('cadastro recebe somente nome; namespace e infraestrutura não vêm do cliente', async () => {
  const a = await request('/managed', { name: 'Celular de teste gerenciado' });
  expect(a.status).toBe(201);
  created.push(a.data.id);
  expect(a.data).toMatchObject({ managed: true, settings: {}, state: 'DISCONNECTED' });
  expect(a.data).not.toHaveProperty('credentials');
  const row = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: a.data.id } });
  expect(row.settings).toEqual({ managed: true, instance: managedEvolutionInstance('org-local', row.id) });
  expect(row.credentials).toBeNull();
  expect((await request('/managed', { name: 'Invalid', organizationId: 'org-other' })).status).toBe(400);
  expect(
    (await request('/managed', { name: 'Invalid', settings: { instance: 'another-tenant' } })).status,
  ).toBe(400);
  expect((await request('/managed', { name: 'Invalid' }, 'editor')).status).toBe(403);
  const b = await request('/managed', { name: 'Celular de teste gerenciado' }, 'other');
  expect(b.status).toBe(201);
  created.push(b.data.id);
  const other = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: b.data.id } });
  expect(other.organizationId).toBe('org-other');
  expect(other.settings).not.toEqual(row.settings);
});
it('renomear não permite trocar instância/empresa e usa revisão otimista', async () => {
  const a = await request('/managed', { name: 'Teste de escopo gerenciado' });
  expect(a.status).toBe(201);
  created.push(a.data.id);
  const body = { name: 'Nome alterado', expectedUpdatedAt: a.data.updatedAt };
  expect((await request(`/${a.data.id}/managed`, body, 'other', 'PATCH')).status).toBe(404);
  expect(
    (
      await request(
        `/${a.data.id}/managed`,
        { ...body, expectedUpdatedAt: new Date(0).toISOString() },
        'owner',
        'PATCH',
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await request(
        `/${a.data.id}`,
        { ...body, provider: 'EVOLUTION', settings: { instance: 'stolen' } },
        'owner',
        'PATCH',
      )
    ).status,
  ).toBe(400);
  expect((await request(`/${a.data.id}/managed`, body, 'owner', 'PATCH')).status).toBe(200);
  const row = await db.whatsAppConnection.findUniqueOrThrow({ where: { id: a.data.id } });
  expect(row.settings).toEqual({ managed: true, instance: managedEvolutionInstance('org-local', row.id) });
});
it('sem serviço configurado informa indisponibilidade sem solicitar segredos ao usuário', async () => {
  const a = await request('/managed', { name: 'Teste de indisponibilidade gerenciada' });
  expect(a.status).toBe(201);
  created.push(a.data.id);
  expect(a.data.configurationRequired).toBe(true);
  const result = await request(`/${a.data.id}/connect`, {});
  expect(result.status).toBe(400);
  expect(result.data.message).toContain('Você não precisa configurar');
  expect((await db.whatsAppConnection.findUniqueOrThrow({ where: { id: a.data.id } })).state).toBe(
    'DISCONNECTED',
  );
});
