import 'dotenv/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { dispatchNextOptOut, processNextWhatsAppEvent, OPT_OUT_LEASE_MS } from '@eimax/workflow-runtime';

// Esfera is simulated by a local HTTP server: no WhatsApp session, no real message, no network.
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const sessions = JSON.parse(readFileSync('.local/development-sessions.json', 'utf8'));
const created: string[] = [];
const ownedEvents: string[] = [];

type Received = { url: string; authorization: string; body: Record<string, any> };
let fakeEsfera: Server;
let esferaUrl = '';
const received: Received[] = [];
const recordedEventIds = new Set<string>();
let respond: (body: Record<string, any>, req: IncomingMessage) => { status: number; body: unknown } = (body) => {
  const status = recordedEventIds.has(body.eventId) ? 'duplicate' : 'recorded';
  recordedEventIds.add(body.eventId);
  return { status: 200, body: { ack: true, eventId: body.eventId, status, companyId: body.companyId, suppressedContacts: 1 } };
};

async function request(path: string, role = 'owner', method = 'GET', body?: unknown) {
  const result = await fetch(`http://127.0.0.1:4000${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessions[role]}`,
      'x-eimax-client': 'workspace',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: result.status, data: await result.json() };
}

async function sandbox(role = 'owner') {
  const res = await request('/integrations/whatsapp', role, 'POST', {
    name: `MOCK Sandbox descadastro ${randomUUID()}`,
    provider: 'MOCK',
    settings: { mockName: 'descadastro' },
  });
  expect(res.status).toBe(201);
  created.push(res.data.id);
  const connected = await request(`/integrations/whatsapp/${res.data.id}/connect`, role, 'POST');
  expect(connected.data.state).toBe('CONNECTED');
  return connected.data as { id: string };
}

async function simulateMessage(connectionId: string, text: string, from = '5575988052539', id = `msg-${randomUUID()}`, role = 'owner') {
  const res = await request(`/integrations/whatsapp/${connectionId}/simulate`, role, 'POST', {
    kind: 'MESSAGE',
    id,
    from,
    text,
    timestamp: Math.floor(Date.now() / 1000),
  });
  expect(res.status).toBe(201);
  return id;
}

async function drainInbox() {
  for (let i = 0; i < 200; i++) {
    const pending = await db.whatsAppEvent.count({ where: { connectionId: { in: created }, status: 'PENDING' } });
    if (!pending) return;
    await processNextWhatsAppEvent(db);
  }
  throw new Error('Inbox não esvaziou');
}

async function drainOutbox(max = 20) {
  const results = [];
  for (let i = 0; i < max; i++) {
    const row = await dispatchNextOptOut(db);
    if (!row) break;
    results.push(row);
  }
  return results;
}

function linksFor(entries: Record<string, { companyId: number; token: string }>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(entries).map(([org, link]) => [org, { baseUrl: esferaUrl, ...link }])),
  );
}

beforeAll(async () => {
  fakeEsfera = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      received.push({ url: req.url ?? '', authorization: String(req.headers.authorization ?? ''), body });
      const reply = respond(body, req);
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((accept) => fakeEsfera.listen(0, '127.0.0.1', accept));
  const address = fakeEsfera.address();
  esferaUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  // Leftovers from interrupted runs must not be delivered to the fake server of this run.
  await db.optOutEvent.updateMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED', errorCode: 'TEST_FIXTURE_STALE' },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  received.length = 0;
});

afterAll(async () => {
  await db.optOutEvent.updateMany({
    where: { id: { in: ownedEvents }, status: { in: ['PENDING', 'PROCESSING', 'REVIEW'] } },
    data: { status: 'FAILED', errorCode: 'TEST_FIXTURE_FINISHED' },
  });
  await db.whatsAppConnection.updateMany({ where: { id: { in: created } }, data: { state: 'ARCHIVED', enabled: false } });
  await new Promise<void>((accept) => fakeEsfera.close(() => accept()));
  await db.$disconnect();
});

describe.sequential('Descadastro central VEXOR -> Esfera (simulado, sem WhatsApp real)', () => {
  it('SAIR em mensagem individual vira evento único, revoga consentimento e é entregue com ACK durável', async () => {
    const connection = await sandbox();
    const lead = await db.lead.create({
      data: {
        organizationId: 'org-local',
        workflowId: (await db.workflow.findFirstOrThrow({ where: { organizationId: 'org-local' } })).id,
        eventKey: `optout-lead-${randomUUID()}`,
        phone: '5575988052539',
        whatsappConsent: true,
        data: {},
      },
    });
    const id = await simulateMessage(connection.id, 'SAIR 🙏');
    // The same provider event delivered twice (webhook retry) must not create a second opt-out.
    await simulateMessage(connection.id, 'SAIR 🙏', '5575988052539', id);
    await drainInbox();
    const events = await db.optOutEvent.findMany({ where: { eventKey: `whatsapp:${connection.id}:${id}` } });
    expect(events).toHaveLength(1);
    ownedEvents.push(events[0].id);
    expect(events[0]).toMatchObject({
      organizationId: 'org-local',
      phone: '+5575988052539',
      classification: 'OPT_OUT',
      status: 'PENDING',
      excerpt: 'SAIR 🙏',
    });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).whatsappConsent).toBe(false);

    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', linksFor({ 'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') } }));
    const delivered = await drainOutbox();
    const row = delivered.find((r) => r.id === events[0].id)!;
    expect(row).toMatchObject({ status: 'DELIVERED', ackStatus: 'recorded', attempt: 1, errorCode: null });
    expect(row.deliveredAt).not.toBeNull();
    const call = received.find((r) => r.body.eventId === events[0].eventKey)!;
    expect(call.url).toBe('/api/optout/events');
    expect(call.authorization).toBe(`Bearer ${'local-token-'.padEnd(32, 'x')}`);
    expect(call.body).toMatchObject({ companyId: 1, phone: '+5575988052539', source: 'vexor', classification: 'OPT_OUT' });
    expect(JSON.stringify(call.body)).not.toContain('local-token-');
    // Nothing is sent again once delivered.
    expect(await dispatchNextOptOut(db)).toBeNull();
    const api = await request('/opt-outs?status=DELIVERED');
    expect(api.status).toBe(200);
    expect(api.data.some((r: any) => r.id === events[0].id)).toBe(true);
    expect(JSON.stringify(api.data)).not.toContain('local-token-');
  });

  it('retenta com backoff após falha do Esfera e sobrevive a reinício do worker (lease expirada)', async () => {
    const connection = await sandbox();
    const id = await simulateMessage(connection.id, 'parar', '5575911112222');
    await drainInbox();
    const event = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${connection.id}:${id}` } });
    ownedEvents.push(event.id);
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', linksFor({ 'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') } }));

    const original = respond;
    respond = () => ({ status: 503, body: { error: 'maintenance' } });
    try {
      const first = (await drainOutbox()).find((r) => r.id === event.id)!;
      expect(first).toMatchObject({ status: 'PENDING', attempt: 1, errorCode: 'ESFERA_HTTP_503' });
      expect(first.availableAt.getTime()).toBeGreaterThan(Date.now() + 1000);
      // Not retried before the backoff elapses.
      expect(await dispatchNextOptOut(db)).toBeNull();
    } finally {
      respond = original;
    }
    // Simulate a worker crash mid-delivery: reservation older than the lease is recovered.
    await db.optOutEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', deliveryToken: 'stale', processingAt: new Date(Date.now() - OPT_OUT_LEASE_MS - 1000) },
    });
    const recovered = (await drainOutbox()).find((r) => r.id === event.id)!;
    expect(recovered).toMatchObject({ status: 'DELIVERED', ackStatus: 'recorded', attempt: 2 });
    // A manual re-delivery of the same event is answered as duplicate by Esfera and still counts as delivered.
    await db.optOutEvent.update({ where: { id: event.id }, data: { status: 'PENDING', availableAt: new Date() } });
    const again = (await drainOutbox()).find((r) => r.id === event.id)!;
    expect(again).toMatchObject({ status: 'DELIVERED', ackStatus: 'duplicate' });
  });

  it('isola empresas: cada organização entrega só para a sua empresa do Esfera e sem mapeamento nada sai', async () => {
    const ownerConnection = await sandbox('owner');
    const otherConnection = await sandbox('other');
    const idA = await simulateMessage(ownerConnection.id, 'SAIR', '5575933334444');
    const idB = await simulateMessage(otherConnection.id, 'SAIR', '5575933334444', `msg-${randomUUID()}`, 'other');
    await drainInbox();
    const a = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${ownerConnection.id}:${idA}` } });
    const b = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${otherConnection.id}:${idB}` } });
    ownedEvents.push(a.id, b.id);
    expect(a.organizationId).toBe('org-local');
    expect(b.organizationId).toBe('org-other');

    // Only org-local is mapped: org-other stays queued, nothing is sent for it.
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', linksFor({ 'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') } }));
    let rows = await drainOutbox();
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ status: 'DELIVERED' });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ status: 'PENDING', errorCode: 'ESFERA_LINK_NOT_CONFIGURED' });
    expect(received.filter((r) => r.body.eventId === b.eventKey)).toHaveLength(0);

    // Now both are mapped to different companies with different tokens.
    await db.optOutEvent.update({ where: { id: b.id }, data: { availableAt: new Date() } });
    vi.stubEnv(
      'ESFERA_OPTOUT_LINKS_JSON',
      linksFor({
        'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') },
        'org-other': { companyId: 2, token: 'other-token-'.padEnd(32, 'y') },
      }),
    );
    rows = await drainOutbox();
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ status: 'DELIVERED' });
    const callB = received.find((r) => r.body.eventId === b.eventKey)!;
    expect(callB.body.companyId).toBe(2);
    expect(callB.authorization).toBe(`Bearer ${'other-token-'.padEnd(32, 'y')}`);
    // Each organization only sees its own records through the API.
    expect((await request('/opt-outs', 'other')).data.some((r: any) => r.id === a.id)).toBe(false);
    expect((await request('/opt-outs', 'other')).data.some((r: any) => r.id === b.id)).toBe(true);
  });

  it('pedidos ambíguos ficam em revisão durável; confirmar enfileira, descartar encerra; manual também entrega', async () => {
    const connection = await sandbox();
    const id = await simulateMessage(connection.id, 'quero sair mas me liga amanhã para negociar', '5575955556666');
    await drainInbox();
    const event = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${connection.id}:${id}` } });
    ownedEvents.push(event.id);
    expect(event).toMatchObject({ classification: 'AMBIGUOUS', status: 'REVIEW' });
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', linksFor({ 'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') } }));
    expect((await drainOutbox()).some((r) => r.id === event.id)).toBe(false);

    const review = (await request('/opt-outs?status=REVIEW')).data.find((r: any) => r.id === event.id);
    expect(review).toBeTruthy();
    const path = `/opt-outs/${event.id}/resolve`;
    expect((await request(path, 'viewer', 'POST', { decision: 'CONFIRM', expectedUpdatedAt: review.updatedAt })).status).toBe(403);
    expect((await request(path, 'other', 'POST', { decision: 'CONFIRM', expectedUpdatedAt: review.updatedAt })).status).toBe(404);
    expect((await request(path, 'owner', 'POST', { decision: 'CONFIRM', expectedUpdatedAt: new Date(0).toISOString() })).status).toBe(409);
    const confirmed = await request(path, 'owner', 'POST', { decision: 'CONFIRM', expectedUpdatedAt: review.updatedAt });
    expect(confirmed.status).toBe(201);
    expect(confirmed.data).toMatchObject({ status: 'PENDING', classification: 'AMBIGUOUS' });
    expect((await drainOutbox()).find((r) => r.id === event.id)).toMatchObject({ status: 'DELIVERED' });

    const dismissId = await simulateMessage(connection.id, 'não quero mais receber, só o boleto', '5575955556666');
    await drainInbox();
    const dismiss = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${connection.id}:${dismissId}` } });
    ownedEvents.push(dismiss.id);
    const dismissed = await request(`/opt-outs/${dismiss.id}/resolve`, 'editor', 'POST', {
      decision: 'DISMISS',
      expectedUpdatedAt: dismiss.updatedAt.toISOString(),
    });
    expect(dismissed.status).toBe(201);
    expect(dismissed.data.status).toBe('DISMISSED');
    expect((await drainOutbox()).some((r) => r.id === dismiss.id)).toBe(false);

    const manual = await request('/opt-outs', 'editor', 'POST', { phone: '(75) 97777-8888', note: 'Pediu por telefone' });
    expect(manual.status).toBe(201);
    ownedEvents.push(manual.data.id);
    expect(manual.data).toMatchObject({ phone: '+5575977778888', classification: 'MANUAL', status: 'PENDING' });
    expect((await drainOutbox()).find((r) => r.id === manual.data.id)).toMatchObject({ status: 'DELIVERED' });
    expect((await request('/opt-outs', 'owner', 'POST', { phone: '12' })).status).toBe(400);
    const status = await request('/opt-outs/status');
    expect(status.status).toBe(200);
    expect(status.data.esferaLinkConfigured).toBe(false);
  });

  it('payload rejeitado pelo Esfera fica FAILED e pode ser reenfileirado pelo titular', async () => {
    const connection = await sandbox();
    const id = await simulateMessage(connection.id, 'descadastrar', '5575966667777');
    await drainInbox();
    const event = await db.optOutEvent.findUniqueOrThrow({ where: { eventKey: `whatsapp:${connection.id}:${id}` } });
    ownedEvents.push(event.id);
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', linksFor({ 'org-local': { companyId: 1, token: 'local-token-'.padEnd(32, 'x') } }));
    const original = respond;
    respond = () => ({ status: 400, body: { error: 'invalid_payload' } });
    try {
      expect((await drainOutbox()).find((r) => r.id === event.id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'ESFERA_REJECTED_INVALID_PAYLOAD',
      });
    } finally {
      respond = original;
    }
    const failed = (await request('/opt-outs?status=FAILED')).data.find((r: any) => r.id === event.id);
    expect((await request(`/opt-outs/${event.id}/retry`, 'editor', 'POST', { expectedUpdatedAt: failed.updatedAt })).status).toBe(403);
    const retried = await request(`/opt-outs/${event.id}/retry`, 'owner', 'POST', { expectedUpdatedAt: failed.updatedAt });
    expect(retried.status).toBe(201);
    expect(retried.data.status).toBe('PENDING');
    expect((await drainOutbox()).find((r) => r.id === event.id)).toMatchObject({ status: 'DELIVERED' });
  });
});
