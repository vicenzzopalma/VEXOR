import { Prisma, type PrismaClient } from '@prisma/client';
import { type Workflow } from '@eimax/workflow-schema';
import { QUARANTINE_STATUS_REASONS } from '@eimax/connectors';
import { enqueueInTransaction } from './index';
import { captureOptOutInTransaction } from './opt-out';

export async function processNextWhatsAppEvent(db: PrismaClient) {
  let eventId: string | undefined;
  try {
    return await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT "id" FROM "WhatsAppEvent" WHERE "status"='PENDING' AND "availableAt" <= (NOW() AT TIME ZONE 'UTC') ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!rows[0]) return null;
        eventId = rows[0].id;
        const event = await tx.whatsAppEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: { connection: true },
        });
        const connection = event.connection;
        // A "SAIR" reply is honoured even when the connection is disabled or no workflow is routed:
        // the opt-out is recorded for the connection's organization and queued for Esfera.
        if (event.kind === 'MESSAGE') {
          const payload = event.payload as { from: string; text?: string; timestamp?: string | number };
          const ts = Number(payload.timestamp) * 1000;
          await captureOptOutInTransaction(tx, {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            providerEventId: event.providerEventId,
            sourceEventId: event.id,
            from: payload.from,
            text: payload.text,
            receivedAt: Number.isFinite(ts) && ts > 0 && ts <= Date.now() + 60000 ? new Date(ts) : event.createdAt,
          });
        }
        if (!connection.enabled)
          return tx.whatsAppEvent.update({
            where: { id: event.id },
            data: { status: 'IGNORED', processedAt: new Date(), errorCode: 'CONNECTION_DISABLED' },
          });
        if (event.kind === 'CONNECTION_CLOSED') {
          const reason = (event.payload as { statusReason?: number }).statusReason;
          // Like VERITAS: a logged-out/banned session is isolated on its own connection only.
          // It stays off until an owner releases it; other numbers keep working.
          const quarantine = reason !== undefined && QUARANTINE_STATUS_REASONS.includes(reason);
          await tx.whatsAppConnection.update({
            where: { id: connection.id },
            data: quarantine
              ? {
                  state: 'ERROR',
                  enabled: false,
                  checkedAt: new Date(),
                  lastError: `SESSION_CLOSED_${reason}`,
                  quarantinedAt: connection.quarantinedAt ?? new Date(),
                  quarantineReason: connection.quarantineReason ?? `PROVIDER_STATUS_${reason}`,
                }
              : { state: 'DISCONNECTED', checkedAt: new Date() },
          });
        }
        if (event.kind === 'MESSAGE') {
          const payload = event.payload as {
            from: string;
            text: string;
            timestamp?: string | number;
            name?: string;
          };
          const timestamp = Number(payload.timestamp) * 1000;
          const inboundAt =
            Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() + 60000
              ? new Date(timestamp)
              : undefined;
          const versions = await tx.workflowVersion.findMany({
            where: { id: { in: event.routing as string[] }, organizationId: connection.organizationId },
          });
          if (versions.length !== (event.routing as string[]).length)
            throw new Error('INVALID_EVENT_ROUTING');
          for (const version of versions) {
            const flow = version.snapshot as unknown as Workflow;
            if (
              !flow.nodes.some(
                (n) => n.type === 'whatsapp.message.received' && n.config.connectionId === connection.id,
              )
            )
              throw new Error('INVALID_EVENT_ROUTING');
            await enqueueInTransaction(tx, {
              organizationId: connection.organizationId,
              workflowId: version.workflowId,
              versionId: version.id,
              eventKey: `whatsapp:${connection.id}:${event.providerEventId}`,
              externalContactKey: `${connection.id}:${payload.from}`,
              inboundAt,
              sourceEvent: { id: event.id, createdAt: event.createdAt },
              leadData: {
                name: payload.name || 'Contato WhatsApp',
                company: 'Não informada',
                email: '',
                phone: payload.from,
                message: payload.text,
                budget: 0,
                score: 0,
                source: 'whatsapp',
              },
            });
          }
        }
        return tx.whatsAppEvent.update({
          where: { id: event.id },
          data: { status: 'COMPLETED', attempt: { increment: 1 }, processedAt: new Date(), errorCode: null },
        });
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (!eventId) throw error;
    const transient =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2028', 'P1001', 'P1002'].includes(error.code);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WhatsAppEvent" WHERE "id"=${eventId} FOR UPDATE`;
      const event = await tx.whatsAppEvent.findUniqueOrThrow({ where: { id: eventId } });
      if (event.status !== 'PENDING') return event;
      const retry = transient && event.attempt < 2;
      return tx.whatsAppEvent.update({
        where: { id: eventId },
        data: {
          status: retry ? 'PENDING' : 'FAILED',
          attempt: { increment: 1 },
          errorCode: transient ? 'DATABASE_TRANSIENT_FAILURE' : 'EVENT_PROCESSING_FAILED',
          availableAt: new Date(Date.now() + 1000 * 2 ** (event.attempt + 1)),
        },
      });
    });
  }
}
