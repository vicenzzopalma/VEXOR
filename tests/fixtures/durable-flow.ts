import { PrismaClient } from '@prisma/client';
import { catalog, type Workflow, type BlockType, sampleLead } from '@eimax/workflow-schema';
import { enqueueWorkflowExecution, enqueueInTransaction } from '@eimax/workflow-runtime';
import { randomUUID } from 'node:crypto';

export async function durableFixture(
  db: PrismaClient,
  seconds = 1,
  organizationId?: string,
  availableAt?: Date,
) {
  const organization = organizationId
    ? { id: organizationId }
    : await db.organization.create({ data: { name: 'Verificação local Fase 6A' } });
  const member = await db.membership.create({
    data: { organizationId: organization.id, displayName: 'Responsável de teste 6A', role: 'editor' },
  });
  const types: BlockType[] = ['lead.created', 'tag.add', 'wait', 'sdr.assign', 'manager.notify'];
  const flow: Workflow = {
    schemaVersion: 1,
    name: `Espera durável ${randomUUID()}`,
    nodes: types.map((type, i) => ({
      id: `n${i}`,
      type,
      name: ['Lead recebido', 'Aplicar etiqueta', 'Esperar', 'Atualizar lead', 'Registrar conclusão'][i],
      description: '',
      position: { x: 100, y: i * 180 },
      config:
        type === 'wait'
          ? { mode: 'duration', amount: seconds, unit: 'seconds' }
          : type === 'sdr.assign'
            ? { team: `membership:${member.id}` }
            : type === 'manager.notify'
              ? { message: 'Concluído para {{lead.name}} com {{steps.n3.assignedTo}}' }
              : { ...catalog[type].defaults },
    })),
    edges: types.slice(1).map((_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}` })),
  };
  const workflow = await db.workflow.create({ data: { organizationId: organization.id, draft: flow } });
  const version = await db.workflowVersion.create({
    data: { organizationId: organization.id, workflowId: workflow.id, number: 1, snapshot: flow },
  });
  const params = {
    prisma: db,
    organizationId: organization.id,
    workflowId: workflow.id,
    eventKey: randomUUID(),
    leadData: { ...sampleLead, name: 'Lead de teste durável' },
  };
  const { execution } = availableAt
    ? await db.$transaction(async (tx) => {
        const result = await enqueueInTransaction(tx, params);
        return {
          ...result,
          execution: await tx.execution.update({
            where: { id: result.execution.id },
            data: { availableAt },
            include: { steps: true },
          }),
        };
      })
    : await enqueueWorkflowExecution(params);
  return { organization, member, flow, workflow, version, execution, params };
}
