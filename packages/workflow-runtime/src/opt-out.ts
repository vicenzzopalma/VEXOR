import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  classifyOptOut,
  optOutEventKey,
  optOutExcerpt,
  resolveEsferaLink,
  toE164,
  type EsferaLink,
  optOutPhoneKey,
  optOutConfirmationPolicy,
  sendOptOutConfirmation,
  openSecrets,
  ConnectorError,
  type Settings,
  type Transport,
} from '@eimax/connectors';

// Opt-out ("SAIR") outbox: capture on inbound messages, deliver to Esfera with retries,
// acknowledge only after Esfera reports a durable write. Nothing here sends WhatsApp messages.

export const OPT_OUT_LEASE_MS = 60000;
export const OPT_OUT_MAX_BACKOFF_MS = 10 * 60000;

export type OptOutCapture = {
  organizationId: string;
  connectionId: string;
  providerEventId: string;
  sourceEventId: string;
  from: string;
  text: string | undefined;
  receivedAt: Date;
};

/** Phone forms stored on leads (digits with and without "+"). */
function phoneVariants(e164: string) {
  const digits = e164.replace(/\D/g, '');
  return [digits, `+${digits}`];
}

/**
 * Records an opt-out for an inbound message inside the inbox transaction. Idempotent per provider
 * event. OPT_OUT rows are queued for Esfera and revoke WhatsApp consent on this organization's leads;
 * AMBIGUOUS rows wait for a member's review and change nothing else. History is not required.
 */
export async function captureOptOutInTransaction(tx: Prisma.TransactionClient, capture: OptOutCapture) {
  const classification = classifyOptOut(capture.text);
  if (classification === 'NONE') return null;
  const phone = toE164(capture.from);
  if (!phone) return null;
  const eventKey = optOutEventKey(capture.connectionId, capture.providerEventId);
  const existing = await tx.optOutEvent.findUnique({ where: { eventKey } });
  if (existing) return existing;
  const row = await tx.optOutEvent.create({
    data: {
      organizationId: capture.organizationId,
      connectionId: capture.connectionId,
      sourceEventId: capture.sourceEventId,
      eventKey,
      phone,
      classification,
      excerpt: optOutExcerpt(capture.text),
      receivedAt: capture.receivedAt,
      status: classification === 'OPT_OUT' ? 'PENDING' : 'REVIEW',
    },
  });
  if (classification === 'OPT_OUT') {
    await revokeLeadConsent(tx, capture.organizationId, phone);
    await enqueueOptOutConfirmation(tx, row);
  }
  return row;
}

export async function enqueueOptOutConfirmation(
  tx: Prisma.TransactionClient,
  row: {
    id: string;
    organizationId: string;
    phone: string;
    connectionId: string | null;
    sourceEventId: string | null;
  },
) {
  if (!row.connectionId || !row.sourceEventId) return; // never reply to a manual phone entry
  const source = await tx.whatsAppEvent.findFirst({
    where: { id: row.sourceEventId, connectionId: row.connectionId, kind: 'MESSAGE' },
  });
  if (!source) return;
  const activation = await tx.optOutConfirmationActivation.findUnique({ where: { id: 'default' } });
  if (!activation || source.createdAt <= activation.activatedAt) return;
  const inbound = await tx.optOutEvent.findUnique({ where: { id: row.id }, select: { receivedAt: true } });
  if (!inbound || inbound.receivedAt <= activation.activatedAt) return;
  const payload = source.payload as { from?: string; fromMe?: boolean; isGroup?: boolean };
  if (
    payload.fromMe ||
    payload.isGroup ||
    !payload.from ||
    payload.from.includes('@g.us') ||
    optOutPhoneKey(payload.from) !== optOutPhoneKey(row.phone)
  )
    return;
  await tx.optOutConfirmation.createMany({
    data: [
      {
        organizationId: row.organizationId,
        phoneKey: optOutPhoneKey(row.phone),
        phone: row.phone,
        connectionId: row.connectionId,
        sourceOptOutId: row.id,
        status: optOutConfirmationPolicy(row.phone) === 'ALLOWED' ? 'PENDING' : 'HELD',
      },
    ],
    skipDuplicates: true,
  });
}

export async function activateOptOutConfirmations(db: PrismaClient) {
  // Never reset on restart or when disabled. Old inbox/reviews must remain ineligible forever.
  return db.optOutConfirmationActivation.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

/** At-most-once acceptance: an uncertain network result or expired send lease is NOT resent.
 * Safe failures (preflight, explicit 4xx rejection) retry; ambiguous outcomes remain visible.
 * Esfera has an independent queue and must ACK this request before confirmation is eligible. */
export async function dispatchNextOptOutConfirmation(db: PrismaClient, transport?: Transport) {
  await db.optOutConfirmation.updateMany({
    where: { status: 'PROCESSING', processingAt: { lt: new Date(Date.now() - OPT_OUT_LEASE_MS) } },
    data: { status: 'FAILED', errorCode: 'SEND_RESULT_UNCERTAIN', deliveryToken: null },
  });
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT c."id" FROM "OptOutConfirmation" c
      JOIN "OptOutEvent" e ON e."id"=c."sourceOptOutId" AND e."organization_id"=c."organization_id"
      WHERE c."status" IN ('PENDING','HELD') AND c."availableAt" <= (NOW() AT TIME ZONE 'UTC')
      AND e."status"='DELIVERED' ORDER BY c."createdAt" FOR UPDATE OF c SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    return tx.optOutConfirmation.update({
      where: { id: rows[0].id },
      data: {
        status: 'PROCESSING',
        processingAt: new Date(),
        deliveryToken: randomUUID(),
        attempt: { increment: 1 },
      },
    });
  });
  if (!job) return null;
  const fence = { id: job.id, status: 'PROCESSING', deliveryToken: job.deliveryToken };
  let sending = false;
  try {
    const policy = optOutConfirmationPolicy(job.phone);
    if (policy !== 'ALLOWED') {
      await db.optOutConfirmation.updateMany({
        where: fence,
        data: {
          status: 'HELD',
          deliveryToken: null,
          errorCode: policy,
          availableAt: new Date(Date.now() + 30000),
        },
      });
    } else {
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "WhatsAppConnection" WHERE "id"=${job.connectionId} AND "organization_id"=${job.organizationId} FOR UPDATE`;
          const connection = await tx.whatsAppConnection.findFirst({
            where: { id: job.connectionId, organizationId: job.organizationId },
          });
          if (
            !connection ||
            !connection.enabled ||
            connection.quarantinedAt ||
            connection.state !== 'CONNECTED'
          )
            throw new ConnectorError('CONNECTION_UNAVAILABLE');
          // The fixed-text adapter checks live session state; no reconnection or session mutation.
          const guardedTransport: Transport | undefined = transport;
          sending = true;
          const result = await sendOptOutConfirmation(
            connection.provider,
            connection.settings as Settings,
            connection.credentials ? openSecrets(connection.credentials) : {},
            job.phone,
            guardedTransport,
          );
          await tx.optOutConfirmation.updateMany({
            where: fence,
            data: {
              status: 'SENT',
              sentAt: new Date(),
              providerMessageId: result.providerMessageId,
              errorCode: null,
              deliveryToken: null,
            },
          });
        },
        { timeout: 25000 },
      );
    }
  } catch (error) {
    const code = error instanceof ConnectorError ? error.code : 'SEND_RESULT_UNCERTAIN';
    const safe =
      !sending ||
      [
        'CONNECTION_UNAVAILABLE',
        'SESSION_DISCONNECTED',
        'CONFIGURATION_REQUIRED',
        'CONFIRMATION_HELD',
      ].includes(code) ||
      /^PROVIDER_HTTP_(400|401|403|404|422|429)$/.test(code);
    await db.optOutConfirmation.updateMany({
      where: fence,
      data: {
        status: safe ? 'PENDING' : 'FAILED',
        errorCode: code,
        deliveryToken: null,
        availableAt: new Date(Date.now() + optOutBackoffMs(job.attempt)),
      },
    });
  }
  return db.optOutConfirmation.findUniqueOrThrow({ where: { id: job.id } });
}

/** Same organization only: a number that opted out in one company keeps its consent elsewhere. */
export async function revokeLeadConsent(tx: Prisma.TransactionClient, organizationId: string, phone: string) {
  return tx.lead.updateMany({
    where: { organizationId, phone: { in: phoneVariants(phone) }, whatsappConsent: true },
    data: { whatsappConsent: false },
  });
}

export type OptOutTransport = (
  url: URL,
  headers: Record<string, string>,
  body: unknown,
) => Promise<{ status: number; body: unknown }>;

/**
 * HTTP client for the Esfera link. Allows https:// to any host and plain http:// only on loopback
 * (both apps usually run on the same machine). Never follows redirects; 10 s deadline; 1 MB cap.
 */
export const esferaTransport: OptOutTransport = (url, headers, body) =>
  new Promise((resolve, reject) => {
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    )
      return reject(new Error('ESFERA_LINK_ORIGIN_NOT_ALLOWED'));
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': String(payload.length) },
      },
      (res) => {
        let length = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 1024 * 1024) req.destroy(new Error('ESFERA_RESPONSE_TOO_LARGE'));
          else chunks.push(chunk);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = {};
          try {
            parsed = text ? JSON.parse(text) : {};
          } catch {
            parsed = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on('aborted', () => reject(new Error('ESFERA_RESULT_UNCERTAIN')));
        res.on('error', () => reject(new Error('ESFERA_RESULT_UNCERTAIN')));
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('ESFERA_TIMEOUT')));
    req.on('error', (error) => reject(error instanceof Error ? error : new Error('ESFERA_REQUEST_FAILED')));
    req.write(payload);
    req.end();
  });

export type DeliveryOutcome =
  | { kind: 'delivered'; ackStatus: string; suppressedContacts: number }
  | { kind: 'retry'; errorCode: string }
  | { kind: 'failed'; errorCode: string };

/** Maps the Esfera response to the outbox decision. Only an explicit durable ack counts as delivered. */
export function deliveryOutcome(status: number, body: unknown, eventKey: string): DeliveryOutcome {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    if (record.ack === true && record.eventId === eventKey && typeof record.status === 'string')
      return {
        kind: 'delivered',
        ackStatus: record.status,
        suppressedContacts: Number.isInteger(record.suppressedContacts)
          ? Number(record.suppressedContacts)
          : 0,
      };
    return { kind: 'retry', errorCode: 'ESFERA_ACK_MISSING' };
  }
  const detail =
    typeof record.error === 'string'
      ? record.error
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_')
          .slice(0, 60)
      : '';
  if (status === 400 || status === 422)
    return { kind: 'failed', errorCode: `ESFERA_REJECTED_${detail || status}` };
  if (status === 401 || status === 403)
    return { kind: 'retry', errorCode: `ESFERA_${detail || 'AUTHENTICATION_FAILED'}` };
  return { kind: 'retry', errorCode: `ESFERA_HTTP_${status || 'UNAVAILABLE'}` };
}

export function optOutBackoffMs(attempt: number) {
  return Math.min(OPT_OUT_MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 20));
}

export function buildOptOutDelivery(
  row: {
    eventKey: string;
    phone: string;
    classification: string;
    excerpt: string;
    receivedAt: Date;
    connectionId: string | null;
  },
  link: EsferaLink,
) {
  return {
    eventId: row.eventKey,
    companyId: link.companyId,
    phone: row.phone,
    source: 'vexor',
    channel: 'whatsapp',
    classification: row.classification,
    reason:
      row.classification === 'MANUAL'
        ? 'Descadastro manual no VEXOR'
        : `Respondeu "${row.excerpt}" no WhatsApp (VEXOR)`,
    connectionId: row.connectionId,
    receivedAt: row.receivedAt.toISOString(),
  };
}

export async function reserveOptOut(db: PrismaClient) {
  // Expired reservations (worker restart) go straight back to the queue: re-delivery is safe
  // because Esfera deduplicates by eventId.
  await db.optOutEvent.updateMany({
    where: {
      status: 'PROCESSING',
      OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - OPT_OUT_LEASE_MS) } }],
    },
    data: {
      status: 'PENDING',
      deliveryToken: null,
      errorCode: 'DELIVERY_LEASE_EXPIRED',
      availableAt: new Date(),
    },
  });
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "OptOutEvent" WHERE "status"='PENDING' AND "availableAt" <= (NOW() AT TIME ZONE 'UTC') ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    const deliveryToken = randomUUID();
    return tx.optOutEvent.update({
      where: { id: rows[0].id },
      data: { status: 'PROCESSING', deliveryToken, processingAt: new Date(), attempt: { increment: 1 } },
    });
  });
}

/**
 * Delivers the next pending opt-out to the Esfera company mapped to its organization.
 * Returns the updated row, or null when the queue is empty.
 */
export async function dispatchNextOptOut(
  db: PrismaClient,
  transport: OptOutTransport = esferaTransport,
  links: (organizationId: string) => EsferaLink | undefined = (organizationId) =>
    resolveEsferaLink(organizationId),
) {
  const job = await reserveOptOut(db);
  if (!job) return null;
  const fence = { id: job.id, status: 'PROCESSING', deliveryToken: job.deliveryToken };
  const settle = (data: Prisma.OptOutEventUpdateManyMutationInput) =>
    db.optOutEvent.updateMany({ where: fence, data: { ...data, deliveryToken: null } });
  let outcome: DeliveryOutcome;
  try {
    const link = links(job.organizationId);
    if (!link) outcome = { kind: 'retry', errorCode: 'ESFERA_LINK_NOT_CONFIGURED' };
    else {
      const url = new URL(
        '/api/optout/events',
        link.baseUrl.endsWith('/') ? link.baseUrl : `${link.baseUrl}/`,
      );
      const response = await transport(
        url,
        { Authorization: `Bearer ${link.token}` },
        buildOptOutDelivery(job, link),
      );
      outcome = deliveryOutcome(response.status, response.body, job.eventKey);
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]{3,60}$/.test(error.message)
        ? error.message
        : 'ESFERA_REQUEST_FAILED';
    outcome = { kind: 'retry', errorCode: code };
  }
  if (outcome.kind === 'delivered')
    await settle({
      status: 'DELIVERED',
      deliveredAt: new Date(),
      ackStatus: outcome.ackStatus,
      errorCode: null,
    });
  else if (outcome.kind === 'failed') await settle({ status: 'FAILED', errorCode: outcome.errorCode });
  else
    await settle({
      status: 'PENDING',
      errorCode: outcome.errorCode,
      availableAt: new Date(Date.now() + optOutBackoffMs(job.attempt)),
    });
  return db.optOutEvent.findUniqueOrThrow({ where: { id: job.id } });
}
