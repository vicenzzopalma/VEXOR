import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createSdrTemplate, type Workflow } from '@eimax/workflow-schema';
import { json } from './contracts';
import { WorkflowService } from './workflow.service';

export function normalizedProjectName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

type ProjectInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
};

@Injectable()
export class ProjectService {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  get db() {
    return this.workflows.db;
  }

  async get(id: string, organizationId: string) {
    const row = await this.db.project.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Projeto não encontrado. Volte à lista de projetos.');
    return row;
  }

  async list(organizationId: string) {
    const rows = await this.db.project.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { workflows: { where: { archivedAt: null } } } },
        workflows: {
          select: {
            updatedAt: true,
            executions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          },
        },
      },
    });
    return rows.map(({ workflows, _count, ...project }) => ({
      ...project,
      workflowCount: _count.workflows,
      lastActivityAt: new Date(
        Math.max(
          project.updatedAt.getTime(),
          ...workflows.flatMap((w) => [
            w.updatedAt.getTime(),
            ...w.executions.map((e) => e.createdAt.getTime()),
          ]),
        ),
      ),
    }));
  }

  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'Já existe um projeto com este nome, inclusive entre os arquivados. Escolha outro nome ou restaure o projeto.',
        );
      throw error;
    }
  }

  create(organizationId: string, input: ProjectInput) {
    return this.unique(() =>
      this.db.project.create({
        data: {
          ...input,
          name: input.name.trim().replace(/\s+/gu, ' '),
          normalizedName: normalizedProjectName(input.name),
          organizationId,
        },
      }),
    );
  }

  async lockProject(tx: Prisma.TransactionClient, id: string, organizationId: string, active = true) {
    const rows = await tx.$queryRaw<
      Array<{ archivedAt: Date | null }>
    >`SELECT "archivedAt" FROM "Project" WHERE "id"=${id} AND "organization_id"=${organizationId} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException('Projeto não encontrado.');
    if (active && rows[0].archivedAt)
      throw new BadRequestException('Restaure o projeto antes de alterar seus fluxos.');
  }

  update(
    id: string,
    organizationId: string,
    revision: number,
    input: Partial<ProjectInput> & { archivedAt?: Date | null },
  ) {
    return this.unique(() =>
      this.db.$transaction(async (tx) => {
        await this.lockProject(tx, id, organizationId, false);
        const result = await tx.project.updateMany({
          where: { id, organizationId, revision },
          data: {
            ...input,
            ...(input.name
              ? {
                  name: input.name.trim().replace(/\s+/gu, ' '),
                  normalizedName: normalizedProjectName(input.name),
                }
              : {}),
            revision: { increment: 1 },
          },
        });
        if (!result.count)
          throw new ConflictException(
            'O projeto mudou em outra aba. Recarregue os dados antes de tentar novamente.',
          );
        return tx.project.findUniqueOrThrow({ where: { id } });
      }),
    );
  }

  async listWorkflows(id: string, organizationId: string) {
    await this.get(id, organizationId);
    return this.workflows.list(organizationId, id);
  }

  createWorkflow(id: string, organizationId: string, name: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockProject(tx, id, organizationId);
      return tx.workflow.create({
        data: { organizationId, projectId: id, draft: json({ ...createSdrTemplate(), name }) },
      });
    });
  }

  async changeWorkflow(
    id: string,
    organizationId: string,
    revision: number,
    action: 'rename' | 'move' | 'duplicate' | 'archive' | 'restore',
    input: { name?: string; projectId?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.workflow.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException('Fluxo não encontrado.');
      // Consistent ordering avoids deadlocks on concurrent moves between two projects.
      for (const projectId of [
        ...new Set([existing.projectId, ...(input.projectId ? [input.projectId] : [])]),
      ].sort())
        await this.lockProject(tx, projectId, organizationId);
      await tx.$queryRaw`SELECT "id" FROM "Workflow" WHERE "id"=${id} AND "organization_id"=${organizationId} FOR UPDATE`;
      const current = await tx.workflow.findFirst({ where: { id, organizationId } });
      if (!current || current.revision !== revision || current.projectId !== existing.projectId)
        throw new ConflictException('O fluxo mudou em outra aba. Recarregue antes de continuar.');
      if (current.archivedAt && action !== 'restore')
        throw new BadRequestException('Restaure o fluxo antes de alterá-lo.');
      const draft = current.draft as unknown as Workflow;
      if (action === 'duplicate')
        return tx.workflow.create({
          data: {
            organizationId,
            projectId: input.projectId ?? current.projectId,
            draft: json({ ...draft, name: input.name ?? `${draft.name} (cópia)` }),
          },
        });
      const changed = await tx.workflow.updateMany({
        where: { id, organizationId, revision },
        data: {
          revision: { increment: 1 },
          ...(action === 'rename' ? { draft: json({ ...draft, name: input.name! }) } : {}),
          ...(action === 'move' ? { projectId: input.projectId } : {}),
          ...(action === 'archive' ? { archivedAt: new Date() } : {}),
          ...(action === 'restore' ? { archivedAt: null } : {}),
        },
      });
      if (!changed.count)
        throw new ConflictException('O fluxo mudou em outra aba. Recarregue antes de continuar.');
      return tx.workflow.findUniqueOrThrow({ where: { id } });
    });
  }
}
