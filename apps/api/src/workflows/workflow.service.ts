
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createSdrTemplate, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import { simulateWorkflow } from '@eimax/workflow-engine';
import { hash, json, saveSchema, simulateSchema } from './contracts';

@Injectable()
export class WorkflowService {
  readonly db = new PrismaClient();
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
      include: { _count: { select: { versions: true, simulations: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: (r.draft as unknown as Workflow).name,
      nodeCount: (r.draft as unknown as Workflow).nodes.length,
      updatedAt: r.updatedAt,
      revision: r.revision,
      versions: r._count.versions,
      simulations: r._count.simulations,
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
}
