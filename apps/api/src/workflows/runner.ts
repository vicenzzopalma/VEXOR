import { PrismaClient, ExecutionStatus } from '@prisma/client';
import {
  leadSchema,
  validateWorkflow,
  type Workflow,
} from '@eimax/workflow-schema';
import {
  createProductionEffects,
  executeWorkflow,
  type EffectAdapter,
} from '@eimax/workflow-engine';

export interface ExecuteParams {
  prisma: PrismaClient;
  organizationId: string;
  workflowId: string;
  eventKey: string;
  leadData: unknown;
  versionId?: string;
  effects?: EffectAdapter;
}

export async function processWorkflowExecution(params: ExecuteParams) {
  const { prisma, organizationId, workflowId, eventKey, leadData, versionId, effects } = params;

  // 1. Idempotency check: if execution already exists, return it without re-running effects
  const existing = await prisma.execution.findUnique({
    where: {
      organizationId_workflowId_eventKey: {
        organizationId,
        workflowId,
        eventKey,
      },
    },
    include: {
      steps: { orderBy: { createdAt: 'asc' } },
      lead: { include: { assignedMembership: true } },
      notifications: true,
    },
  });

  if (existing) {
    return {
      execution: existing,
      idempotentHit: true,
    };
  }

  // 2. Validate and parse lead data
  const parsedLead = leadSchema.parse(leadData);

  // 3. Upsert Lead record in the database with structured fields
  const lead = await prisma.lead.upsert({
    where: {
      organizationId_workflowId_eventKey: {
        organizationId,
        workflowId,
        eventKey,
      },
    },
    update: {
      name: parsedLead.name || parsedLead.company,
      email: parsedLead.email || '',
      company: parsedLead.company,
      budget: parsedLead.budget ?? 0,
      score: parsedLead.score ?? 0,
      source: parsedLead.source || 'webhook',
      data: parsedLead as any,
    },
    create: {
      organizationId,
      workflowId,
      eventKey,
      name: parsedLead.name || parsedLead.company,
      email: parsedLead.email || '',
      company: parsedLead.company,
      budget: parsedLead.budget ?? 0,
      score: parsedLead.score ?? 0,
      source: parsedLead.source || 'webhook',
      status: 'NEW',
      tags: [],
      data: parsedLead as any,
    },
  });

  // 4. Resolve workflow definition: either published version or current draft
  let workflowDefinition: Workflow;
  let resolvedVersionId: string | undefined = versionId;

  if (versionId) {
    const version = await prisma.workflowVersion.findFirst({
      where: { id: versionId, organizationId, workflowId },
    });
    if (!version) throw new Error('Versão do processo não encontrada.');
    workflowDefinition = version.snapshot as unknown as Workflow;
  } else {
    // Check latest published version
    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId, organizationId },
      orderBy: { number: 'desc' },
    });
    if (latestVersion) {
      workflowDefinition = latestVersion.snapshot as unknown as Workflow;
      resolvedVersionId = latestVersion.id;
    } else {
      const flow = await prisma.workflow.findFirst({
        where: { id: workflowId, organizationId },
      });
      if (!flow) throw new Error('Processo não encontrado.');
      workflowDefinition = flow.draft as unknown as Workflow;
    }
  }

  const issues = validateWorkflow(workflowDefinition);
  if (issues.length) {
    throw new Error(`Processo inválido: ${issues.map((i) => i.message).join(', ')}`);
  }

  // 5. Create Execution record in RUNNING state
  const execution = await prisma.execution.create({
    data: {
      organizationId,
      workflowId,
      versionId: resolvedVersionId,
      leadId: lead.id,
      eventKey,
      status: ExecutionStatus.RUNNING,
      attempt: 1,
    },
  });

  try {
    // 6. Set up real production effects if custom effects are not provided
    const effectAdapter =
      effects ??
      createProductionEffects({
        assignSdr: async ({ team }) => {
          // Find real SDR / Member belonging to the organization
          const member = await prisma.membership.findFirst({
            where: {
              organizationId,
              role: { in: ['owner', 'editor'] },
            },
            include: { user: true },
            orderBy: { id: 'asc' },
          });

          if (member) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                assignedMembershipId: member.id,
                status: 'QUALIFIED',
              },
            });
          }

          return {
            assignedTo: member?.displayName || member?.user?.email || `SDR (${team})`,
          };
        },

        addTag: async ({ tag }) => {
          const currentLead = await prisma.lead.findUnique({
            where: { id: lead.id },
            select: { tags: true },
          });
          const existingTags: string[] = Array.isArray(currentLead?.tags)
            ? (currentLead.tags as string[])
            : [];
          const updatedTags = Array.from(new Set([...existingTags, tag]));

          await prisma.lead.update({
            where: { id: lead.id },
            data: { tags: updatedTags },
          });

          return { tags: updatedTags };
        },

        notifyManager: async ({ message }) => {
          const member = await prisma.membership.findFirst({
            where: { organizationId, role: { in: ['owner', 'editor'] } },
            include: { user: true },
            orderBy: { id: 'asc' },
          });

          const recipient = member?.user?.email || 'gestor@organizacao.com';
          const notification = await prisma.notification.create({
            data: {
              organizationId,
              leadId: lead.id,
              executionId: execution.id,
              channel: 'MANAGER_NOTIFICATION',
              recipient,
              title: `Alerta Comercial: Novo Lead ${parsedLead.name || parsedLead.company}`,
              message:
                message ||
                `Lead ${parsedLead.name || parsedLead.company} (Orçamento: R$ ${parsedLead.budget}) qualificado e pronto para atendimento.`,
              status: 'DELIVERED',
            },
          });

          return { delivered: true, notificationId: notification.id };
        },

        sendEmail: async ({ to, subject, body }) => {
          const notification = await prisma.notification.create({
            data: {
              organizationId,
              leadId: lead.id,
              executionId: execution.id,
              channel: 'EMAIL',
              recipient: to || parsedLead.email,
              title: subject,
              message: body,
              status: 'DELIVERED',
            },
          });

          // If the flow routed through email nurturing (e.g., unqualified branch)
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'DISQUALIFIED' },
          });

          return { messageId: notification.id };
        },
      });

    // 7. Execute workflow through the engine
    const result = await executeWorkflow(workflowDefinition, parsedLead, effectAdapter);

    // 8. Persist individual execution steps in database
    const stepPromises = result.steps.map((step) =>
      prisma.executionStep.create({
        data: {
          executionId: execution.id,
          nodeId: step.nodeId,
          nodeType: step.type,
          name: step.name,
          status: step.status,
          input: step.input as any,
          output: step.output as any,
          durationMs: step.durationMs,
          message: step.message,
        },
      }),
    );
    const persistedSteps = await Promise.all(stepPromises);

    // 9. Update Execution to finished state
    const finalStatus =
      result.status === 'success' ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED;
    const updatedExecution = await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        result: {
          status: result.status,
          totalSteps: result.steps.length,
          executedSteps: result.steps.filter((s) => s.status === 'success').length,
        },
      },
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        lead: { include: { assignedMembership: true } },
        notifications: true,
      },
    });

    return {
      execution: updatedExecution,
      steps: persistedSteps,
      idempotentHit: false,
    };
  } catch (error: any) {
    await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: ExecutionStatus.FAILED,
        finishedAt: new Date(),
        errorCode: error?.message ?? 'Erro desconhecido na execução',
      },
    });
    throw error;
  }
}
