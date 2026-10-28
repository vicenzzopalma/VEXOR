import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSdrTemplate } from '@eimax/workflow-schema';

const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
async function request(path: string, role = 'owner') {
  const res = await fetch(`http://127.0.0.1:4000${path}`, {
    headers: { Authorization: `Bearer ${sessions[role]}`, 'x-eimax-client': 'workspace' },
  });
  return { status: res.status, data: await res.json() };
}
let flowId: string, projectId: string, otherFlowId: string, otherProjectId: string;
beforeAll(async () => {
  const local = await db.workflow.create({
    data: { organizationId: 'org-local', draft: createSdrTemplate() },
  });
  const other = await db.workflow.create({
    data: { organizationId: 'org-other', draft: createSdrTemplate() },
  });
  flowId = local.id;
  projectId = local.projectId;
  otherFlowId = other.id;
  otherProjectId = other.projectId;
  await db.execution.createMany({
    data: Array.from({ length: 25 }, () => ({
      organizationId: 'org-local',
      workflowId: flowId,
      eventKey: randomUUID(),
      createdAt: new Date(Date.UTC(2026, 0, 1, 12)),
    })),
  });
  await db.execution.create({
    data: { organizationId: 'org-other', workflowId: otherFlowId, eventKey: randomUUID() },
  });
});
afterAll(() => db.$disconnect());

describe('Busca paginada de execuções', () => {
  it('filtra no banco e pagina sem repetir linhas com datas iguais', async () => {
    const query = `workflowId=${flowId}&status=QUEUED&from=2026-01-01T00%3A00%3A00.000Z&until=2026-01-02T00%3A00%3A00.000Z`;
    const first = await request(`/executions/search?${query}&page=1`);
    const second = await request(`/executions/search?${query}&page=2`);
    expect(first.status).toBe(200);
    expect(first.data.total).toBe(25);
    expect(first.data.items).toHaveLength(20);
    expect(second.data.items).toHaveLength(5);
    expect(new Set([...first.data.items, ...second.data.items].map((r: { id: string }) => r.id)).size).toBe(
      25,
    );
    expect((await request(`/executions/search?workflowId=${flowId}&status=FAILED`)).data.total).toBe(0);
    expect((await request(`/projects/${projectId}/executions/search?${query}`)).data.total).toBe(25);
  });
  it('respeita empresa e projeto, mesmo com identificadores de outra empresa', async () => {
    expect((await request(`/executions/search?workflowId=${otherFlowId}`)).data.total).toBe(0);
    expect((await request(`/executions/search?workflowId=${flowId}`, 'other')).data.total).toBe(0);
    expect((await request(`/projects/${otherProjectId}/executions/search`)).status).toBe(404);
    expect(
      (await request(`/projects/${projectId}/executions/search?workflowId=${otherFlowId}`)).data.total,
    ).toBe(0);
  });
  it('rejeita filtros inválidos e empresa fornecida pelo cliente', async () => {
    for (const query of [
      'page=0',
      'page=100001',
      'status=INVALID',
      'organizationId=org-other',
      'from=2026-01-02T00%3A00%3A00Z&until=2026-01-01T00%3A00%3A00Z',
    ])
      expect((await request(`/executions/search?${query}`)).status).toBe(400);
  });
});
