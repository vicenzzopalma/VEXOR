import { reserveDelivery, failDelivery } from './delivery';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { leadSchema, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import { createProductionEffects, executeWorkflow } from '@eimax/workflow-engine';
import {
  openSecrets,
  whatsappAdapter,
  type Settings,
  type SendPayload,
  type Transport,
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

export async function enqueueInTransaction(
  tx: Prisma.TransactionClient,
  params: Omit<EnqueueParams, 'prisma'>,
) {
  const { organizationId, workflowId, eventKey, versionId } = params;
  const key = { organizationId, workflowId, eventKey };
  const existing = await tx.execution.findUnique({
    where: { organizationId_workflowId_eventKey: key },
    include,
  });
  if (existing) return { execution: existing, idempotentHit: true };
  const lead = leadSchema.parse(params.leadData);
  const { message: _message, ...leadFields } = lead;
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
        update: {},
        create: {
          ...key,
          ...leadFields,
          data: lead,
          externalContactKey: params.externalContactKey,
          lastInboundAt: params.inboundAt,
        },
      })
    : await tx.lead.create({ data: { ...key, ...leadFields, data: lead } });
  if (params.inboundAt)
    await tx.lead.updateMany({
      where: { id: persisted.id, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: params.inboundAt } }] },
      data: { lastInboundAt: params.inboundAt },
    });
  const execution = await tx.execution.create({
    data: {
      ...key,
      leadId: persisted.id,
      versionId: version.id,
      status: 'QUEUED',
      eventData: {
        ...lead,
        name: persisted.name,
        company: persisted.company,
        email: persisted.email,
        phone: persisted.phone,
        budget: persisted.budget,
        score: persisted.score,
      },
    },
    include,
  });
  return { execution, idempotentHit: false };
}
export async function enqueueWorkflowExecution(params: EnqueueParams) {
  const { prisma, organizationId, workflowId, eventKey } = params;
  try {
    return await prisma.$transaction((tx) => enqueueInTransaction(tx, params));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const execution = await prisma.execution.findUniqueOrThrow({
        where: { organizationId_workflowId_eventKey: { organizationId, workflowId, eventKey } },
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
        const lead = leadSchema.parse(execution.eventData ?? execution.lead.data);
        const organizationId = execution.organizationId;
        const leadId = execution.lead.id;
        // Different message events may share a lead; serialize their local mutations as well.
        await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id"=${leadId} AND "organization_id"=${organizationId} FOR UPDATE`;
        await validateConnections(tx, execution.version.snapshot as unknown as Workflow, organizationId);
        const effects = createProductionEffects({
          updateConversationLead: async ({ field, value }) => {
            if (!execution.eventKey.startsWith('whatsapp:')) throw new Error('WHATSAPP_CONTEXT_REQUIRED');
            const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            const newer = await tx.execution.findFirst({
              where: { leadId, organizationId, createdAt: { gt: execution.createdAt } },
            });
            if (newer) return { updated: false };
            const data = { ...(current.data as Record<string, Prisma.JsonValue>), [field]: value };
            await tx.lead.update({ where: { id: leadId }, data: { [field]: value, data } });
            return { updated: true };
          },
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
          sendEmail: async ({ to, subject, body, connectionId, nodeId }) => {
            if (connectionId) {
              const connection = await tx.integrationConnection.findFirst({
                where: {
                  id: connectionId,
                  organizationId,
                  provider: 'RESEND',
                  enabled: true,
                  state: 'CONNECTED',
                },
              });
              if (!connection?.credentials || !to) throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
              const notification = await tx.notification.create({
                data: {
                  organizationId,
                  leadId,
                  executionId: execution.id,
                  integrationId: connection.id,
                  nodeId,
                  channel: 'EMAIL',
                  recipient: to,
                  title: subject,
                  message: body,
                  status: 'PENDING',
                  payload: {
                    to,
                    subject,
                    text: body,
                    from: String((connection.settings as any).from),
                    connectionRevision: connection.updatedAt.toISOString(),
                  },
                },
              });
              return { notificationId: notification.id, status: 'PENDING' as const };
            }
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
  for (const node of flow.nodes.filter((n) => n.type === 'email.send' && n.config.connectionId)) {
    const connection = await db.integrationConnection.findFirst({
      where: {
        id: String(node.config.connectionId),
        organizationId,
        provider: 'RESEND',
        state: 'CONNECTED',
        enabled: true,
      },
    });
    if (!connection?.credentials) throw new Error('EMAIL_CONNECTION_UNAVAILABLE');
  }
  for (const node of flow.nodes.filter(
    (n) =>
      n.type.startsWith('whatsapp.') && !['whatsapp.sdr.notify', 'whatsapp.lead.update'].includes(n.type),
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

export async function dispatchNextWhatsApp(prisma: PrismaClient, transport?: Transport) {
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
  const job = await reserveDelivery(prisma, 'WHATSAPP');
  if (!job) return null;
  const id = job.id;
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
      transport,
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
    await prisma.notification.updateMany({
      where: { id, status: 'PROCESSING', deliveryToken: job.deliveryToken },
      data: { providerMessageId: result.providerMessageId, status, deliveryToken: null, errorCode: null },
    });
    return prisma.notification.findUniqueOrThrow({ where: { id } });
  } catch (error) {
    return failDelivery(prisma, job, error, false);
  }
}

export { processNextWhatsAppEvent } from './inbox';
export { dispatchNextEmail } from './delivery';
