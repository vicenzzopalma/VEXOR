import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
async function request(path: string, role = 'owner', method = 'GET', body?: unknown) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessions[role] ?? 'invalid'}`,
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
let a: any, b: any, other: any, flow: any;
const suffix = randomUUID();
beforeAll(async () => {
  a = (
    await request('/projects', 'owner', 'POST', { name: `Projeto A ${suffix}`, description: 'Operação A' })
  ).data;
  b = (await request('/projects', 'owner', 'POST', { name: `Projeto B ${suffix}` })).data;
  other = (await request('/projects', 'other', 'POST', { name: `Empresa B ${suffix}` })).data;
  expect(a.id && b.id && other.id).toBeTruthy();
});
afterAll(() => db.$disconnect());

describe.sequential('Projetos: isolamento, revisões e preservação', () => {
  it('migração mantém todos os fluxos com projeto da mesma empresa e preserva o inicial', async () => {
    const missing = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*) AS count FROM "Workflow" w LEFT JOIN "Project" p ON p."id"=w."project_id" AND p."organization_id"=w."organization_id" WHERE p."id" IS NULL`;
    expect(Number(missing[0].count)).toBe(0);
    const starter = await db.workflow.findUniqueOrThrow({
      where: { id: 'starter-sdr' },
      include: { project: true },
    });
    expect(starter.project.organizationId).toBe(starter.organizationId);
    expect(starter.draft).toHaveProperty('nodes');
  });
  it('exige sessão e RBAC, rejeita empresa no corpo e nomes equivalentes', async () => {
    expect((await request('/projects', 'invalid')).status).toBe(401);
    expect((await request('/projects', 'viewer', 'POST', { name: 'Bloqueado' })).status).toBe(403);
    expect(
      (await request('/projects', 'owner', 'POST', { name: 'Falso', organizationId: 'org-other' })).status,
    ).toBe(400);
    expect((await request('/projects', 'owner', 'POST', { name: `  PROJETO   A ${suffix} ` })).status).toBe(
      409,
    );
    expect((await request('/projects', 'other', 'POST', { name: a.name })).status).toBe(201);
    expect(
      (await request(`/projects/${a.id}`, 'owner', 'PATCH', { name: '', revision: a.revision })).status,
    ).toBe(400);
  });
  it('todas as rotas por projeto isolam duas empresas', async () => {
    const list = (await request('/projects')).data;
    expect(list.some((p: any) => p.id === other.id)).toBe(false);
    for (const path of ['', '/workflows', '/executions', '/simulations'])
      expect((await request(`/projects/${other.id}${path}`)).status).toBe(404);
    expect(
      (await request(`/projects/${other.id}/workflows`, 'owner', 'POST', { name: 'Intrusão' })).status,
    ).toBe(404);
    expect(
      (await request(`/projects/${other.id}`, 'owner', 'PATCH', { name: 'Intrusão', revision: 1 })).status,
    ).toBe(404);
    for (const action of ['archive', 'restore'])
      expect(
        (await request(`/projects/${other.id}/${action}`, 'owner', 'POST', { revision: 1 })).status,
      ).toBe(404);
  });
  it('renomeia com revisão e permite apenas uma escrita concorrente', async () => {
    const attempts = await Promise.all(
      ['um', 'dois'].map((description) =>
        request(`/projects/${a.id}`, 'editor', 'PATCH', { description, revision: a.revision }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    a = (await request(`/projects/${a.id}`)).data;
    const renamed = await request(`/projects/${a.id}`, 'owner', 'PATCH', {
      name: `Projeto renomeado ${suffix}`,
      revision: a.revision,
    });
    expect(renamed.status).toBe(200);
    a = renamed.data;
  });
  it('cria no projeto, renomeia, duplica e move sem alterar versões publicadas', async () => {
    const created = await request(`/projects/${a.id}/workflows`, 'editor', 'POST', {
      name: 'Fluxo do projeto',
    });
    expect(created.status).toBe(201);
    flow = created.data;
    expect(flow.projectId).toBe(a.id);
    const renamed = await request(`/workflows/${flow.id}/name`, 'editor', 'PATCH', {
      name: 'Fluxo renomeado',
      revision: flow.revision,
    });
    expect(renamed.status).toBe(200);
    flow = renamed.data;
    const version = await db.workflowVersion.create({
      data: { workflowId: flow.id, organizationId: flow.organizationId, number: 1, snapshot: flow.draft },
    });
    const duplicate = await request(`/workflows/${flow.id}/duplicate`, 'editor', 'POST', {
      revision: flow.revision,
    });
    expect(duplicate.status).toBe(201);
    expect(duplicate.data.id).not.toBe(flow.id);
    expect(await db.workflowVersion.count({ where: { workflowId: duplicate.data.id } })).toBe(0);
    const moved = await request(`/workflows/${flow.id}/move`, 'editor', 'POST', {
      revision: flow.revision,
      projectId: b.id,
    });
    expect(moved.status).toBe(201);
    flow = moved.data;
    expect(flow.projectId).toBe(b.id);
    expect((await db.workflowVersion.findUniqueOrThrow({ where: { id: version.id } })).snapshot).toEqual(
      version.snapshot,
    );
    expect((await request(`/projects/${a.id}/workflows`)).data.some((f: any) => f.id === flow.id)).toBe(
      false,
    );
    expect((await request(`/projects/${b.id}/workflows`)).data.some((f: any) => f.id === flow.id)).toBe(true);
    expect(
      (
        await request(`/workflows/${flow.id}/move`, 'owner', 'POST', {
          revision: flow.revision - 1,
          projectId: a.id,
        })
      ).status,
    ).toBe(409);
  });
  it('nega mover/duplicar/renomear/arquivar fluxos de outra empresa ou para outro tenant', async () => {
    for (const action of ['move', 'duplicate']) {
      expect(
        (
          await request(`/workflows/${flow.id}/${action}`, 'other', 'POST', {
            revision: flow.revision,
            projectId: other.id,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(`/workflows/${flow.id}/${action}`, 'owner', 'POST', {
            revision: flow.revision,
            projectId: other.id,
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await request(`/workflows/${flow.id}/name`, 'other', 'PATCH', {
          revision: flow.revision,
          name: 'Intrusão',
        })
      ).status,
    ).toBe(404);
    for (const action of ['archive-revision', 'restore-revision'])
      expect(
        (await request(`/workflows/${flow.id}/${action}`, 'other', 'POST', { revision: flow.revision }))
          .status,
      ).toBe(404);
    expect(
      (
        await request(`/workflows/${flow.id}/move`, 'viewer', 'POST', {
          revision: flow.revision,
          projectId: a.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(`/projects/${a.id}/archive`, 'editor', 'POST', { revision: a.revision })).status,
    ).toBe(403);
  });
  it('arquiva/restaura com revisão sem perder fluxos; projeto arquivado recusa criação/edição/movimentação', async () => {
    let response = await request(`/workflows/${flow.id}/archive-revision`, 'owner', 'POST', {
      revision: flow.revision,
    });
    expect(response.status).toBe(201);
    flow = response.data;
    expect(flow.archivedAt).not.toBeNull();
    response = await request(`/workflows/${flow.id}/restore-revision`, 'owner', 'POST', {
      revision: flow.revision,
    });
    expect(response.status).toBe(201);
    flow = response.data;
    response = await request(`/projects/${b.id}/archive`, 'owner', 'POST', { revision: b.revision });
    expect(response.status).toBe(201);
    b = response.data;
    expect(
      (await request(`/projects/${b.id}/workflows`, 'owner', 'POST', { name: 'Bloqueado' })).status,
    ).toBe(400);
    expect(
      (
        await request(`/workflows/${flow.id}/name`, 'owner', 'PATCH', {
          name: 'Bloqueado',
          revision: flow.revision,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/workflows/${flow.id}`, 'owner', 'PATCH', {
          draft: flow.draft,
          revision: flow.revision,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`/projects/${b.id}/restore`, 'owner', 'POST', { revision: b.revision - 1 })).status,
    ).toBe(409);
    expect(
      (await request(`/projects/${b.id}/restore`, 'owner', 'POST', { revision: b.revision })).status,
    ).toBe(201);
    expect((await request(`/workflows/${flow.id}`)).data.project.id).toBe(b.id);
  });
  it('o PostgreSQL também recusa associação de fluxo a projeto de outra empresa', async () => {
    await expect(
      db.workflow.update({ where: { id: flow.id }, data: { projectId: other.id } }),
    ).rejects.toThrow();
  });
});
