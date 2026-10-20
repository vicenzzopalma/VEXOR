import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createSdrTemplate, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import { simulateWorkflow } from '@eimax/workflow-engine';
import {
  executeSchema,
  hash,
  json,
  loginSchema,
  registerSchema,
  saveSchema,
  simulateSchema,
} from './contracts';
import { processWorkflowExecution } from './runner';
import { validateConnections } from '@eimax/workflow-runtime';
import { encryptCpf, hashPassword, MemoryRateLimiter, validCpf, verifyPassword } from '../common/security';

@Injectable()
export class WorkflowService {
  readonly db = new PrismaClient();
  readonly rateLimiter = new MemoryRateLimiter(5, 15 * 60 * 1000);

  async onModuleInit() {
    await this.db.$connect();
    for (const [id, name] of [
      ['org-local', 'Meu espaço de trabalho'],
      ['org-other', 'Empresa de teste isolada'],
    ])
      await this.db.organization.upsert({ where: { id }, update: {}, create: { id, name } });
    for (const name of ['owner', 'other', 'editor', 'viewer']) {
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
        versions: { select: { id: true, number: true, createdAt: true }, orderBy: { number: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Processo não encontrado.');
    return row;
  }

  async list(organizationId: string) {
    const rows = await this.db.workflow.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { versions: true, simulations: true, executions: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: (r.draft as unknown as Workflow).name,
      nodeCount: (r.draft as unknown as Workflow).nodes.length,
      updatedAt: r.updatedAt,
      revision: r.revision,
      versions: r._count.versions,
      simulations: r._count.simulations,
      executions: r._count.executions,
    }));
  }

  async save(id: string, organizationId: string, body: z.infer<typeof saveSchema>) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.workflow.updateMany({
        where: { id, organizationId, revision: body.revision },
        data: { draft: json(body.draft), revision: { increment: 1 } },
      });
      if (!updated.count) {
        const exists = await tx.workflow.findFirst({ where: { id, organizationId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Processo não encontrado.');
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
      const rows = await tx.$queryRaw<
        Array<{ draft: Workflow; revision: number }>
      >`SELECT "draft", "revision" FROM "Workflow" WHERE "id"=${id} AND "organization_id"=${organizationId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new NotFoundException('Processo não encontrado.');
      if (row.revision !== revision)
        throw new ConflictException('Salve a versão mais recente antes de publicar.');
      const issues = validateWorkflow(row.draft);
      if (issues.length)
        throw new BadRequestException({ message: 'Revise o processo antes de publicar.', issues });
      try {
        await validateConnections(tx, row.draft, organizationId);
      } catch {
        throw new BadRequestException(
          'Revise as conexões WhatsApp: conta conectada, evento suportado e template aprovado são obrigatórios.',
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

  async simulate(id: string, organizationId: string, body: z.infer<typeof simulateSchema>) {
    const row = await this.get(id, organizationId);
    if (row.revision !== body.revision) throw new ConflictException('Salve as alterações antes de simular.');
    const draft = row.draft as unknown as Workflow;
    const issues = validateWorkflow(draft);
    if (issues.length)
      throw new BadRequestException({ message: 'Revise o processo antes de testar.', issues });
    const steps = await simulateWorkflow(draft, body.lead);
    const status = steps.some((s) => s.status === 'failed') ? 'failed' : 'success';
    const run = await this.db.simulation.create({
      data: { workflowId: id, organizationId, snapshot: json(draft), steps: json(steps), status },
    });
    return {
      id: run.id,
      createdAt: run.createdAt,
      workflowName: draft.name,
      mode: 'simulation',
      status,
      steps,
    };
  }

  async runs(organizationId: string, workflowId?: string) {
    const rows = await this.db.simulation.findMany({
      where: { organizationId, ...(workflowId ? { workflowId } : {}) },
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
    }));
  }

  async execute(id: string, organizationId: string, body: z.infer<typeof executeSchema>) {
    await this.get(id, organizationId);
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

  async listExecutions(organizationId: string, workflowId?: string) {
    const rows = await this.db.execution.findMany({
      where: { organizationId, ...(workflowId ? { workflowId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
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
    return lead;
  }

  async updateLead(
    id: string,
    organizationId: string,
    data: {
      status?: string;
      assignedMembershipId?: string | null;
      tags?: string[];
      whatsappConsent?: boolean;
      phone?: string;
    },
  ) {
    await this.getLead(id, organizationId);
    if (data.assignedMembershipId) {
      const eligible = await this.db.membership.findFirst({
        where: { id: data.assignedMembershipId, organizationId, role: { in: ['owner', 'editor'] } },
      });
      if (!eligible) throw new BadRequestException('Responsável indisponível nesta organização.');
    }
    const updated = await this.db.lead.update({
      where: { id },
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
    return updated;
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

    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(process.env.WEBHOOK_CREDENTIALS_JSON ?? '{}');
    } catch {
      /* Fail closed on configuration errors. */
    }
    const expectedSecret = credentials[`${flow.organizationId}:${webhookNode.config.credentialRef}`];
    if (!expectedSecret || !secret || hash(secret) !== hash(expectedSecret)) {
      throw new HttpException('Webhook não autorizado.', 401);
    }

    if (eventKeyHeader && eventKeyHeader.length > 200)
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
    } catch {
      throw new BadRequestException(
        'Execução não enfileirada. Verifique a versão publicada, os dados e as conexões do processo.',
      );
    }
  }
}
