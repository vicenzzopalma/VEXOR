import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { waitForExecution } from './helpers';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax?schema=public';
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const prisma = new PrismaClient();

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

describe('Ciclo Comercial Real Completo - VEXOR', () => {
  let workflowA: any;

  beforeAll(async () => {
    // Ensure database connection
    await prisma.$connect();

    // Create workflow for Company A
    const resA = await request('/workflows', 'owner', 'POST', {
      template: 'sdr',
      name: `Ciclo Comercial E2E A ${Date.now()}`,
    });
    expect(resA.status).toBe(201);
    workflowA = resA.data;
    workflowA.draft.nodes.find((n: any) => n.type === 'sdr.assign').config.team = 'membership:dev-owner';
    workflowA = (
      await request(`/workflows/${workflowA.id}`, 'owner', 'PATCH', {
        revision: workflowA.revision,
        draft: workflowA.draft,
      })
    ).data;

    // Publish workflow A so it has an immutable version snapshot
    const pubRes = await request(`/workflows/${workflowA.id}/publish`, 'owner', 'POST', {
      revision: workflowA.revision,
    });
    expect(pubRes.status).toBe(201);

    // Create workflow for Company B (isolated)
    const resB = await request('/workflows', 'other', 'POST', {
      template: 'sdr',
      name: `Ciclo Comercial E2E B ${Date.now()}`,
    });
    expect(resB.status).toBe(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Etapa 1 a 7: Recebe lead real qualificado, avalia condição, atribui SDR real e notifica gestor', async () => {
    const eventKey = `real-lead-qual-${Date.now()}`;
    const leadPayload = {
      name: 'Carlos Silveira',
      email: 'carlos.silveira@acme.com.br',
      company: 'Acme Engenharia e Tecnologia',
      budget: 15000, // Acima de 1000 -> qualifica
      score: 92,
      source: 'webhook_comercial',
    };

    // 1. Executa o workflow real publicado
    const executeRes = await request(`/workflows/${workflowA.id}/execute`, 'owner', 'POST', {
      lead: leadPayload,
      eventKey,
    });

    expect(executeRes.status).toBe(201);
    expect(executeRes.data.status).toBe('QUEUED');
    await waitForExecution(executeRes.data.id);
    expect(executeRes.data.idempotentHit).toBe(false);

    const executionId = executeRes.data.id;
    expect(executionId).toBeTruthy();

    // 2. Comprovação no PostgreSQL: Lead persistido com dados estruturados e status QUALIFIED
    const persistedLead = await prisma.lead.findUnique({
      where: {
        organizationId_workflowId_eventKey: {
          organizationId: 'org-local',
          workflowId: workflowA.id,
          eventKey,
        },
      },
      include: {
        assignedMembership: { include: { user: true } },
        notifications: true,
        executions: true,
      },
    });

    expect(persistedLead).toBeTruthy();
    expect(persistedLead!.name).toBe('Carlos Silveira');
    expect(persistedLead!.company).toBe('Acme Engenharia e Tecnologia');
    expect(persistedLead!.budget).toBe(15000);
    expect(persistedLead!.score).toBe(92);
    expect(persistedLead!.status).toBe('QUALIFIED');
    expect(persistedLead!.revision).toBeGreaterThan(1);

    // 3. Comprovação: SDR real atribuído
    expect(persistedLead!.assignedMembershipId).toBeTruthy();
    expect(persistedLead!.assignedMembership).toBeTruthy();
    expect(['owner', 'editor']).toContain(persistedLead!.assignedMembership!.role);

    // 4. Comprovação: Etiqueta persistida no banco
    const tags = persistedLead!.tags as string[];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('Lead qualificado');

    // 5. Comprovação: Notificação real persistida no PostgreSQL
    const notification = await prisma.notification.findFirst({
      where: {
        leadId: persistedLead!.id,
        executionId,
      },
    });

    expect(notification).toBeTruthy();
    expect(notification!.channel).toBe('MANAGER_NOTIFICATION');
    expect(notification!.status).toBe('AVAILABLE');
    expect(notification!.title).toContain('Carlos Silveira');
    expect(notification!.recipient).toBeTruthy();

    // 6. Comprovação: ExecutionStep com métricas e durações reais
    const steps = await prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { createdAt: 'asc' },
    });

    expect(steps.length).toBe(6); // 5 traversed + 1 skipped (nurture)
    const successSteps = steps.filter((s) => s.status === 'success');
    expect(successSteps.length).toBe(5);

    const skippedSteps = steps.filter((s) => s.status === 'skipped');
    expect(skippedSteps.length).toBe(1);
    expect(skippedSteps[0].nodeType).toBe('email.send');

    // Verifica que durações reais foram registradas
    const assignStep = steps.find((s) => s.nodeType === 'sdr.assign');
    expect(assignStep).toBeTruthy();
    expect(assignStep!.durationMs).toBeGreaterThan(0);
    expect((assignStep!.output as any).assigned).toBe(true);
  });

  it('Avalia condição: Lead com orçamento abaixo do corte vai para desqualificação / nutrição', async () => {
    const eventKey = `real-lead-unqual-${Date.now()}`;
    const lowBudgetLead = {
      name: 'João Pequeno',
      email: 'joao@pequenaempresa.com.br',
      company: 'Pequeno Comércio Ltda',
      budget: 450, // Abaixo do corte de 1000
      score: 30,
      source: 'formulario',
    };

    const res = await request(`/workflows/${workflowA.id}/execute`, 'owner', 'POST', {
      lead: lowBudgetLead,
      eventKey,
    });

    expect(res.status).toBe(201);
    expect(res.data.status).toBe('QUEUED');
    expect((await waitForExecution(res.data.id)).status).toBe('FAILED');

    const persistedLead = await prisma.lead.findUnique({
      where: {
        organizationId_workflowId_eventKey: {
          organizationId: 'org-local',
          workflowId: workflowA.id,
          eventKey,
        },
      },
      include: { notifications: true },
    });

    expect(persistedLead).toBeTruthy();
    // SDR NÃO foi atribuído
    expect(persistedLead!.assignedMembershipId).toBeNull();
    // Status do lead é desqualificado
    expect(persistedLead!.status).toBe('NEW');

    // E-mail de nutrição gerado na tabela Notification
    const emailNotification = persistedLead!.notifications.find((n) => n.channel === 'EMAIL');
    expect(emailNotification).toBeTruthy();
    expect(emailNotification!.status).toBe('FAILED');
    expect(emailNotification!.recipient).toBe('joao@pequenaempresa.com.br');
  });

  it('Garante idempotência: reexecução com a mesma chave não duplica lead nem notificações', async () => {
    const eventKey = `real-lead-idempotent-${Date.now()}`;
    const lead = {
      name: 'Mariana Duarte',
      email: 'mariana@duarte.com',
      company: 'Duarte Design',
      budget: 8000,
      score: 80,
      source: 'webhook',
    };

    // Primeira execução
    const first = await request(`/workflows/${workflowA.id}/execute`, 'owner', 'POST', {
      lead,
      eventKey,
    });
    expect(first.status).toBe(201);
    expect(first.data.idempotentHit).toBe(false);

    // Segunda execução com a mesma chave de evento
    const second = await request(`/workflows/${workflowA.id}/execute`, 'owner', 'POST', {
      lead,
      eventKey,
    });
    expect(second.status).toBe(201);
    expect(second.data.idempotentHit).toBe(true);
    expect(second.data.id).toBe(first.data.id);

    await waitForExecution(first.data.id);

    // Contagem de notificações no banco para este lead permanece 1
    const notifCount = await prisma.notification.count({
      where: { executionId: first.data.id },
    });
    expect(notifCount).toBe(1);
  });

  it('Gestão de Leads na API: listagem, detalhes e isolamento multiempresa', async () => {
    // 1. Listagem de leads pela organização A
    const listRes = await request('/leads', 'owner');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.data)).toBe(true);
    expect(listRes.data.length).toBeGreaterThan(0);

    const sample = listRes.data[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('name');
    expect(sample).toHaveProperty('status');
    expect(sample.revision).toBeGreaterThan(0);
    expect(sample).toHaveProperty('assignedMembership');

    // 2. Detalhe do lead
    const detailRes = await request(`/leads/${sample.id}`, 'owner');
    expect(detailRes.status).toBe(200);
    expect(detailRes.data.id).toBe(sample.id);
    expect(detailRes.data.revision).toBeGreaterThanOrEqual(sample.revision);
    expect(Array.isArray(detailRes.data.executions)).toBe(true);
    expect(Array.isArray(detailRes.data.notifications)).toBe(true);

    // 3. Isolamento multiempresa: Empresa B tenta acessar o lead da Empresa A
    const isolationRes = await request(`/leads/${sample.id}`, 'other');
    expect(isolationRes.status).toBe(404);

    // Listagem da empresa B não revela leads da empresa A
    const listB = await request('/leads', 'other');
    expect(listB.data.some((l: any) => l.id === sample.id)).toBe(false);
  });

  it('Gestão de Notificações na API: listagem com isolamento organizacional', async () => {
    const notifsA = await request('/notifications', 'owner');
    expect(notifsA.status).toBe(200);
    expect(Array.isArray(notifsA.data)).toBe(true);
    expect(notifsA.data.length).toBeGreaterThan(0);

    // Empresa B lista notificações
    const notifsB = await request('/notifications', 'other');
    expect(notifsB.status).toBe(200);
    // Não pode conter notificações da empresa A
    const notifAIds = new Set(notifsA.data.map((n: any) => n.id));
    for (const nb of notifsB.data) {
      expect(notifAIds.has(nb.id)).toBe(false);
    }
  });

  it('Atualização de Lead (PATCH /leads/:id): reatribuição e atualização de status', async () => {
    const list = await request('/leads', 'owner');
    const targetLead = list.data[0];
    const foreignAssignment = await request(`/leads/${targetLead.id}`, 'owner', 'PATCH', {
      expectedRevision: targetLead.revision,
      assignedMembershipId: 'dev-other',
    });
    expect(foreignAssignment.status).toBe(400);

    const patchRes = await request(`/leads/${targetLead.id}`, 'owner', 'PATCH', {
      expectedRevision: targetLead.revision,
      status: 'CONVERTED',
      tags: ['Cliente Fechado', 'Contrato Assinado'],
    });

    expect(patchRes.status).toBe(200);
    expect(patchRes.data.status).toBe('CONVERTED');
    expect(patchRes.data.revision).toBe(targetLead.revision + 1);
    expect(patchRes.data.tags).toContain('Contrato Assinado');

    // Rejeita acesso de outra empresa ao patch
    const patchOther = await request(`/leads/${targetLead.id}`, 'other', 'PATCH', {
      expectedRevision: patchRes.data.revision,
      status: 'DISQUALIFIED',
    });
    expect(patchOther.status).toBe(404);
  });
});
