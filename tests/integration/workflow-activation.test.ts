import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSdrTemplate, sampleLead, type Workflow } from '@eimax/workflow-schema';
import {
  enqueueInTransaction,
  enqueueWorkflowExecution,
  processNextWhatsAppEvent,
  WorkflowInactiveError,
} from '@eimax/workflow-runtime';

process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const suffix = randomUUID().slice(0, 8);

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
const webhook = (workflowId: string, secret = sessions.webhook, eventKey = randomUUID()) =>
  fetch(`http://127.0.0.1:4000/webhooks/${workflowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-eimax-webhook-secret': secret, 'x-eimax-event-key': eventKey },
    body: JSON.stringify(sampleLead),
  });

function webhookFlow(name: string, credentialRef = 'ingress'): Workflow {
  const flow = createSdrTemplate();
  return {
    ...flow,
    name,
    nodes: [
      { ...flow.nodes[0], type: 'webhook.received', config: { credentialRef } },
      flow.nodes.find((n) => n.type === 'tag.add')!,
    ],
    edges: [{ id: 'edge', source: 'trigger', target: 'tag' }],
  };
}
function whatsappFlow(name: string, connectionId: string): Workflow {
  const flow = webhookFlow(name);
  flow.nodes[0] = { ...flow.nodes[0], type: 'whatsapp.message.received', config: { connectionId } };
  return flow;
}
/** Cria pelo endpoint, salva o rascunho e publica; devolve id, revisão e versão. */
async function publishedFlow(draft: Workflow, role = 'owner') {
  const created = await request('/workflows', role, 'POST', { template: 'sdr', name: draft.name });
  expect(created.status).toBe(201);
  const saved = await request(`/workflows/${created.data.id}`, role, 'PATCH', {
    revision: created.data.revision,
    draft,
  });
  expect(saved.status).toBe(200);
  const version = await request(`/workflows/${created.data.id}/publish`, role, 'POST', {
    revision: saved.data.revision,
  });
  expect(version.status).toBe(201);
  return { id: created.data.id as string, revision: saved.data.revision as number, version: version.data };
}
async function revisionOf(id: string) {
  return (await db.workflow.findUniqueOrThrow({ where: { id } })).revision;
}
async function activationRevisionOf(id: string) {
  return (await db.workflow.findUniqueOrThrow({ where: { id } })).activationRevision;
}
/** Processa a fila do inbox até o evento sair de PENDING. */
async function drain(eventId: string) {
  for (let i = 0; i < 200; i++) {
    const row = await db.whatsAppEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (row.status !== 'PENDING') return row;
    await processNextWhatsAppEvent(db);
  }
  return db.whatsAppEvent.findUniqueOrThrow({ where: { id: eventId } });
}
const stalePhone = () => `55119${String(Date.now()).slice(-8)}`;

let connection: { id: string };
beforeAll(async () => {
  connection = await db.whatsAppConnection.create({
    data: {
      organizationId: 'org-local',
      name: `Sandbox ativação ${suffix}`,
      provider: 'MOCK',
      enabled: true,
      state: 'CONNECTED',
      settings: {},
    },
  });
});
afterAll(async () => {
  if (connection)
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { state: 'ARCHIVED', enabled: false, quarantinedAt: null, quarantineReason: null },
    });
  await db.$disconnect();
});

describe.sequential('Ativo/inativo por fluxo', () => {
  it('a migração deixa fluxos ativos por padrão e o estado aparece no fluxo e na lista', async () => {
    const column = await db.$queryRaw<
      Array<{ column_default: string; is_nullable: string }>
    >`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name='Workflow' AND column_name='active'`;
    expect(column[0]).toMatchObject({ column_default: 'true', is_nullable: 'NO' });
    const { id } = await publishedFlow(webhookFlow(`Padrão ${suffix}`));
    const flow = (await request(`/workflows/${id}`)).data;
    expect(flow).toMatchObject({ active: true, activationError: null });
    const row = (await request('/workflows')).data.find((w: { id: string }) => w.id === id);
    expect(row).toMatchObject({ active: true, activationError: null, versions: 1 });
    // A restrição impede erro de ativação com o fluxo ativo.
    await expect(
      db.workflow.update({ where: { id }, data: { activationError: { code: 'X' } } }),
    ).rejects.toThrow();
  });

  it('inativo não dispara por webhook nem pela API, responde 409 e registra no ingresso', async () => {
    const { id } = await publishedFlow(webhookFlow(`Webhook ${suffix}`));
    const off = await request(`/workflows/${id}/deactivate`, 'editor', 'POST', { activationRevision: await activationRevisionOf(id) });
    expect(off.status).toBe(201);
    expect(off.data).toMatchObject({ id, active: false, activationError: null });
    const refused = await webhook(id);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'WORKFLOW_INACTIVE' });
    // Sem a credencial, continua 401: o estado do fluxo não vaza.
    expect((await webhook(id, 'errada')).status).toBe(401);
    const api = await request(`/workflows/${id}/execute`, 'owner', 'POST', { lead: sampleLead });
    expect(api.status).toBe(409);
    expect(api.data.code).toBe('WORKFLOW_INACTIVE');
    expect(await db.execution.count({ where: { workflowId: id } })).toBe(0);
    expect(await db.lead.count({ where: { workflowId: id } })).toBe(0);
    const log = await db.webhookIngressLog.findFirst({
      where: { resourceId: id, source: 'WORKFLOW' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toMatchObject({ organizationId: 'org-local', outcome: 'REJECTED' });
    const codes = await db.webhookIngressLog.findMany({ where: { resourceId: id }, select: { code: true } });
    expect(codes.map((c) => c.code)).toContain('WORKFLOW_INACTIVE');
  });

  it('reativar volta a disparar com a versão publicada atual', async () => {
    const draft = webhookFlow(`Reativar ${suffix}`);
    const { id } = await publishedFlow(draft);
    expect(
      (await request(`/workflows/${id}/deactivate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(id) })).status,
    ).toBe(201);
    // Nova versão publicada com o fluxo inativo: continua inativo até reativar.
    const saved = await request(`/workflows/${id}`, 'owner', 'PATCH', {
      revision: await revisionOf(id),
      draft: { ...draft, name: `${draft.name} v2` },
    });
    const v2 = await request(`/workflows/${id}/publish`, 'owner', 'POST', { revision: saved.data.revision });
    expect(v2.data.number).toBe(2);
    expect((await webhook(id)).status).toBe(409);
    const on = await request(`/workflows/${id}/activate`, 'editor', 'POST', { activationRevision: await activationRevisionOf(id) });
    expect(on.status).toBe(201);
    expect(on.data).toMatchObject({ active: true, activationError: null, activeVersion: { number: 2 } });
    const accepted = await webhook(id);
    expect(accepted.status).toBe(201);
    const execution = await db.execution.findUniqueOrThrow({ where: { id: (await accepted.json()).executionId } });
    expect(execution.versionId).toBe(v2.data.id);
    const api = await request(`/workflows/${id}/execute`, 'owner', 'POST', { lead: sampleLead });
    expect(api.status).toBe(201);
  });

  it('viewer é recusado, revisão antiga dá conflito e só uma escrita concorrente vence', async () => {
    const { id } = await publishedFlow(webhookFlow(`Revisão ${suffix}`));
    const activationRevision = await activationRevisionOf(id);
    const body = { activationRevision };
    expect((await request(`/workflows/${id}/deactivate`, 'viewer', 'POST', body)).status).toBe(403);
    expect((await request(`/workflows/${id}/activate`, 'viewer', 'POST', body)).status).toBe(403);
    expect((await request(`/workflows/${id}/deactivate`, 'invalid', 'POST', body)).status).toBe(401);
    expect((await request(`/workflows/${id}/deactivate`, 'owner', 'POST', {})).status).toBe(400);
    // A revisão do rascunho não serve para o interruptor.
    expect((await request(`/workflows/${id}/deactivate`, 'owner', 'POST', { revision: 1 })).status).toBe(400);
    const attempts = await Promise.all([
      request(`/workflows/${id}/deactivate`, 'owner', 'POST', body),
      request(`/workflows/${id}/deactivate`, 'editor', 'POST', body),
    ]);
    expect(attempts.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(await activationRevisionOf(id)).toBe(activationRevision + 1);
    const stale = await request(`/workflows/${id}/activate`, 'owner', 'POST', body);
    expect(stale.status).toBe(409);
    expect((await db.workflow.findUniqueOrThrow({ where: { id } })).active).toBe(false);
  });

  it('alternar o interruptor não causa conflito no salvamento do rascunho em outra aba', async () => {
    const draft = webhookFlow(`Outra aba ${suffix}`);
    const { id } = await publishedFlow(draft);
    const draftRevision = await revisionOf(id);
    for (const action of ['deactivate', 'activate', 'deactivate'])
      expect(
        (
          await request(`/workflows/${id}/${action}`, 'editor', 'POST', {
            activationRevision: await activationRevisionOf(id),
          })
        ).status,
      ).toBe(201);
    expect(await revisionOf(id)).toBe(draftRevision);
    const saved = await request(`/workflows/${id}`, 'owner', 'PATCH', {
      revision: draftRevision,
      draft: { ...draft, name: `${draft.name} editado` },
    });
    expect(saved.status).toBe(200);
    expect(saved.data.revision).toBe(draftRevision + 1);
    // Salvar o rascunho também não mexe no interruptor.
    expect((await db.workflow.findUniqueOrThrow({ where: { id } })).active).toBe(false);
  });

  it('arquivar desliga o fluxo na mesma escrita e o arquivado não aceita eventos', async () => {
    const viaWorkflow = await publishedFlow(webhookFlow(`Arquivar ${suffix}`));
    const archived = await request(`/workflows/${viaWorkflow.id}/archive`, 'owner', 'POST');
    expect(archived.status).toBe(201);
    expect(archived.data).toMatchObject({ active: false, activationError: null });
    expect((await webhook(viaWorkflow.id)).status).toBe(409);
    expect((await request(`/workflows/${viaWorkflow.id}/execute`, 'owner', 'POST', { lead: sampleLead })).status).toBe(
      409,
    );
    const reactivate = await request(`/workflows/${viaWorkflow.id}/activate`, 'owner', 'POST', {
      activationRevision: await activationRevisionOf(viaWorkflow.id),
    });
    expect(reactivate.status).toBe(400);
    // Restaurar não religa: a pessoa ativa de novo.
    await request(`/workflows/${viaWorkflow.id}/unarchive`, 'owner', 'POST');
    expect((await db.workflow.findUniqueOrThrow({ where: { id: viaWorkflow.id } })).active).toBe(false);

    const viaProject = await publishedFlow(webhookFlow(`Arquivar projeto ${suffix}`));
    const row = await db.workflow.findUniqueOrThrow({ where: { id: viaProject.id } });
    const done = await request(`/workflows/${viaProject.id}/archive-revision`, 'owner', 'POST', {
      revision: row.revision,
    });
    expect(done.status).toBe(201);
    expect(done.data).toMatchObject({ active: false });
    // Arquivado por escritor antigo (só archivedAt, ainda ativo): o ingresso recusa mesmo assim.
    const legacy = await publishedFlow(webhookFlow(`Arquivado antigo ${suffix}`));
    await db.workflow.update({ where: { id: legacy.id }, data: { archivedAt: new Date() } });
    const refused = await webhook(legacy.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).message).toMatch(/arquivado/);
    expect(await db.execution.count({ where: { workflowId: { in: [viaWorkflow.id, viaProject.id, legacy.id] } } })).toBe(
      0,
    );
  });

  it('isola duas empresas', async () => {
    const mine = await publishedFlow(webhookFlow(`Empresa A ${suffix}`));
    const theirs = await publishedFlow(webhookFlow(`Empresa B ${suffix}`), 'other');
    for (const action of ['activate', 'deactivate'])
      expect(
        (await request(`/workflows/${mine.id}/${action}`, 'other', 'POST', {
          activationRevision: await activationRevisionOf(mine.id),
        }))
          .status,
      ).toBe(404);
    expect(
      (
        await request(`/workflows/${theirs.id}/deactivate`, 'owner', 'POST', {
          activationRevision: await activationRevisionOf(theirs.id),
        })
      ).status,
    ).toBe(404);
    const off = await request(`/workflows/${theirs.id}/deactivate`, 'other', 'POST', {
      activationRevision: await activationRevisionOf(theirs.id),
    });
    expect(off.status).toBe(201);
    expect((await db.workflow.findUniqueOrThrow({ where: { id: mine.id } })).active).toBe(true);
    expect((await request('/workflows')).data.some((w: { id: string }) => w.id === theirs.id)).toBe(false);
  });

  it('erro de ativação fica salvo no fluxo com ação sugerida (quarentena, credencial, sem versão)', async () => {
    const { id } = await publishedFlow(whatsappFlow(`Quarentena ${suffix}`, connection.id));
    await request(`/workflows/${id}/deactivate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(id) });
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { quarantinedAt: new Date(), quarantineReason: 'PROVIDER_STATUS_401', enabled: false },
    });
    try {
      const failed = await request(`/workflows/${id}/activate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(id) });
      expect(failed.status).toBe(422);
      expect(failed.data).toMatchObject({
        code: 'ACTIVATION_FAILED',
        activationError: { code: 'WHATSAPP_ACCOUNT_QUARANTINED', nodeId: 'trigger' },
        workflow: { active: false },
      });
      expect(failed.data.activationError.action).toMatch(/quarentena/);
      const stored = (await request(`/workflows/${id}`)).data;
      expect(stored.active).toBe(false);
      expect(stored.activationError.code).toBe('WHATSAPP_ACCOUNT_QUARANTINED');
      expect(stored.activationRevision).toBe(failed.data.workflow.activationRevision);
    } finally {
      await db.whatsAppConnection.update({
        where: { id: connection.id },
        data: { quarantinedAt: null, quarantineReason: null, enabled: true },
      });
    }
    const ok = await request(`/workflows/${id}/activate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(id) });
    expect(ok.status).toBe(201);
    expect(ok.data).toMatchObject({ active: true, activationError: null });

    const missing = await publishedFlow(webhookFlow(`Credencial ${suffix}`, 'nao-configurada'));
    await request(`/workflows/${missing.id}/deactivate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(missing.id) });
    const credential = await request(`/workflows/${missing.id}/activate`, 'owner', 'POST', {
      activationRevision: await activationRevisionOf(missing.id),
    });
    expect(credential.status).toBe(422);
    expect(credential.data.activationError.code).toBe('WEBHOOK_CREDENTIAL_MISSING');
    // Desativar de propósito limpa o aviso.
    const cleared = await request(`/workflows/${missing.id}/deactivate`, 'owner', 'POST', {
      activationRevision: await activationRevisionOf(missing.id),
    });
    expect(cleared.data).toMatchObject({ active: false, activationError: null });

    const draftOnly = await request('/workflows', 'owner', 'POST', { template: 'sdr', name: `Sem versão ${suffix}` });
    const none = await request(`/workflows/${draftOnly.data.id}/activate`, 'owner', 'POST', {
      activationRevision: draftOnly.data.activationRevision,
    });
    expect(none.status).toBe(400);
    expect(none.data.message).toMatch(/Publique uma versão/);
  });

  it('mensagem de WhatsApp não é roteada nem executada para fluxo inativo; o SAIR segue capturado', async () => {
    const { id, version } = await publishedFlow(whatsappFlow(`WhatsApp ${suffix}`, connection.id));
    await request(`/workflows/${id}/deactivate`, 'owner', 'POST', { activationRevision: await activationRevisionOf(id) });
    const messageId = `inactive-${suffix}`;
    const phone = stalePhone();
    const routed = await request(`/integrations/whatsapp/${connection.id}/simulate`, 'owner', 'POST', {
      kind: 'MESSAGE',
      id: messageId,
      from: '5511987650001',
      text: 'Olá, quero saber mais',
    });
    expect(routed.status).toBe(201);
    const event = await db.whatsAppEvent.findFirstOrThrow({
      where: { connectionId: connection.id, providerEventId: messageId },
    });
    expect(event.routing).not.toContain(version.id);
    // Roteado antes da desativação: o worker confere de novo e não cria execução.
    const stale = await db.whatsAppEvent.create({
      data: {
        connectionId: connection.id,
        providerEventId: `stale-${suffix}`,
        kind: 'MESSAGE',
        payload: { from: phone, text: 'SAIR' },
        routing: [version.id],
        status: 'PENDING',
      },
    });
    const processed = await drain(stale.id);
    expect(processed).toMatchObject({ status: 'IGNORED', errorCode: 'WORKFLOW_INACTIVE' });
    expect(await db.execution.count({ where: { workflowId: id } })).toBe(0);
    // O descadastro (fluxo do sistema) não depende do interruptor do fluxo comum.
    expect(await db.optOutEvent.count({ where: { sourceEventId: stale.id } })).toBe(1);
  });

  it('corrida: SAIR roteado para fluxo desativado durante o processamento é gravado e o evento não falha', async () => {
    const { id, version } = await publishedFlow(whatsappFlow(`Corrida ${suffix}`, connection.id));
    const phone = stalePhone();
    const event = await db.whatsAppEvent.create({
      data: {
        connectionId: connection.id,
        providerEventId: `race-${suffix}`,
        kind: 'MESSAGE',
        payload: { from: phone, text: 'SAIR' },
        routing: [version.id],
        status: 'PENDING',
      },
    });
    // Outra conexão desativa o fluxo e segura a transação: o inbox espera o bloqueio e decide pelo
    // estado confirmado, sem derrubar a captura do SAIR.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const deactivation = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Workflow" WHERE "id"=${id} FOR UPDATE`;
        await tx.workflow.update({ where: { id }, data: { active: false, activationRevision: { increment: 1 } } });
        locked();
        await held;
      },
      { timeout: 20000 },
    );
    await lockTaken;
    const processing = drain(event.id);
    await new Promise((r) => setTimeout(r, 400));
    release();
    await deactivation;
    const processed = await processing;
    expect(processed.status).not.toBe('FAILED');
    expect(processed).toMatchObject({ status: 'IGNORED', errorCode: 'WORKFLOW_INACTIVE' });
    expect(await db.optOutEvent.count({ where: { sourceEventId: event.id } })).toBe(1);
    expect(await db.execution.count({ where: { workflowId: id } })).toBe(0);

    // O fluxo fica inativo entre a leitura e o enfileiramento: enqueueInTransaction lança antes de
    // escrever e a transação que já gravou o descadastro continua e confirma.
    const marker = `race-direct-${suffix}`;
    await db.$transaction(async (tx) => {
      await tx.webhookIngressLog.create({
        data: { organizationId: 'org-local', source: 'WHATSAPP', resourceId: marker, outcome: 'ACCEPTED', code: 'TEST' },
      });
      await expect(
        enqueueInTransaction(tx, {
          organizationId: 'org-local',
          workflowId: id,
          versionId: version.id,
          eventKey: marker,
          leadData: sampleLead,
        }),
      ).rejects.toBeInstanceOf(WorkflowInactiveError);
      await tx.webhookIngressLog.create({
        data: { organizationId: 'org-local', source: 'WHATSAPP', resourceId: marker, outcome: 'ACCEPTED', code: 'TEST' },
      });
    });
    expect(await db.webhookIngressLog.count({ where: { resourceId: marker } })).toBe(2);
    expect(await db.lead.count({ where: { workflowId: id } })).toBe(0);
  });

  it('checagem final: enfileirar direto num fluxo inativo não cria nada; evento para dois fluxos executa só o ativo', async () => {
    const inactive = await publishedFlow(whatsappFlow(`Dois inativo ${suffix}`, connection.id));
    const active = await publishedFlow(whatsappFlow(`Dois ativo ${suffix}`, connection.id));
    await request(`/workflows/${inactive.id}/deactivate`, 'owner', 'POST', {
      activationRevision: await activationRevisionOf(inactive.id),
    });
    await expect(
      enqueueWorkflowExecution({
        prisma: db,
        organizationId: 'org-local',
        workflowId: inactive.id,
        eventKey: `direct-${suffix}`,
        leadData: sampleLead,
      }),
    ).rejects.toBeInstanceOf(WorkflowInactiveError);
    expect(await db.lead.count({ where: { workflowId: inactive.id } })).toBe(0);
    expect(await db.execution.count({ where: { workflowId: inactive.id } })).toBe(0);
    // Pela API a mesma condição vira 409 WORKFLOW_INACTIVE.
    const api = await request(`/workflows/${inactive.id}/execute`, 'owner', 'POST', { lead: sampleLead });
    expect(api).toMatchObject({ status: 409, data: { code: 'WORKFLOW_INACTIVE' } });

    const event = await db.whatsAppEvent.create({
      data: {
        connectionId: connection.id,
        providerEventId: `two-${suffix}`,
        kind: 'MESSAGE',
        payload: { from: stalePhone(), text: 'Olá' },
        routing: [inactive.version.id, active.version.id],
        status: 'PENDING',
      },
    });
    const processed = await drain(event.id);
    expect(processed).toMatchObject({ status: 'COMPLETED', errorCode: 'SOME_WORKFLOWS_INACTIVE' });
    expect(await db.execution.count({ where: { workflowId: active.id } })).toBe(1);
    expect(await db.execution.count({ where: { workflowId: inactive.id } })).toBe(0);
  });
});

describe.sequential('Testar até este bloco (simulação parcial no servidor)', () => {
  let id: string;
  let revision: number;
  beforeAll(async () => {
    const created = await request('/workflows', 'owner', 'POST', { template: 'sdr', name: `Parcial ${suffix}` });
    id = created.data.id;
    const draft = createSdrTemplate();
    // Bloco depois do alvo incompleto e um bloco solto: a simulação completa é recusada.
    draft.nodes = draft.nodes.map((n) => (n.id === 'notify' ? { ...n, config: { message: '' } } : n));
    draft.nodes.push({ ...draft.nodes.find((n) => n.id === 'tag')!, id: 'loose', position: { x: 0, y: 600 } });
    const saved = await request(`/workflows/${id}`, 'owner', 'PATCH', { revision: created.data.revision, draft });
    expect(saved.status).toBe(200);
    revision = saved.data.revision;
  });

  it('roda só até o bloco, sem criar execução real', async () => {
    const executions = await db.execution.count({ where: { workflowId: id } });
    const full = await request(`/workflows/${id}/simulate`, 'editor', 'POST', { revision, lead: sampleLead });
    expect(full.status).toBe(400);
    const partial = await request(`/workflows/${id}/simulate`, 'editor', 'POST', {
      revision,
      lead: sampleLead,
      targetNodeId: 'tag',
    });
    expect(partial.status).toBe(201);
    expect(partial.data).toMatchObject({ mode: 'simulation', targetNodeId: 'tag', reachedTarget: true });
    const ran = partial.data.steps.filter((s: { status: string }) => s.status !== 'skipped');
    expect(ran.map((s: { nodeId: string }) => s.nodeId)).toEqual(['trigger', 'qualify', 'assign', 'tag']);
    expect(await db.simulation.findUniqueOrThrow({ where: { id: partial.data.id } })).toMatchObject({
      workflowId: id,
      targetNodeId: 'tag',
      reachedTarget: true,
    });
    const history = (await request(`/workflows/${id}/simulations`)).data;
    expect(history.find((s: { id: string }) => s.id === partial.data.id)).toMatchObject({ targetNodeId: 'tag' });
    expect(await db.execution.count({ where: { workflowId: id } })).toBe(executions);
    const other = await request(`/workflows/${id}/simulate`, 'owner', 'POST', {
      revision,
      lead: { ...sampleLead, budget: 10 },
      targetNodeId: 'tag',
    });
    expect(other.data.reachedTarget).toBe(false);
  });

  it('valida o bloco no servidor: inexistente, não alcançável, incompleto, permissão e empresa', async () => {
    const call = (body: object, role = 'owner') =>
      request(`/workflows/${id}/simulate`, role, 'POST', { revision, lead: sampleLead, ...body });
    const missing = await call({ targetNodeId: 'nao-existe' });
    expect(missing.status).toBe(400);
    expect(missing.data.message).toMatch(/não existe/);
    const loose = await call({ targetNodeId: 'loose' });
    expect(loose.status).toBe(400);
    expect(loose.data.message).toMatch(/não está ligado ao gatilho/);
    const incomplete = await call({ targetNodeId: 'notify' });
    expect(incomplete.status).toBe(400);
    expect(incomplete.data.issues.length).toBeGreaterThan(0);
    expect((await call({ targetNodeId: 'tag' }, 'viewer')).status).toBe(403);
    expect((await call({ targetNodeId: 'tag' }, 'other')).status).toBe(404);
    expect((await call({ targetNodeId: 'tag', revision: revision - 1 })).status).toBe(409);
    expect((await call({ targetNodeId: '' })).status).toBe(400);
  });
});
