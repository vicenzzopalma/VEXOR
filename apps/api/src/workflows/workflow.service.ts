import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createSdrTemplate, triggerTypes, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import {
  partialIssues,
  reachableFromTrigger,
  simulateUntil,
  simulateWorkflow,
} from '@eimax/workflow-engine';
import {
  executeSchema,
  hash,
  json,
  loginSchema,
  registerSchema,
  saveSchema,
  simulateSchema,
  executionSearchSchema,
} from './contracts';
import { processWorkflowExecution } from './runner';
import { validateConnections, resumeDueExecution, WorkflowInactiveError } from '@eimax/workflow-runtime';
import { equalSecret, verifySignature } from '@eimax/connectors';
import { encryptCpf, hashPassword, MemoryRateLimiter, validCpf, verifyPassword } from '../common/security';

/** Erro de ativação salvo no fluxo e mostrado no cabeçalho do editor. */
export type ActivationError = {
  code: string;
  message: string;
  action: string;
  nodeId?: string;
  at: string;
};
type ActivationProblem = Omit<ActivationError, 'at'>;

/** Resposta do ingresso quando o fluxo está desativado: 409, sem criar execução, registrada no log. */
export const inactiveError = (archived = false) =>
  new ConflictException({
    message: archived
      ? 'Este fluxo está arquivado e não aceita eventos. Restaure e ative o fluxo para voltar a recebê-los.'
      : 'Este fluxo está inativo e não aceita eventos. Ative-o no editor para voltar a recebê-los.',
    code: 'WORKFLOW_INACTIVE',
  });

/** Dados que desligam o fluxo ao arquivar (mesma transação do arquivamento). */
export const archiveDeactivation = (wasActive: boolean) => ({
  active: false,
  activationError: Prisma.DbNull,
  activationRevision: { increment: 1 },
  ...(wasActive ? { activeChangedAt: new Date() } : {}),
});

const connectionProblems: Record<string, Omit<ActivationProblem, 'nodeId'>> = {
  EMAIL_CONNECTION_UNAVAILABLE: {
    code: 'EMAIL_ACCOUNT_UNAVAILABLE',
    message: 'Uma conta de e-mail usada pela versão publicada não está conectada.',
    action: 'Conecte a conta em Integrações ou escolha outra no bloco de e-mail e publique de novo.',
  },
  WHATSAPP_CONNECTION_UNAVAILABLE: {
    code: 'WHATSAPP_ACCOUNT_UNAVAILABLE',
    message: 'Uma conta de WhatsApp usada pela versão publicada está desconectada ou desligada.',
    action: 'Conecte a conta em Integrações › WhatsApp ou escolha outra no bloco e publique de novo.',
  },
  WHATSAPP_TEMPLATE_NOT_APPROVED: {
    code: 'WHATSAPP_TEMPLATE_NOT_APPROVED',
    message: 'Um template de WhatsApp da versão publicada não está aprovado para a conta escolhida.',
    action: 'Escolha um template aprovado no bloco e publique de novo.',
  },
  WHATSAPP_CONVERSATION_EVENT_NOT_SUPPORTED: {
    code: 'TRIGGER_UNSUPPORTED',
    message: 'O gatilho “Conversa iniciada” ainda não recebe eventos reais.',
    action: 'Troque o gatilho por “Mensagem recebida” e publique de novo.',
  },
};

@Injectable()
export class WorkflowService {
  readonly db = new PrismaClient();
  readonly rateLimiter = new MemoryRateLimiter(5, 15 * 60 * 1000);

  async onModuleInit() {
    await this.db.$connect();
    const testDatabase = /_test$/.test(new URL(process.env.DATABASE_URL!).pathname);
    for (const [id, name] of [
      ['org-local', 'Meu espaço de trabalho'],
      ...(testDatabase ? [['org-other', 'Empresa de teste isolada']] : []),
    ])
      await this.db.organization.upsert({ where: { id }, update: {}, create: { id, name } });
    for (const name of ['owner', 'editor', 'viewer', ...(testDatabase ? ['other'] : [])]) {
      const token = process.env[`DEV_${name.toUpperCase()}_TOKEN`];
      if (!token) throw new Error('Inicie com npm run dev para gerar sessões locais.');
      const organizationId = name === 'other' ? 'org-other' : 'org-local';
      const role = name === 'other' ? 'owner' : name;
      await this.db.membership.upsert({
        where: { id: `dev-${name}` },
        update: {},
        create: { id: `dev-${name}`, organizationId, role, displayName: `Pessoa ${name} de desenvolvimento` },
      });
      await this.db.developmentSession.upsert({
        where: { tokenHash: hash(token) },
        update: {},
        create: { tokenHash: hash(token), membershipId: `dev-${name}` },
      });
    }
    if (testDatabase)
      await this.db.workflow.upsert({
        where: { id: 'starter-sdr' },
        update: {},
        create: { id: 'starter-sdr', organizationId: 'org-local', draft: json(createSdrTemplate()) },
      });
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }

  async get(id: string, organizationId: string) {
    const row = await this.db.workflow.findFirst({
      where: { id, organizationId },
      include: {
        project: true,
        versions: { select: { id: true, number: true, createdAt: true }, orderBy: { number: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Processo não encontrado.');
    return row;
  }

  async list(organizationId: string, projectId?: string) {
    const rows = await this.db.workflow.findMany({
      where: { organizationId, ...(projectId ? { projectId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { versions: true, simulations: true, executions: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      name: (r.draft as unknown as Workflow).name,
      nodeCount: (r.draft as unknown as Workflow).nodes.length,
      updatedAt: r.updatedAt,
      revision: r.revision,
      archivedAt: r.archivedAt,
      active: r.active,
      activationRevision: r.activationRevision,
      activationError: r.activationError as ActivationError | null,
      versions: r._count.versions,
      simulations: r._count.simulations,
      executions: r._count.executions,
    }));
  }

  async archive(id: string, organizationId: string) {
    const flow = await this.get(id, organizationId);
    if (flow.archivedAt) return flow;
    // Arquivar desliga os gatilhos na mesma escrita; restaurar não religa (a pessoa ativa de novo).
    return this.db.workflow.update({
      where: { id },
      data: { archivedAt: new Date(), ...archiveDeactivation(flow.active) },
    });
  }

  async unarchive(id: string, organizationId: string) {
    await this.get(id, organizationId);
    return this.db.workflow.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  async save(id: string, organizationId: string, body: z.infer<typeof saveSchema>) {
    return this.db.$transaction(async (tx) => {
      const projects = await tx.$queryRaw<
        Array<{ archivedAt: Date | null }>
      >`SELECT p."archivedAt" FROM "Project" p JOIN "Workflow" w ON w."project_id"=p."id" AND w."organization_id"=p."organization_id" WHERE w."id"=${id} AND w."organization_id"=${organizationId} FOR UPDATE OF p`;
      if (projects[0]?.archivedAt)
        throw new BadRequestException('Restaure o projeto antes de editar seus fluxos.');
      const exists = await tx.workflow.findFirst({ where: { id, organizationId } });
      if (!exists) throw new NotFoundException('Processo não encontrado.');
      if (exists.archivedAt)
        throw new BadRequestException('Este processo está arquivado. Desarquive antes de alterar.');
      const updated = await tx.workflow.updateMany({
        where: { id, organizationId, revision: body.revision },
        data: { draft: json(body.draft), revision: { increment: 1 } },
      });
      if (!updated.count) {
        throw new ConflictException(
          'Este processo foi alterado em outra aba. Recarregue antes de continuar.',
        );
      }
      return tx.workflow.findFirstOrThrow({
        where: { id, organizationId },
        include: {
          versions: { select: { id: true, number: true, createdAt: true }, orderBy: { number: 'desc' } },
        },
      });
    });
  }

  async publish(id: string, organizationId: string, revision: number) {
    // A row lock serializes publish vs. save and simultaneous publish requests.
    return this.db.$transaction(async (tx) => {
      const projects = await tx.$queryRaw<
        Array<{ archivedAt: Date | null }>
      >`SELECT p."archivedAt" FROM "Project" p JOIN "Workflow" w ON w."project_id"=p."id" AND w."organization_id"=p."organization_id" WHERE w."id"=${id} AND w."organization_id"=${organizationId} FOR UPDATE OF p`;
      if (projects[0]?.archivedAt)
        throw new BadRequestException('Restaure o projeto antes de publicar seus fluxos.');
      const rows = await tx.$queryRaw<
        Array<{ draft: Workflow; revision: number; archivedAt: Date | null }>
      >`SELECT "draft", "revision", "archivedAt" FROM "Workflow" WHERE "id"=${id} AND "organization_id"=${organizationId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new NotFoundException('Processo não encontrado.');
      if (row.archivedAt)
        throw new BadRequestException('Este processo está arquivado. Desarquive antes de publicar.');
      if (row.revision !== revision)
        throw new ConflictException('Salve a versão mais recente antes de publicar.');
      const issues = validateWorkflow(row.draft);
      if (issues.length)
        throw new BadRequestException({ message: 'Revise o processo antes de publicar.', issues });
      try {
        await validateConnections(tx, row.draft, organizationId);
      } catch {
        throw new BadRequestException(
          'Revise as conexões: selecione uma conta conectada, um evento suportado e, quando necessário, um template aprovado.',
        );
      }
      const previous = await tx.workflowVersion.findFirst({
        where: { workflowId: id },
        orderBy: { number: 'desc' },
      });
      if (previous && JSON.stringify(previous.snapshot) === JSON.stringify(row.draft)) return previous;
      return tx.workflowVersion.create({
        data: {
          workflowId: id,
          organizationId,
          number: (previous?.number ?? 0) + 1,
          snapshot: json(row.draft),
        },
      });
    });
  }

  /** Primeiro problema que impede a versão publicada de receber eventos, ou null. */
  private async activationProblem(
    tx: Prisma.TransactionClient,
    flow: Workflow,
    organizationId: string,
  ): Promise<ActivationProblem | null> {
    const trigger = flow.nodes.find((n) => triggerTypes.includes(n.type));
    if (!trigger)
      return {
        code: 'TRIGGER_MISSING',
        message: 'A versão publicada não tem gatilho, então nada pode iniciar este fluxo.',
        action: 'Adicione um gatilho no rascunho e publique uma nova versão.',
      };
    const issues = validateWorkflow(flow);
    if (issues.length)
      return {
        code: 'VERSION_INVALID',
        message: `A versão publicada não passa na validação: ${issues[0].message}`,
        action: 'Corrija o rascunho e publique uma nova versão.',
        ...(issues[0].nodeId ? { nodeId: issues[0].nodeId } : {}),
      };
    if (trigger.type === 'webhook.received') {
      let credentials: Record<string, unknown> = {};
      try {
        credentials = JSON.parse(process.env.WEBHOOK_CREDENTIALS_JSON ?? '{}');
      } catch {
        /* Sem configuração legível, nenhuma credencial existe. */
      }
      const ref = String(trigger.config.credentialRef ?? '');
      if (!ref || !Object.hasOwn(credentials, `${organizationId}:${ref}`))
        return {
          code: 'WEBHOOK_CREDENTIAL_MISSING',
          message: `O gatilho “${trigger.name}” usa a credencial “${ref || 'vazia'}”, que não está configurada neste servidor.`,
          action:
            'Escolha no gatilho uma credencial de webhook configurada e publique de novo, ou peça ao administrador para cadastrá-la.',
          nodeId: trigger.id,
        };
    }
    for (const node of flow.nodes.filter(
      (n) =>
        n.type.startsWith('whatsapp.') && !['whatsapp.sdr.notify', 'whatsapp.lead.update'].includes(n.type),
    )) {
      const connection = await tx.whatsAppConnection.findFirst({
        where: { id: String(node.config.connectionId ?? ''), organizationId },
        select: { name: true, state: true, quarantinedAt: true },
      });
      if (!connection || connection.state === 'ARCHIVED')
        return {
          code: 'WHATSAPP_ACCOUNT_MISSING',
          message: `O bloco “${node.name}” usa uma conta de WhatsApp que não existe mais.`,
          action: 'Escolha uma conta conectada no bloco e publique uma nova versão.',
          nodeId: node.id,
        };
      if (connection.quarantinedAt)
        return {
          code: 'WHATSAPP_ACCOUNT_QUARANTINED',
          message: `A conta de WhatsApp “${connection.name}”, usada em “${node.name}”, está em quarentena.`,
          action:
            'Libere a quarentena em Integrações › WhatsApp, ou troque a conta no bloco e publique de novo; depois ative outra vez.',
          nodeId: node.id,
        };
    }
    try {
      await validateConnections(tx, flow, organizationId, true);
    } catch (error) {
      return (
        connectionProblems[(error as Error).message] ?? {
          code: 'CONNECTIONS_INVALID',
          message: 'As conexões usadas pela versão publicada não estão disponíveis.',
          action: 'Revise as contas escolhidas nos blocos e publique de novo.',
        }
      );
    }
    return null;
  }

  /** Estado de ativação devolvido ao editor e à lista de fluxos. */
  async activationState(id: string, organizationId: string) {
    const row = await this.db.workflow.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        activationRevision: true,
        active: true,
        activationError: true,
        activeChangedAt: true,
        versions: { select: { id: true, number: true }, orderBy: { number: 'desc' }, take: 1 },
      },
    });
    if (!row) throw new NotFoundException('Processo não encontrado.');
    const { versions, ...state } = row;
    return {
      ...state,
      activationError: state.activationError as ActivationError | null,
      activeVersion: versions[0] ?? null,
    };
  }

  /**
   * Ativa (volta a receber eventos com a versão publicada mais recente) ou desativa o fluxo.
   * Revisão otimista; o bloqueio da linha serializa com publicar, salvar e o ingresso (FOR SHARE).
   */
  async setActive(id: string, organizationId: string, activationRevision: number, active: boolean) {
    const outcome = await this.db.$transaction(async (tx) => {
      const projects = await tx.$queryRaw<
        Array<{ archivedAt: Date | null }>
      >`SELECT p."archivedAt" FROM "Project" p JOIN "Workflow" w ON w."project_id"=p."id" AND w."organization_id"=p."organization_id" WHERE w."id"=${id} AND w."organization_id"=${organizationId} FOR UPDATE OF p`;
      if (projects[0]?.archivedAt)
        throw new BadRequestException('Restaure o projeto antes de ativar ou desativar seus fluxos.');
      const rows = await tx.$queryRaw<
        Array<{ activationRevision: number; archivedAt: Date | null; active: boolean; activationError: unknown }>
      >`SELECT "activationRevision", "archivedAt", "active", "activationError" FROM "Workflow" WHERE "id"=${id} AND "organization_id"=${organizationId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new NotFoundException('Processo não encontrado.');
      if (row.archivedAt)
        throw new BadRequestException('Este processo está arquivado. Desarquive antes de ativar ou desativar.');
      // Revisão própria do interruptor: editar o rascunho em outra aba não conflita com ativar.
      if (row.activationRevision !== activationRevision)
        throw new ConflictException(
          'O estado Ativo deste fluxo mudou em outra aba. Recarregue antes de ativar ou desativar.',
        );
      if (!active) {
        if (!row.active && row.activationError === null) return { problem: null };
        await tx.workflow.update({
          where: { id },
          data: {
            active: false,
            activationError: Prisma.DbNull,
            activationRevision: { increment: 1 },
            ...(row.active ? { activeChangedAt: new Date() } : {}),
          },
        });
        return { problem: null };
      }
      const latest = await tx.workflowVersion.findFirst({
        where: { workflowId: id, organizationId },
        orderBy: { number: 'desc' },
      });
      if (!latest) throw new BadRequestException('Publique uma versão antes de ativar este fluxo.');
      const problem = await this.activationProblem(tx, latest.snapshot as unknown as Workflow, organizationId);
      const error: ActivationError | null = problem ? { ...problem, at: new Date().toISOString() } : null;
      await tx.workflow.update({
        where: { id },
        data: {
          active: !error,
          activationError: error ? json(error) : Prisma.DbNull,
          activationRevision: { increment: 1 },
          ...(row.active !== !error ? { activeChangedAt: new Date() } : {}),
        },
      });
      return { problem: error };
    });
    const state = await this.activationState(id, organizationId);
    if (outcome.problem)
      throw new UnprocessableEntityException({
        message: `${outcome.problem.message} ${outcome.problem.action}`,
        code: 'ACTIVATION_FAILED',
        activationError: outcome.problem,
        workflow: state,
      });
    return state;
  }

  async simulate(id: string, organizationId: string, body: z.infer<typeof simulateSchema>) {
    const row = await this.get(id, organizationId);
    if (row.revision !== body.revision) throw new ConflictException('Salve as alterações antes de simular.');
    const draft = row.draft as unknown as Workflow;
    const target = body.targetNodeId;
    if (target) {
      if (!draft.nodes.some((n) => n.id === target))
        throw new BadRequestException('O bloco escolhido não existe no rascunho salvo.');
      if (!reachableFromTrigger(draft, target))
        throw new BadRequestException('O bloco escolhido não está ligado ao gatilho. Conecte-o antes de testar.');
    }
    const issues = target ? partialIssues(draft, target) : validateWorkflow(draft);
    if (issues.length)
      throw new BadRequestException({
        message: target ? 'Revise o trecho até este bloco antes de testar.' : 'Revise o processo antes de testar.',
        issues,
      });
    const partial = target ? await simulateUntil(draft, body.lead, target) : undefined;
    const steps = partial ? partial.steps : await simulateWorkflow(draft, body.lead);
    const status = steps.some((s) => s.status === 'failed') ? 'failed' : 'success';
    const run = await this.db.simulation.create({
      data: {
        workflowId: id,
        organizationId,
        snapshot: json(draft),
        steps: json(steps),
        status,
        ...(target ? { targetNodeId: target, reachedTarget: partial!.reachedTarget } : {}),
      },
    });
    return {
      id: run.id,
      createdAt: run.createdAt,
      workflowName: draft.name,
      mode: 'simulation',
      status,
      steps,
      ...(target ? { targetNodeId: target, reachedTarget: partial!.reachedTarget } : {}),
    };
  }

  async runs(organizationId: string, workflowId?: string, projectId?: string) {
    const rows = await this.db.simulation.findMany({
      where: {
        organizationId,
        ...(workflowId ? { workflowId } : {}),
        ...(projectId ? { workflow: { projectId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      createdAt: r.createdAt,
      workflowName: (r.snapshot as unknown as Workflow).name,
      mode: 'simulation',
      status: r.status,
      steps: r.steps,
      ...(r.targetNodeId ? { targetNodeId: r.targetNodeId, reachedTarget: r.reachedTarget } : {}),
    }));
  }

  async execute(id: string, organizationId: string, body: z.infer<typeof executeSchema>) {
    const flow = await this.get(id, organizationId);
    if (flow.archivedAt || !flow.active) throw inactiveError(!!flow.archivedAt);
    const eventKey = body.eventKey ?? randomBytes(16).toString('hex');
    const result = await this.enqueue({
      prisma: this.db,
      organizationId,
      workflowId: id,
      eventKey,
      leadData: body.lead,
      versionId: body.versionId,
    });
    return {
      id: result.execution.id,
      workflowId: result.execution.workflowId,
      eventKey: result.execution.eventKey,
      status: result.execution.status,
      attempt: result.execution.attempt,
      result: result.execution.result,
      idempotentHit: result.idempotentHit,
      createdAt: result.execution.createdAt,
      finishedAt: result.execution.finishedAt,
      steps: result.execution.steps,
    };
  }

  async listExecutions(organizationId: string, workflowId?: string, projectId?: string) {
    return this.fetchExecutions(
      {
        organizationId,
        ...(workflowId ? { workflowId } : {}),
        ...(projectId ? { workflow: { projectId } } : {}),
      },
      50,
      0,
    );
  }

  async searchExecutions(
    organizationId: string,
    projectId: string | undefined,
    input: z.input<typeof executionSearchSchema>,
  ) {
    const where: Prisma.ExecutionWhereInput = {
      organizationId,
      ...(projectId ? { workflow: { projectId } } : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.until
        ? {
            createdAt: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.until ? { lt: new Date(input.until) } : {}),
            },
          }
        : {}),
    };
    const pageSize = 20;
    const page = input.page ?? 1;
    const [items, total] = await Promise.all([
      this.fetchExecutions(where, pageSize, (page - 1) * pageSize),
      this.db.execution.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  private async fetchExecutions(where: Prisma.ExecutionWhereInput, take: number, skip: number) {
    const rows = await this.db.execution.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
      include: {
        checkpoints: {
          orderBy: { suspendedAt: 'asc' },
          select: {
            id: true,
            nodeId: true,
            nextNodeId: true,
            versionId: true,
            resumeAt: true,
            expiresAt: true,
            status: true,
            suspendedAt: true,
            resumedAt: true,
            consumedAt: true,
            recoveryError: true,
          },
        },
        steps: { orderBy: { createdAt: 'asc' } },
        lead: {
          include: { assignedMembership: true },
        },
        notifications: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      eventKey: r.eventKey,
      status: r.status,
      attempt: r.attempt,
      checkpoints: r.checkpoints,
      versionId: r.versionId,
      errorCode: r.errorCode,
      attemptHistory: r.attemptHistory,
      durationMs: r.durationMs,
      result: r.result,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
      stepsCount: r.steps.length,
      leadSummary: r.lead
        ? {
            id: r.lead.id,
            name: r.lead.name,
            company: r.lead.company,
            status: r.lead.status,
            assignedTo: r.lead.assignedMembership?.displayName ?? null,
            tags: r.lead.tags,
          }
        : null,
      steps: r.steps,
      notifications: r.notifications,
    }));
  }

  async getExecution(id: string, organizationId: string) {
    const row = await this.db.execution.findFirst({
      where: { id, organizationId },
      include: {
        checkpoints: {
          orderBy: { suspendedAt: 'asc' },
          select: {
            id: true,
            nodeId: true,
            nextNodeId: true,
            versionId: true,
            resumeAt: true,
            expiresAt: true,
            status: true,
            suspendedAt: true,
            resumedAt: true,
            consumedAt: true,
            recoveryError: true,
          },
        },
        steps: { orderBy: { createdAt: 'asc' } },
        lead: {
          include: { assignedMembership: true },
        },
        notifications: true,
      },
    });
    if (!row) throw new NotFoundException('Execução não encontrada.');
    return {
      id: row.id,
      workflowId: row.workflowId,
      eventKey: row.eventKey,
      status: row.status,
      attempt: row.attempt,
      checkpoints: row.checkpoints,
      versionId: row.versionId,
      errorCode: row.errorCode,
      attemptHistory: row.attemptHistory,
      durationMs: row.durationMs,
      result: row.result,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      lead: row.lead
        ? {
            id: row.lead.id,
            name: row.lead.name,
            company: row.lead.company,
            email: row.lead.email ? '***@***' : '',
            budget: row.lead.budget,
            score: row.lead.score,
            status: row.lead.status,
            assignedTo: row.lead.assignedMembership?.displayName ?? null,
            tags: row.lead.tags,
          }
        : null,
      steps: row.steps,
      notifications: row.notifications,
    };
  }

  async resumeExecution(id: string, organizationId: string) {
    await this.getExecution(id, organizationId);
    const result = await resumeDueExecution(this.db, { executionId: id, organizationId });
    if (!result) throw new ConflictException('A execução não está aguardando uma retomada vencida.');
    return this.getExecution(id, organizationId);
  }

  async listLeads(organizationId: string, workflowId?: string, status?: string) {
    const leads = await this.db.lead.findMany({
      where: {
        organizationId,
        ...(workflowId ? { workflowId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        assignedMembership: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
        _count: {
          select: { executions: true, notifications: true },
        },
      },
    });

    return leads.map((l) => ({
      id: l.id,
      revision: l.revision,
      workflowId: l.workflowId,
      eventKey: l.eventKey,
      name: l.name,
      email: l.email,
      phone: l.phone,
      whatsappConsent: l.whatsappConsent,
      company: l.company,
      budget: l.budget,
      score: l.score,
      source: l.source,
      status: l.status,
      tags: l.tags,
      assignedMembership: l.assignedMembership,
      executionsCount: l._count.executions,
      notificationsCount: l._count.notifications,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  async getLead(id: string, organizationId: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedMembership: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            steps: { orderBy: { createdAt: 'asc' } },
          },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado.');
    const contact = lead.externalContactKey;
    const separator = contact?.indexOf(':') ?? -1;
    const connectionId = separator > 0 ? contact!.slice(0, separator) : undefined;
    const phone = separator > 0 ? contact!.slice(separator + 1) : undefined;
    const conversation =
      connectionId && phone
        ? await this.db.whatsAppEvent.findMany({
            where: {
              connectionId,
              connection: { organizationId },
              kind: 'MESSAGE',
              payload: { path: ['from'], equals: phone },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { id: true, createdAt: true, status: true, errorCode: true, payload: true },
          })
        : [];
    return {
      ...lead,
      conversation: conversation.map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        status: event.status,
        errorCode: event.errorCode,
        text: String((event.payload as { text?: string }).text ?? ''),
      })),
    };
  }

  async updateLead(
    id: string,
    organizationId: string,
    data: {
      expectedRevision: number;
      status?: string;
      assignedMembershipId?: string | null;
      tags?: string[];
      whatsappConsent?: boolean;
      phone?: string;
    },
  ) {
    const existing = await this.db.lead.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Lead não encontrado.');
    if (data.assignedMembershipId) {
      const eligible = await this.db.membership.findFirst({
        where: { id: data.assignedMembershipId, organizationId, role: { in: ['owner', 'editor'] } },
      });
      if (!eligible) throw new BadRequestException('Responsável indisponível nesta organização.');
    }
    try {
      return await this.db.lead.update({
        // PostgreSQL rechecks this predicate after a concurrent updater commits.
        // The trigger increments revision for every writer, including the worker.
        where: { id, organizationId, revision: data.expectedRevision },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.assignedMembershipId !== undefined
            ? { assignedMembershipId: data.assignedMembershipId }
            : {}),
          ...(data.tags ? { tags: data.tags } : {}),
          ...(data.whatsappConsent !== undefined ? { whatsappConsent: data.whatsappConsent } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
        },
        include: {
          assignedMembership: {
            select: { id: true, displayName: true, role: true },
          },
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') throw error;
      const scoped = await this.db.lead.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!scoped) throw new NotFoundException('Lead não encontrado.');
      throw new ConflictException(
        'Este lead foi atualizado em outra aba ou por uma automação. Recarregue os dados antes de salvar.',
      );
    }
  }

  async listNotifications(organizationId: string, leadId?: string) {
    const notifications = await this.db.notification.findMany({
      where: {
        organizationId,
        ...(leadId ? { leadId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        lead: {
          select: { id: true, name: true, company: true, status: true },
        },
      },
    });
    return notifications;
  }

  async register(input: z.infer<typeof registerSchema>) {
    if (!validCpf(input.cpf)) {
      throw new BadRequestException('CPF inválido.');
    }
    const cleanEmail = input.email.trim().toLowerCase();
    const existingUser = await this.db.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      throw new ConflictException('E-mail já cadastrado.');
    }
    const { ciphertext, fingerprint, last4 } = encryptCpf(input.cpf);
    const existingCpf = await this.db.user.findFirst({ where: { cpfFingerprint: fingerprint } });
    if (existingCpf) {
      throw new ConflictException('CPF já cadastrado.');
    }
    const passwordHash = hashPassword(input.password);

    return this.db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.companyName.trim() },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: cleanEmail,
          passwordHash,
          cpfCiphertext: ciphertext,
          cpfFingerprint: fingerprint,
          cpfLast4: last4,
          role: 'owner',
        },
      });
      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          displayName: input.companyName.trim(),
          role: 'owner',
        },
      });
      await tx.workflow.create({
        data: {
          organizationId: organization.id,
          draft: json(createSdrTemplate()),
        },
      });
      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          cpfLast4: user.cpfLast4,
          organizationId: organization.id,
          organizationName: organization.name,
        },
      };
    });
  }

  async login(input: z.infer<typeof loginSchema>) {
    const cleanEmail = input.email.trim().toLowerCase();
    const check = this.rateLimiter.check(cleanEmail);
    if (!check.allowed) {
      throw new HttpException(`Muitas tentativas. Aguarde ${check.retryAfterSec} segundos.`, 429);
    }
    const user = await this.db.user.findUnique({
      where: { email: cleanEmail },
      include: { organization: true },
    });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      this.rateLimiter.recordFailure(cleanEmail);
      throw new HttpException('Credenciais inválidas.', 401);
    }
    this.rateLimiter.reset(cleanEmail);

    const token = randomBytes(32).toString('hex');
    const tokenHash = hash(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        cpfLast4: user.cpfLast4,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    };
  }

  async logout(token: string) {
    if (token) {
      await this.db.session.deleteMany({
        where: { tokenHash: hash(token) },
      });
    }
    return { ok: true };
  }

  async handleWebhook(
    workflowId: string,
    secret: string | undefined,
    body: unknown,
    eventKeyHeader?: string,
    signing?: { raw: Buffer; signature: string; timestamp: string },
  ) {
    const flow = await this.db.workflow.findUnique({
      where: { id: workflowId },
    });
    if (!flow) throw new NotFoundException('Webhook ou processo não encontrado.');

    const published = await this.db.workflowVersion.findFirst({
      where: { workflowId, organizationId: flow.organizationId },
      orderBy: { number: 'desc' },
    });
    if (!published) throw new BadRequestException('Publique o processo antes de receber eventos.');
    const draft = published.snapshot as unknown as Workflow;
    const webhookNode = draft.nodes.find((n) => n.type === 'webhook.received');
    if (!webhookNode) {
      throw new BadRequestException('Este processo não possui um gatilho de webhook configurado.');
    }

    let credentials: Record<string, string | { secret: string; mode: 'hmac' }> = {};
    try {
      credentials = JSON.parse(process.env.WEBHOOK_CREDENTIALS_JSON ?? '{}');
    } catch {
      /* Fail closed on configuration errors. */
    }
    const credential = credentials[`${flow.organizationId}:${webhookNode.config.credentialRef}`];
    const authenticated =
      typeof credential === 'string'
        ? !!secret && equalSecret(secret, credential)
        : credential?.mode === 'hmac' &&
          typeof credential.secret === 'string' &&
          !!signing &&
          /^\d{10}$/.test(signing.timestamp) &&
          Math.abs(Date.now() / 1000 - Number(signing.timestamp)) <= 300 &&
          verifySignature(
            Buffer.concat([
              Buffer.from(`${signing.timestamp}.${eventKeyHeader ? `${eventKeyHeader}.` : ''}`),
              signing.raw,
            ]),
            signing.signature,
            credential.secret,
          );
    if (!authenticated) {
      throw new HttpException('Webhook não autorizado.', 401);
    }
    // Depois da autenticação, para não revelar o estado do fluxo a quem não tem a credencial.
    if (flow.archivedAt || !flow.active) throw inactiveError(!!flow.archivedAt);

    if (eventKeyHeader !== undefined && (!eventKeyHeader.length || eventKeyHeader.length > 200))
      throw new BadRequestException('Identificador de evento inválido.');
    const eventKey = eventKeyHeader ?? hash(JSON.stringify(body));
    const result = await this.enqueue({
      prisma: this.db,
      organizationId: flow.organizationId,
      workflowId,
      eventKey,
      leadData: body,
      versionId: published.id,
    });

    return {
      executionId: result.execution.id,
      status: result.execution.status,
      idempotentHit: result.idempotentHit,
    };
  }

  async enqueue(params: Parameters<typeof processWorkflowExecution>[0]) {
    try {
      return await processWorkflowExecution(params);
    } catch (error) {
      if (error instanceof WorkflowInactiveError) throw inactiveError(error.reason === 'archived');
      throw new BadRequestException(
        'Execução não enfileirada. Verifique a versão publicada, os dados e as conexões do processo.',
      );
    }
  }
}
