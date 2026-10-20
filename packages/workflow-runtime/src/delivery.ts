import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '@prisma/client';
import { ConnectorError, openSecrets, resendAdapter, type Transport } from '@eimax/connectors';

export async function reserveDelivery(db: PrismaClient, channel: 'EMAIL' | 'WHATSAPP') {
  const expired = { channel, status: 'PROCESSING', processingAt: { lt: new Date(Date.now() - 60000) } };
  if (channel === 'EMAIL')
    await db.notification.updateMany({
      where: {
        ...expired,
        integrationId: { not: null },
        providerMessageId: null,
        attempt: { lt: 3 },
        createdAt: { gt: new Date(Date.now() - 23 * 3600000) },
      },
      data: { status: 'PENDING', deliveryToken: null, errorCode: 'RECOVERING_WITH_PROVIDER_IDEMPOTENCY' },
    });
  await db.notification.updateMany({
    where: expired,
    data: { status: 'FAILED', deliveryToken: null, errorCode: 'DELIVERY_UNKNOWN_RECONCILIATION_REQUIRED' },
  });
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Notification" WHERE "channel"=${channel} AND "status"='PENDING' AND "providerMessageId" IS NULL AND "availableAt" <= (NOW() AT TIME ZONE 'UTC') AND (${channel}='WHATSAPP' OR "integrationId" IS NOT NULL) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    const deliveryToken = randomUUID();
    return tx.notification.update({
      where: { id: rows[0].id },
      data: { status: 'PROCESSING', deliveryToken, processingAt: new Date(), attempt: { increment: 1 } },
    });
  });
}
export async function failDelivery(
  db: PrismaClient,
  job: { id: string; deliveryToken: string | null; attempt: number; createdAt: Date },
  error: unknown,
  providerIdempotency: boolean,
) {
  const code = error instanceof ConnectorError ? error.code : 'DELIVERY_UNKNOWN_RECONCILIATION_REQUIRED';
  const safeRejection = code === 'PROVIDER_HTTP_429' && error instanceof ConnectorError && error.retrySafe;
  const ambiguous = [
    'PROVIDER_REQUEST_UNCERTAIN',
    'PROVIDER_RESULT_UNCERTAIN',
    'PROVIDER_TIMEOUT',
    'DNS_TIMEOUT',
    'PROVIDER_HTTP_500',
    'PROVIDER_HTTP_502',
    'PROVIDER_HTTP_503',
    'PROVIDER_HTTP_504',
  ].includes(code);
  const retry =
    job.attempt < 3 &&
    (safeRejection ||
      (providerIdempotency && ambiguous && Date.now() - job.createdAt.getTime() < 23 * 3600000));
  await db.notification.updateMany({
    where: { id: job.id, status: 'PROCESSING', deliveryToken: job.deliveryToken },
    data: {
      status: retry ? 'PENDING' : 'FAILED',
      availableAt: new Date(
        Date.now() +
          (error instanceof ConnectorError && error.retryAfterMs
            ? error.retryAfterMs
            : 1000 * 2 ** job.attempt),
      ),
      errorCode: code,
      deliveryToken: null,
    },
  });
  return db.notification.findUniqueOrThrow({ where: { id: job.id } });
}
export async function dispatchNextEmail(db: PrismaClient, transport?: Transport) {
  await db.$executeRaw`UPDATE "Notification" n SET "status"=CASE r.rank WHEN 3 THEN 'DELIVERED' WHEN 2 THEN 'FAILED' ELSE 'SENT' END FROM (
    SELECT "integrationId", "providerMessageId", MAX(CASE "kind" WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 ELSE 1 END) AS rank FROM "IntegrationEvent" WHERE "kind" IN ('SENT','DELIVERED','FAILED') GROUP BY "integrationId", "providerMessageId"
  ) r WHERE n."integrationId"=r."integrationId" AND n."providerMessageId"=r."providerMessageId" AND CASE n."status" WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 1 ELSE 0 END < r.rank`;
  const job = await reserveDelivery(db, 'EMAIL');
  if (!job) return null;
  try {
    const connection = job.integrationId
      ? await db.integrationConnection.findFirst({
          where: {
            id: job.integrationId,
            organizationId: job.organizationId,
            provider: 'RESEND',
            state: 'CONNECTED',
            enabled: true,
          },
        })
      : null;
    if (process.env.EMAIL_EXTERNAL_ENABLED !== 'true' || !connection?.credentials)
      throw new ConnectorError('CONFIGURATION_REQUIRED');
    const payload = job.payload as {
      to: string;
      subject: string;
      text: string;
      from: string;
      connectionRevision: string;
    };
    if (
      payload.connectionRevision !== connection.updatedAt.toISOString() ||
      payload.from !== (connection.settings as any).from
    )
      throw new ConnectorError('CONNECTION_CHANGED');
    const result = await resendAdapter(
      connection.settings,
      openSecrets(connection.credentials),
      transport,
    ).send({ to: payload.to, subject: payload.subject, text: payload.text }, `vexor-email:${job.id}`);
    await db.notification.updateMany({
      where: { id: job.id, status: 'PROCESSING', deliveryToken: job.deliveryToken },
      data: {
        providerMessageId: result.providerMessageId,
        status: result.status,
        deliveryToken: null,
        errorCode: null,
      },
    });
    return db.notification.findUniqueOrThrow({ where: { id: job.id } });
  } catch (error) {
    return failDelivery(db, job, error, true);
  }
}
