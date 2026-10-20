import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { leadSchema, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import { createProductionEffects, executeWorkflow } from '@eimax/workflow-engine';
import {
  openSecrets,
  whatsappAdapter,
  type Settings,
  type SendPayload,
  ConnectorError,
} from '@eimax/connectors';

const include = { steps: { orderBy: { createdAt: 'asc' as const } } };
export interface EnqueueParams {
  prisma: PrismaClient;
  organizationId: string;
  workflowId: string;
  eventKey: string;
  leadData: unknown;
  versionId?: string;
  externalContactKey?: string;
  inboundAt?: Date;
}

export async function enqueueWorkflowExecution(params: EnqueueParams) {
  const { prisma, organizationId, workflowId, eventKey, versionId } = params;
  const key = { organizationId, workflowId, eventKey };
  const existing = await prisma.execution.findUnique({
    where: { organizationId_workflowId_eventKey: key },
    include,
  });
  if (existing) return { execution: existing, idempotentHit: true };
  const lead = leadSchema.parse(params.leadData);
  try {
    return await prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.findFirst({
        where: { organizationId, workflowId, ...(versionId ? { id: versionId } : {}) },
        orderBy: { number: 'desc' },
      });
      if (!version) throw new Error('Publique uma versão válida antes de executar.');
      const issues = validateWorkflow(version.snapshot as unknown as Workflow);
      if (issues.length) throw new Error('A versão publicada é inválida.');
      await validateConnections(tx, version.snapshot as unknown as Workflow, organizationId);
      const persisted = params.externalContactKey
        ? await tx.lead.upsert({
            where: {
              organizationId_workflowId_externalContactKey: {
                organizationId,
                workflowId,
                externalContactKey: params.externalContactKey,
              },
            },
            update: { lastInboundAt: params.inboundAt },
            create: {
              ...key,
              ...lead,
              data: lead,
              externalContactKey: params.externalContactKey,
              lastInboundAt: params.inboundAt,
            },
          })
        : await tx.lead.create({ data: { ...key, ...lead, data: lead } });
      const execution = await tx.execution.create({
        data: { ...key, leadId: persisted.id, versionId: version.id, status: 'QUEUED' },
        include,
      });
      return { execution, idempotentHit: false };
    });
  } catch (error) {
    // The unique constraint is the authority when identical ingress requests race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const execution = await prisma.execution.findUniqueOrThrow({
        where: { organizationId_workflowId_eventKey: key },
        include,
      });
      return { execution, idempotentHit: true };
    }
    throw error;
  }
}

export type Reservation = { id: string; leaseToken: string };
export async function reserveExecution(prisma: PrismaClient, leaseMs = 30000): Promise<Reservation | null> {
  const token = randomUUID();
  return prisma.$transaction(async (tx) => {
    // SKIP LOCKED also skips a live processor holding its fencing lock, even if its lease expires.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Execution"
      WHERE ("status" = 'QUEUED' AND "availableAt" <= (NOW() AT TIME ZONE 'UTC'))
         OR ("status" = 'RUNNING' AND ("leaseUntil" <= (NOW() AT TIME ZONE 'UTC') OR "leaseUntil" IS NULL))
      ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    const row = await tx.execution.findUniqueOrThrow({ where: { id: rows[0].id } });
    const history = (Array.isArray(row.attemptHistory) ? row.attemptHistory : []) as Array<
      Record<string, any>
    >;
    const previous = history.at(-1);
    if (previous?.status === 'RUNNING')
      Object.assign(previous, {
        status: 'ABANDONED',
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(String(previous.startedAt)),
        errorCode: 'LEASE_EXPIRED',
      });
    if (row.attempt >= row.maxAttempts) {
      await tx.execution.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          errorCode: 'ATTEMPTS_EXHAUSTED',
          finishedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          attemptHistory: history,
        },
      });
      return null;
    }
    await tx.execution.update({
      where: { id: row.id },
      data: {
        status: 'RUNNING',
        attempt: { increment: 1 },
        startedAt: new Date(),
        leaseToken: token,
        leaseUntil: new Date(Date.now() + leaseMs),
        attemptHistory: [
          ...history,
          { attempt: row.attempt + 1, status: 'RUNNING', startedAt: new Date().toISOString() },
        ],
      },
    });
    return { id: row.id, leaseToken: token };
  });
}

// This adapter has database effects only. Network adapters must use a durable outbox and
// provider idempotency before being enabled here; a DB transaction cannot undo an HTTP send.
export async function processReservedExecution(prisma: PrismaClient, job: Reservation) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Execution" WHERE "id"=${job.id} AND "status"='RUNNING'
          AND "leaseToken"=${job.leaseToken} AND "leaseUntil" > (NOW() AT TIME ZONE 'UTC') FOR UPDATE`;
        if (!locked.length) return null;
        const execution = await tx.execution.findUniqueOrThrow({
          where: { id: job.id },
          include: { version: true, lead: true },
        });
        if (
          !execution.version ||
          !execution.lead ||
          execution.lead.organizationId !== execution.organizationId ||
          execution.version.workflowId !== execution.workflowId
        )
          throw new Error('INVALID_EXECUTION_CONTEXT');
        const lead = leadSchema.parse(execution.lead.data);
        const organizationId = execution.organizationId;
        const leadId = execution.lead.id;
        // Different message events may share a lead; serialize their local mutations as well.
        await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id"=${leadId} AND "organization_id"=${organizationId} FOR UPDATE`;
        await validateConnections(tx, execution.version.snapshot as unknown as Workflow, organizationId);
        const effects = createProductionEffects({
          sendWhatsapp: async ({ node }) => {
            const connection = await tx.whatsAppConnection.findFirstOrThrow({
              where: {
                id: String(node.config.connectionId),
                organizationId,
                state: 'CONNECTED',
                enabled: true,
              },
            });
            const currentLead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            if (!currentLead.whatsappConsent || !currentLead.phone)
              throw new Error('WHATSAPP_CONSENT_REQUIRED');
            if (
              connection.provider === 'META' &&
              node.type === 'whatsapp.text.send' &&
              (!currentLead.lastInboundAt || Date.now() - currentLead.lastInboundAt.getTime() > 86400000)
            )
              throw new Error('WHATSAPP_TEMPLATE_REQUIRED');
            const payload: SendPayload = {
              to: currentLead.phone,
              ...(node.type === 'whatsapp.text.send'
                ? { text: String(node.config.text) }
                : { template: String(node.config.template), language: String(node.config.language) }),
            };
            const notification = await tx.notification.create({
              data: {
                organizationId,
                leadId,
                executionId: execution.id,
                connectionId: connection.id,
                nodeId: node.id,
                channel: 'WHATSAPP',
                recipient: currentLead.phone,
                title:
                  node.type === 'whatsapp.text.send'
                    ? 'Mensagem WhatsApp'
                    : `Template ${node.config.template}`,
                message: payload.text ?? '',
                payload: payload as Prisma.InputJsonValue,
                status: 'PENDING',
              },
            });
            return { notificationId: notification.id, status: 'PENDING' };
          },
          notifySdr: async ({ message }) => {
            const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            const member = current.assignedMembershipId
              ? await tx.membership.findFirst({
                  where: {
                    id: current.assignedMembershipId,
                    organizationId,
                    role: { in: ['owner', 'editor'] },
                  },
                })
              : null;
            if (!member) throw new Error('ASSIGNMENT_MEMBER_UNAVAILABLE');
            const notification = await tx.notification.create({
              data: {
                organizationId,
                leadId,
                executionId: execution.id,
                recipient: `membership:${member.id}`,
                channel: 'INTERNAL',
                title: 'Nova mensagem WhatsApp',
                message,
                status: 'AVAILABLE',
              },
            });
            return { notificationId: notification.id };
          },
          assignSdr: async ({ team }) => {
            // Legacy team strings are retained, but never authorize selecting an arbitrary member.
            // Until a team model exists, team must explicitly name a membership: membership:<id>.
            if (!team.startsWith('membership:')) throw new Error('ASSIGNMENT_CONFIGURATION_REQUIRED');
            const member = await tx.membership.findFirst({
              where: {
                id: team.slice('membership:'.length),
                organizationId,
                role: { in: ['owner', 'editor'] },
              },
            });
            if (!member) throw new Error('ASSIGNMENT_MEMBER_UNAVAILABLE');
            await tx.lead.update({
              where: { id: leadId },
              data: { assignedMembershipId: member.id, status: 'QUALIFIED' },
            });
            return { assignedTo: member.displayName };
          },
          addTag: async ({ tag }) => {
            const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            const tags = [
              ...new Set([
                ...(Array.isArray(current.tags)
                  ? current.tags.filter((v): v is string => typeof v === 'string')
                  : []),
                tag,
              ]),
            ];
            await tx.lead.update({ where: { id: leadId }, data: { tags } });
            return { tags };
          },
          notifyManager: async ({ message }) => {
            const notification = await tx.notification.create({
              data: {
                organizationId,
                leadId,
                executionId: execution.id,
                channel: 'MANAGER_NOTIFICATION',
                recipient: 'organization:owners',
                title: `Alerta Comercial: Novo Lead ${lead.name}`,
                message,
                status: 'AVAILABLE',
              },
            });
            return { notificationId: notification.id };
          },
          sendEmail: async ({ to, subject, body }) => {
            await tx.notification.create({
              data: {
                organizationId,
                leadId,
                executionId: execution.id,
                channel: 'EMAIL',
                recipient: to,
                title: subject,
                message: body,
                status: 'FAILED',
              },
            });
            throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
          },
        });
        const result = await executeWorkflow(
          execution.version.snapshot as unknown as Workflow,
          lead,
          effects,
        );
        await tx.executionStep.createMany({
          data: result.steps.map((step) => ({
            executionId: execution.id,
            nodeId: step.nodeId,
            nodeType: step.type,
            name: step.name,
            status: step.status,
            input: step.input as Prisma.InputJsonValue,
            output: JSON.parse(JSON.stringify(step.output)),
            durationMs: step.durationMs,
            message: step.message,
          })),
        });
        return tx.execution.update({
          where: { id: execution.id },
          data: {
            status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - execution.startedAt!.getTime(),
            leaseToken: null,
            leaseUntil: null,
            errorCode:
              result.status === 'failed'
                ? String(result.steps.find((s) => s.status === 'failed')?.output.errorCode ?? 'ACTION_FAILED')
                : null,
            attemptHistory: (execution.attemptHistory as Array<Record<string, any>>).map((item) =>
              item.attempt === execution.attempt
                ? {
                    ...item,
                    status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
                    finishedAt: new Date().toISOString(),
                    durationMs: Date.now() - execution.startedAt!.getTime(),
                    errorCode: result.status === 'failed' ? 'ACTION_FAILED' : null,
                  }
                : item,
            ),
            result: {
              status: result.status,
              totalSteps: result.steps.length,
              executedSteps: result.steps.filter((s) => s.status === 'success').length,
            },
          },
        });
      },
      { timeout: 20000, maxWait: 5000 },
    );
  } catch (error) {
    // Only a rolled-back local transaction is retried. Unknown/external failures are terminal.
    const transient =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2028', 'P1001', 'P1002'].includes(error.code);
    const current = await prisma.execution.findUnique({ where: { id: job.id } });
    if (current?.leaseToken !== job.leaseToken) return null;
    const retry = transient && current.attempt < current.maxAttempts;
    return prisma.execution.update({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status: retry ? 'QUEUED' : 'FAILED',
        errorCode: transient ? 'DATABASE_TRANSIENT_FAILURE' : 'EXECUTION_CONTEXT_FAILURE',
        availableAt: new Date(Date.now() + 1000 * 2 ** current.attempt),
        finishedAt: retry ? null : new Date(),
        leaseToken: null,
        leaseUntil: null,
        durationMs: current.startedAt ? Date.now() - current.startedAt.getTime() : null,
        attemptHistory: (current.attemptHistory as Array<Record<string, any>>).map((item) =>
          item.attempt === current.attempt
            ? {
                ...item,
                status: retry ? 'RETRY' : 'FAILED',
                finishedAt: new Date().toISOString(),
                errorCode: transient ? 'DATABASE_TRANSIENT_FAILURE' : 'EXECUTION_CONTEXT_FAILURE',
              }
            : item,
        ),
      },
    });
  }
}

export async function runNextExecution(prisma: PrismaClient) {
  const job = await reserveExecution(prisma);
  return job ? processReservedExecution(prisma, job) : null;
}

export async function validateConnections(
  db: Prisma.TransactionClient,
  flow: Workflow,
  organizationId: string,
) {
  for (const node of flow.nodes.filter(
    (n) => n.type.startsWith('whatsapp.') && n.type !== 'whatsapp.sdr.notify',
  )) {
    const connection = await db.whatsAppConnection.findFirst({
      where: { id: String(node.config.connectionId), organizationId },
    });
    if (!connection || connection.state !== 'CONNECTED' || !connection.enabled || !connection.credentials)
      throw new Error('WHATSAPP_CONNECTION_UNAVAILABLE');
    if (node.type === 'whatsapp.conversation.started')
      throw new Error('WHATSAPP_CONVERSATION_EVENT_NOT_SUPPORTED');
    if (
      node.type === 'whatsapp.template.send' &&
      (connection.provider !== 'META' ||
        !(connection.settings as Settings).approvedTemplates?.some(
          (t) => t.name === node.config.template && t.language === node.config.language,
        ))
    )
      throw new Error('WHATSAPP_TEMPLATE_NOT_APPROVED');
  }
}

export async function dispatchNextWhatsApp(prisma: PrismaClient) {
  // Reconcile receipts that raced the provider response or arrived after a worker restart.
  await prisma.$executeRaw`
    UPDATE "Notification" n SET "status" = CASE
      WHEN r.rank = 4 THEN 'READ' WHEN r.rank = 3 THEN 'DELIVERED'
      WHEN r.rank = 2 THEN 'FAILED' ELSE 'SENT' END
    FROM (
      SELECT "connectionId", "providerEventId", MAX(CASE "kind" WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 1 ELSE 0 END) AS rank
      FROM "WhatsAppEvent" WHERE "kind" IN ('SENT','DELIVERED','READ','FAILED') GROUP BY "connectionId", "providerEventId"
    ) r WHERE n."connectionId" = r."connectionId" AND n."providerMessageId" = r."providerEventId"
      AND (CASE n."status" WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 1 ELSE -1 END) < r.rank`;
  // A process lost after provider acceptance cannot be retried blindly without provider idempotency.
  await prisma.notification.updateMany({
    where: { channel: 'WHATSAPP', status: 'PROCESSING', processingAt: { lt: new Date(Date.now() - 60000) } },
    data: { status: 'FAILED', errorCode: 'DELIVERY_UNKNOWN_RECONCILIATION_REQUIRED' },
  });
  const id = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Notification" WHERE "channel"='WHATSAPP' AND "status"='PENDING' AND "providerMessageId" IS NULL ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    await tx.notification.update({
      where: { id: rows[0].id },
      data: { status: 'PROCESSING', processingAt: new Date(), attempt: { increment: 1 } },
    });
    return rows[0].id;
  });
  if (!id) return null;
  try {
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { id },
      include: { connection: true, lead: true },
    });
    const connection = notification.connection;
    if (
      process.env.WHATSAPP_EXTERNAL_ENABLED !== 'true' ||
      !connection?.credentials ||
      !connection.enabled ||
      connection.state !== 'CONNECTED' ||
      connection.organizationId !== notification.organizationId
    )
      throw new ConnectorError('CONFIGURATION_REQUIRED');
    if (
      !notification.lead?.whatsappConsent ||
      notification.lead.organizationId !== notification.organizationId
    )
      throw new ConnectorError('CONSENT_REQUIRED');
    const payload = notification.payload as unknown as SendPayload;
    if (payload.to !== notification.lead.phone) throw new ConnectorError('RECIPIENT_CHANGED');
    if (
      payload.text &&
      connection.provider === 'META' &&
      (!notification.lead.lastInboundAt || Date.now() - notification.lead.lastInboundAt.getTime() > 86400000)
    )
      throw new ConnectorError('TEMPLATE_REQUIRED');
    if (
      payload.template &&
      !(connection.settings as Settings).approvedTemplates?.some(
        (t) => t.name === payload.template && t.language === payload.language,
      )
    )
      throw new ConnectorError('TEMPLATE_NOT_APPROVED');
    const adapter = whatsappAdapter(
      connection.provider,
      connection.settings as Settings,
      openSecrets(connection.credentials),
    );
    // Recheck the session at dispatch time, not only at publication time.
    if ((await adapter.status()) !== 'CONNECTED') throw new ConnectorError('SESSION_DISCONNECTED');
    const result = await adapter.send(payload);
    const receipts = await prisma.whatsAppEvent.findMany({
      where: { connectionId: connection.id, providerEventId: result.providerMessageId },
    });
    const status = receipts.some((r) => r.kind === 'READ')
      ? 'READ'
      : receipts.some((r) => r.kind === 'DELIVERED')
        ? 'DELIVERED'
        : receipts.some((r) => r.kind === 'FAILED')
          ? 'FAILED'
          : result.status;
    return prisma.notification.update({
      where: { id },
      data: { providerMessageId: result.providerMessageId, status },
    });
  } catch (error) {
    return prisma.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorCode: error instanceof ConnectorError ? error.code : 'DELIVERY_UNKNOWN_RECONCILIATION_REQUIRED',
      },
    });
  }
}
