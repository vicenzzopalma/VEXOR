import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { waitForExecution } from './helpers';

const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ?? 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public',
    },
  },
});
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
async function request(path: string, role = 'owner', method = 'GET', body?: unknown) {
  const response = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-eimax-client': 'workspace',
      ...(role ? { Authorization: `Bearer ${sessions[role]}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

describe('Lead: revisão PostgreSQL e compare-and-swap multiempresa', () => {
  const workflows: Record<string, string> = {};
  beforeAll(async () => {
    for (const role of ['owner', 'other']) {
      const response = await request('/workflows', role, 'POST', {
        template: 'sdr',
        name: `Concorrência de leads ${role} ${randomUUID()}`,
      });
      expect(response.status).toBe(201);
      workflows[role] = response.data.id;
    }
  });
  afterAll(() => db.$disconnect());
  async function lead(role = 'owner') {
    return db.lead.create({
      data: {
        organizationId: role === 'other' ? 'org-other' : 'org-local',
        workflowId: workflows[role],
        eventKey: randomUUID(),
        name: 'Fixture concorrência DB1',
        data: {},
      },
    });
  }

  it('expõe revision inicial em listagem, detalhe e atualização por editor', async () => {
    const row = await lead();
    expect(row.revision).toBe(1);
    const list = await request(`/leads?workflowId=${workflows.owner}`);
    expect(list.status).toBe(200);
    expect(list.data.find((item: { id: string }) => item.id === row.id).revision).toBe(1);
    const detail = await request(`/leads/${row.id}`);
    expect(detail.data.revision).toBe(1);
    const changed = await request(`/leads/${row.id}`, 'editor', 'PATCH', {
      expectedRevision: 1,
      status: 'IN_PROGRESS',
      tags: ['Em atendimento'],
    });
    expect(changed.status).toBe(200);
    expect(changed.data.revision).toBe(2);
    expect(changed.data.status).toBe('IN_PROGRESS');
    expect((await request(`/leads/${row.id}`)).data.revision).toBe(2);
  });

  it('exige inteiro positivo no contrato e não aceita organização ou revisão atribuída pelo cliente', async () => {
    const row = await lead();
    for (const expectedRevision of [undefined, null, 0, -1, 1.5, '1', true, 2147483648]) {
      const response = await request(`/leads/${row.id}`, 'owner', 'PATCH', {
        expectedRevision,
        status: 'CONVERTED',
      });
      expect(response.status).toBe(400);
    }
    for (const extra of [{ organizationId: 'org-other' }, { revision: 10 }]) {
      expect(
        (
          await request(`/leads/${row.id}`, 'owner', 'PATCH', {
            expectedRevision: 1,
            status: 'CONVERTED',
            ...extra,
          })
        ).status,
      ).toBe(400);
    }
    const unchanged = await db.lead.findUniqueOrThrow({ where: { id: row.id } });
    expect(unchanged.revision).toBe(1);
    expect(unchanged.status).toBe('NEW');
  });

  it('mantém sessão, viewer 403 e 404 entre duas empresas mesmo com revisão antiga', async () => {
    const own = await lead();
    const foreign = await lead('other');
    const body = { expectedRevision: 1, status: 'CONVERTED' };
    expect((await request(`/leads/${own.id}`, '', 'PATCH', body)).status).toBe(401);
    expect((await request(`/leads/${own.id}`, 'viewer', 'PATCH', body)).status).toBe(403);
    expect((await request(`/leads/${foreign.id}`, 'owner')).status).toBe(404);
    for (const revision of [1, 2]) {
      expect(
        (
          await request(`/leads/${foreign.id}`, 'owner', 'PATCH', {
            ...body,
            expectedRevision: revision,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(`/leads/${own.id}`, 'other', 'PATCH', {
            ...body,
            expectedRevision: revision,
          })
        ).status,
      ).toBe(404);
    }
    expect((await request(`/leads/${randomUUID()}`, 'owner', 'PATCH', body)).status).toBe(404);
    const foreignList = await request(`/leads?workflowId=${workflows.owner}`, 'other');
    expect(foreignList.data).toEqual([]);
    expect((await db.lead.findUniqueOrThrow({ where: { id: foreign.id } })).revision).toBe(1);
    expect((await db.lead.findUniqueOrThrow({ where: { id: own.id } })).revision).toBe(1);
  });

  it('duas abas com a mesma revisão têm um único vencedor e preservam todos os dados dele', async () => {
    const row = await lead();
    const changes = [
      { expectedRevision: 1, status: 'CONVERTED', tags: ['Aba A'], phone: '+5511999990001' },
      { expectedRevision: 1, status: 'DISQUALIFIED', tags: ['Aba B'], phone: '+5511999990002' },
    ];
    const responses = await Promise.all(
      changes.map((body, index) => request(`/leads/${row.id}`, index ? 'editor' : 'owner', 'PATCH', body)),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winnerIndex = responses.findIndex((response) => response.status === 200);
    const winner = changes[winnerIndex];
    const persisted = await db.lead.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted).toMatchObject({
      revision: 2,
      status: winner.status,
      tags: winner.tags,
      phone: winner.phone,
    });
    expect(responses[winnerIndex].data.revision).toBe(2);
    const retry = await request(`/leads/${row.id}`, 'owner', 'PATCH', changes[1 - winnerIndex]);
    expect(retry.status).toBe(409);
    expect(await db.lead.findUniqueOrThrow({ where: { id: row.id } })).toEqual(persisted);
  });

  it('SQL direto, atribuição de revision e updates sem mudança incrementam e invalidam aba antiga', async () => {
    const row = await lead();
    await db.$executeRaw`UPDATE "Lead" SET status = 'QUALIFIED', revision = 1 WHERE id = ${row.id}`;
    let current = await db.lead.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.revision).toBe(2);
    expect(
      (
        await request(`/leads/${row.id}`, 'owner', 'PATCH', {
          expectedRevision: 1,
          status: 'CONVERTED',
        })
      ).status,
    ).toBe(409);
    await Promise.all(
      Array.from(
        { length: 4 },
        () => db.$executeRaw`UPDATE "Lead" SET status = status, revision = 1 WHERE id = ${row.id}`,
      ),
    );
    current = await db.lead.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.revision).toBe(6);
    expect(current.status).toBe('QUALIFIED');
    expect(
      (
        await request(`/leads/${row.id}`, 'owner', 'PATCH', {
          expectedRevision: current.revision,
          status: 'CONVERTED',
        })
      ).data.revision,
    ).toBe(7);
  });

  it('efeitos do worker real avançam revisão e impedem edição de snapshot anterior ao processamento', async () => {
    let workflow = (await request(`/workflows/${workflows.owner}`)).data;
    workflow.draft.nodes.find((node: { type: string }) => node.type === 'sdr.assign').config.team =
      'membership:dev-owner';
    workflow = (
      await request(`/workflows/${workflow.id}`, 'owner', 'PATCH', {
        revision: workflow.revision,
        draft: workflow.draft,
      })
    ).data;
    expect(
      (await request(`/workflows/${workflow.id}/publish`, 'owner', 'POST', { revision: workflow.revision }))
        .status,
    ).toBe(201);
    const queued = await request(`/workflows/${workflow.id}/execute`, 'owner', 'POST', {
      eventKey: randomUUID(),
      lead: {
        name: 'Fixture worker DB1',
        email: 'db1@example.test',
        company: 'Fixture local',
        budget: 15000,
        score: 90,
        source: 'teste-local',
      },
    });
    expect(queued.status).toBe(201);
    const execution = await db.execution.findUniqueOrThrow({ where: { id: queued.data.id } });
    expect(execution.leadId).toBeTruthy();
    // Creation revision is a deterministic stale tab even with automatic workers enabled.
    expect((await waitForExecution(execution.id)).status).toBe('COMPLETED');
    const processed = await db.lead.findUniqueOrThrow({ where: { id: execution.leadId! } });
    expect(processed.revision).toBeGreaterThan(1);
    expect(processed.status).toBe('QUALIFIED');
    expect(
      (
        await request(`/leads/${processed.id}`, 'owner', 'PATCH', {
          expectedRevision: 1,
          status: 'CONVERTED',
          tags: ['Aba antiga'],
        })
      ).status,
    ).toBe(409);
    expect(await db.lead.findUniqueOrThrow({ where: { id: processed.id } })).toEqual(processed);
  });
});
