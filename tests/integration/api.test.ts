
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { sampleLead } from '@eimax/workflow-schema';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
async function request(
  path: string,
  role = 'owner',
  method = 'GET',
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      ...(role ? { Authorization: `Bearer ${sessions[role]}` } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
let a: any;
let b: any;
beforeAll(async () => {
  expect((await request('/health', '')).status).toBe(200);
  a = (await request('/workflows', 'owner', 'POST', { template: 'sdr', name: `Integração A ${Date.now()}` }))
    .data;
  b = (await request('/workflows', 'other', 'POST', { template: 'sdr', name: `Integração B ${Date.now()}` }))
    .data;
  expect(a.id).toBeTruthy();
  expect(b.id).toBeTruthy();
});
describe('Controle de acesso por empresa e permissão', () => {
  it('exige sessão válida, incluindo leituras', async () => {
    expect((await request('/workflows', '')).status).toBe(401);
    expect((await request('/workflows', 'invalid')).status).toBe(401);
  });
  it('listas não revelam recursos da outra organização', async () => {
    const listA = (await request('/workflows')).data;
    const listB = (await request('/workflows', 'other')).data;
    expect(listA.some((r: any) => r.id === b.id)).toBe(false);
    expect(listB.some((r: any) => r.id === a.id)).toBe(false);
  });
  it('bloqueia acesso cruzado em leitura, escrita, publicação, simulação e histórico', async () => {
    for (const [suffix, method, body] of [
      ['', 'GET', undefined],
      ['', 'PATCH', { revision: b.revision, draft: b.draft }],
      ['/publish', 'POST', { revision: b.revision }],
      ['/simulate', 'POST', { revision: b.revision, lead: sampleLead }],
      ['/versions/1', 'GET', undefined],
      ['/simulations', 'GET', undefined],
    ] as const)
      expect((await request(`/workflows/${b.id}${suffix}`, 'owner', method, body)).status).toBe(404);
  });
  it('rejeita organization_id enviado no corpo e ignora headers falsos de empresa', async () => {
    expect(
      (
        await request('/workflows', 'owner', 'POST', {
          template: 'sdr',
          name: 'Invasão',
          organization_id: b.organizationId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/workflows/${b.id}`, 'owner', 'GET', undefined, {
          'x-organization-id': b.organizationId,
        })
      ).status,
    ).toBe(404);
  });
  it('leitor pode consultar, mas não escrever nem simular; editor não publica', async () => {
    expect((await request(`/workflows/${a.id}`, 'viewer')).status).toBe(200);
    expect(
      (await request(`/workflows/${a.id}`, 'viewer', 'PATCH', { revision: a.revision, draft: a.draft }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(`/workflows/${a.id}/simulate`, 'viewer', 'POST', {
          revision: a.revision,
          lead: sampleLead,
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(`/workflows/${a.id}/publish`, 'editor', 'POST', { revision: a.revision })).status,
    ).toBe(403);
  });
  it('recusa escritas de origem não autorizada', async () =>
    expect(
      (
        await request(
          '/workflows',
          'owner',
          'POST',
          { template: 'sdr', name: 'Cross-site' },
          { Origin: 'https://example.net' },
        )
      ).status,
    ).toBe(403));
});
describe('Persistência, revisão e versões', () => {
  it('salva/carrega e recusa revisão desatualizada', async () => {
    const draft = { ...a.draft, name: `${a.draft.name} salvo` };
    const saved = await request(`/workflows/${a.id}`, 'editor', 'PATCH', { revision: a.revision, draft });
    expect(saved.status).toBe(200);
    expect((await request(`/workflows/${a.id}`)).data.draft.name).toBe(draft.name);
    expect(
      (await request(`/workflows/${a.id}`, 'owner', 'PATCH', { revision: a.revision, draft })).status,
    ).toBe(409);
    a = saved.data;
  });
  it('duas gravações concorrentes permitem apenas uma revisão', async () => {
    const results = await Promise.all([
      request(`/workflows/${a.id}`, 'owner', 'PATCH', { revision: a.revision, draft: a.draft }),
      request(`/workflows/${a.id}`, 'owner', 'PATCH', { revision: a.revision, draft: a.draft }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    a = (await request(`/workflows/${a.id}`)).data;
  });
  it('publica versão uma única vez e mantém snapshot após editar rascunho', async () => {
    const publications = await Promise.all([
      request(`/workflows/${a.id}/publish`, 'owner', 'POST', { revision: a.revision }),
      request(`/workflows/${a.id}/publish`, 'owner', 'POST', { revision: a.revision }),
    ]);
    expect(publications.every((r) => r.status === 201)).toBe(true);
    expect(publications[0].data.id).toBe(publications[1].data.id);
    const original = structuredClone(a.draft);
    a = (
      await request(`/workflows/${a.id}`, 'owner', 'PATCH', {
        revision: a.revision,
        draft: { ...a.draft, name: 'Novo rascunho independente' },
      })
    ).data;
    const version = await request(`/workflows/${a.id}/versions/1`);
    expect(version.data.snapshot).toEqual(original);
    expect(a.draft.name).not.toBe(version.data.snapshot.name);
  });
  it('o banco também recusa alteração de snapshot publicado', async () => {
    const db = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ??
            'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
        },
      },
    });
    try {
      await expect(
        db.$executeRaw`UPDATE "WorkflowVersion" SET "number"="number" WHERE "workflowId"=${a.id}`,
      ).rejects.toThrow('immutable');
    } finally {
      await db.$disconnect();
    }
  });
  it('configuração inválida pode ser salva, mas não publicada nem simulada', async () => {
    const draft = structuredClone(b.draft);
    draft.nodes[1].config.value = 'inválido';
    b = (await request(`/workflows/${b.id}`, 'other', 'PATCH', { revision: b.revision, draft })).data;
    expect(
      (await request(`/workflows/${b.id}/publish`, 'other', 'POST', { revision: b.revision })).status,
    ).toBe(400);
    expect(
      (
        await request(`/workflows/${b.id}/simulate`, 'other', 'POST', {
          revision: b.revision,
          lead: sampleLead,
        })
      ).status,
    ).toBe(400);
  });
  it('simula condições no servidor, persiste logs e não os expõe à outra empresa', async () => {
    const result = await request(`/workflows/${a.id}/simulate`, 'owner', 'POST', {
      revision: a.revision,
      lead: { ...sampleLead, budget: 10 },
    });
    expect(result.status).toBe(201);
    expect(result.data.steps.find((s: any) => s.nodeId === 'qualify').output.branch).toBe('false');
    expect(result.data.steps.find((s: any) => s.nodeId === 'assign').status).toBe('skipped');
    expect(JSON.stringify(result.data)).not.toContain(sampleLead.email);
    expect(
      (await request(`/workflows/${a.id}/simulations`)).data.some((r: any) => r.id === result.data.id),
    ).toBe(true);
    expect((await request('/simulations', 'other')).data.some((r: any) => r.id === result.data.id)).toBe(
      false,
    );
  });
});
