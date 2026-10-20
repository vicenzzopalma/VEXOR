import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  ConnectorError,
  equalSecret,
  openSecrets,
  sealSecrets,
  validateOrigin,
  verifySignature,
  whatsappAdapter,
  type Secrets,
  type Settings,
} from '@eimax/connectors';
import { WorkflowService } from './workflow.service';
import { parse } from './contracts';
import { type Workflow } from '@eimax/workflow-schema';

export const connectionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    provider: z.enum(['META', 'EVOLUTION']),
    settings: z
      .object({
        origin: z.string().url().optional(),
        instance: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,80}$/)
          .optional(),
        phoneNumberId: z.string().regex(/^\d+$/).optional(),
        wabaId: z.string().regex(/^\d+$/).optional(),
        apiVersion: z
          .string()
          .regex(/^v\d+\.\d+$/)
          .optional(),
      })
      .strict(),
    credentials: z
      .object({
        accessToken: z.string().max(5000).optional(),
        apiKey: z.string().max(5000).optional(),
        appSecret: z.string().max(5000).optional(),
        webhookSecret: z.string().min(24).max(5000).optional(),
        verifyToken: z.string().max(5000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

@Injectable()
export class WhatsAppService {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  get db() {
    return this.workflows.db;
  }
  async get(id: string, organizationId: string) {
    const row = await this.db.whatsAppConnection.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Conexão não encontrada.');
    return row;
  }
  publicConnection(row: {
    id: string;
    name: string;
    provider: string;
    state: string;
    settings: unknown;
    credentials: string | null;
    lastError: string | null;
    checkedAt: Date | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      state: row.state,
      settings: row.settings,
      credentialsConfigured: !!row.credentials,
      lastError: row.lastError,
      checkedAt: row.checkedAt,
      configurationRequired:
        !row.credentials ||
        process.env.WHATSAPP_EXTERNAL_ENABLED !== 'true' ||
        !process.env.CONNECTOR_ENCRYPTION_KEY,
      webhookPath: `/webhooks/whatsapp/${row.id}`,
    };
  }
  async list(organizationId: string) {
    const rows = await this.db.whatsAppConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.publicConnection(row));
  }
  async save(organizationId: string, body: unknown, id?: string) {
    const input = parse(connectionSchema, body);
    if (input.settings.origin) {
      try {
        validateOrigin(input.settings.origin, input.provider);
      } catch {
        throw new BadRequestException('Gateway HTTPS não autorizado na configuração do servidor.');
      }
    }
    const existing = id ? await this.get(id, organizationId) : undefined;
    if (existing && existing.provider !== input.provider)
      throw new BadRequestException('Cadastre outra conexão para mudar de provedor.');
    let credentials = existing?.credentials;
    if (input.credentials && Object.keys(input.credentials).length) {
      try {
        credentials = sealSecrets(input.credentials);
      } catch {
        throw new BadRequestException('Configure a chave de criptografia de conectores no servidor.');
      }
    }
    const data = {
      organizationId,
      name: input.name,
      provider: input.provider,
      settings: input.settings,
      credentials,
      state: 'DISCONNECTED',
      enabled: false,
      lastError: null,
    };
    const row = id
      ? await this.db.whatsAppConnection.update({ where: { id }, data })
      : await this.db.whatsAppConnection.create({ data });
    return this.publicConnection(row);
  }
  async operate(id: string, organizationId: string, action: 'connect' | 'refresh' | 'disconnect') {
    const row = await this.get(id, organizationId);
    if (action === 'refresh' && !row.enabled) return this.publicConnection(row);
    if (action === 'disconnect' && !row.credentials) {
      return this.publicConnection(
        await this.db.whatsAppConnection.update({ where: { id }, data: { state: 'DISCONNECTED' } }),
      );
    }
    if (this.publicConnection(row).configurationRequired)
      throw new BadRequestException(
        'Configuração necessária: credenciais, chave de criptografia e provedor autorizado.',
      );
    try {
      const adapter = whatsappAdapter(row.provider, row.settings as Settings, openSecrets(row.credentials!));
      let result: { state: string; qr?: string; expiresAt?: string };
      if (action === 'disconnect') {
        await this.db.whatsAppConnection.update({
          where: { id },
          data: { enabled: false, state: 'DISCONNECTED' },
        });
        await adapter.disconnect();
        result = { state: 'DISCONNECTED' };
      } else if (action === 'refresh') result = { state: await adapter.status() };
      else {
        await this.db.whatsAppConnection.update({
          where: { id },
          data: { state: row.state === 'DISCONNECTED' ? 'CONNECTING' : 'RECONNECTING' },
        });
        result = await adapter.connect();
      }
      const settings = row.settings as Settings;
      const approvedTemplates =
        row.provider === 'META' && result.state === 'CONNECTED'
          ? await adapter.templates()
          : settings.approvedTemplates;
      const updated = await this.db.whatsAppConnection.update({
        where: { id },
        data: {
          state: result.state,
          enabled: action !== 'disconnect',
          checkedAt: new Date(),
          lastError: null,
          settings: JSON.parse(
            JSON.stringify({ ...settings, ...(approvedTemplates ? { approvedTemplates } : {}) }),
          ),
        },
      });
      return {
        ...this.publicConnection(updated),
        ...(result.qr ? { qr: result.qr, expiresAt: result.expiresAt } : {}),
      };
    } catch (error) {
      const code = error instanceof ConnectorError ? error.code : 'CONNECTION_FAILED';
      await this.db.whatsAppConnection.update({
        where: { id },
        data: { state: 'ERROR', checkedAt: new Date(), lastError: code },
      });
      throw new BadRequestException(`Não foi possível confirmar a conexão (${code}).`);
    }
  }
  async verify(id: string, mode: string, token: string, challenge: string) {
    const row = await this.db.whatsAppConnection.findUnique({ where: { id } });
    if (!row?.credentials || row.provider !== 'META') throw new HttpException('Webhook não autorizado.', 401);
    const secrets = openSecrets(row.credentials);
    if (mode !== 'subscribe' || !secrets.verifyToken || !equalSecret(token, secrets.verifyToken))
      throw new HttpException('Webhook não autorizado.', 401);
    return challenge;
  }
  async webhook(id: string, body: any, raw: Buffer, signature: string, secret: string) {
    const row = await this.db.whatsAppConnection.findUnique({ where: { id } });
    if (!row?.credentials) throw new HttpException('Webhook não autorizado.', 401);
    let secrets: Secrets;
    try {
      secrets = openSecrets(row.credentials);
    } catch {
      throw new HttpException('Webhook não autorizado.', 401);
    }
    const authorized =
      row.provider === 'META'
        ? !!secrets.appSecret && verifySignature(raw, signature, secrets.appSecret)
        : !!secrets.webhookSecret && equalSecret(secret, secrets.webhookSecret);
    if (!authorized) throw new HttpException('Webhook não autorizado.', 401);
    const settings = row.settings as Settings;
    const events: { id: string; kind: string; payload: any }[] = [];
    if (row.provider === 'META') {
      for (const entry of body?.entry ?? [])
        for (const change of entry.changes ?? []) {
          const value = change.value;
          if (value?.metadata?.phone_number_id !== settings.phoneNumberId) continue;
          for (const status of value.statuses ?? [])
            events.push({
              id: status.id,
              kind: String(status.status).toUpperCase(),
              payload: { providerMessageId: status.id },
            });
          for (const message of value.messages ?? [])
            events.push({
              id: message.id,
              kind: 'MESSAGE',
              payload: { from: message.from, text: message.text?.body ?? '', timestamp: message.timestamp },
            });
        }
    } else if (body?.instance === settings.instance) {
      if (body.event === 'messages.upsert' && !body.data?.key?.fromMe)
        events.push({
          id: body.data?.key?.id,
          kind: 'MESSAGE',
          payload: {
            from: body.data?.key?.remoteJid?.split('@')[0],
            text: body.data?.message?.conversation ?? '',
            timestamp: body.data?.messageTimestamp,
          },
        });
      if (body.event === 'messages.update') {
        const statuses: Record<string, string> = {
          SERVER_ACK: 'SENT',
          DELIVERY_ACK: 'DELIVERED',
          READ: 'READ',
          ERROR: 'FAILED',
        };
        const kind = statuses[String(body.data?.status)];
        if (kind)
          events.push({
            id: body.data?.keyId ?? body.data?.key?.id,
            kind,
            payload: { providerMessageId: body.data?.keyId ?? body.data?.key?.id },
          });
      }
      if (body.event === 'connection.update') {
        // Verify gateway state through its authenticated API before trusting CONNECTED.
        if (body.data?.state === 'close')
          await this.db.whatsAppConnection.update({
            where: { id },
            data: { state: 'DISCONNECTED', checkedAt: new Date() },
          });
      }
    }
    for (const event of events) {
      if (typeof event.id !== 'string' || !event.id || event.id.length > 250) continue;
      await this.db.$transaction(async (tx) => {
        await tx.whatsAppEvent.upsert({
          where: {
            connectionId_providerEventId_kind: {
              connectionId: id,
              providerEventId: event.id,
              kind: event.kind,
            },
          },
          update: {},
          create: { connectionId: id, providerEventId: event.id, kind: event.kind, payload: event.payload },
        });
        const prior: Record<string, string[]> = {
          SENT: ['PENDING', 'PROCESSING'],
          DELIVERED: ['PENDING', 'PROCESSING', 'SENT'],
          READ: ['PENDING', 'PROCESSING', 'SENT', 'DELIVERED'],
          FAILED: ['PENDING', 'PROCESSING', 'SENT'],
        };
        if (prior[event.kind])
          await tx.notification.updateMany({
            where: {
              organizationId: row.organizationId,
              connectionId: id,
              providerMessageId: event.id,
              status: { in: prior[event.kind] },
            },
            data: { status: event.kind },
          });
      });
      if (event.kind === 'MESSAGE' && row.enabled && row.state === 'CONNECTED') {
        const phone = String(event.payload.from ?? '');
        if (!/^\+?[1-9]\d{7,14}$/.test(phone)) continue;
        const timestamp = Number(event.payload.timestamp);
        const receivedAt =
          Number.isFinite(timestamp) && timestamp > 0 && timestamp * 1000 <= Date.now() + 60000
            ? new Date(timestamp * 1000)
            : new Date();
        const workflows = await this.db.workflow.findMany({
          where: { organizationId: row.organizationId, versions: { some: {} } },
          include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
        });
        for (const workflow of workflows) {
          const version = workflow.versions[0];
          const flow = version.snapshot as unknown as Workflow;
          if (
            !flow.nodes.some(
              (n) => n.type === 'whatsapp.message.received' && n.config.connectionId === row.id,
            )
          )
            continue;
          await this.workflows.enqueue({
            prisma: this.db,
            organizationId: row.organizationId,
            workflowId: workflow.id,
            versionId: version.id,
            eventKey: `whatsapp:${row.id}:${event.id}`,
            externalContactKey: `${row.id}:${phone}`,
            inboundAt: receivedAt,
            leadData: {
              name: 'Contato WhatsApp',
              company: 'Não informada',
              email: '',
              phone,
              budget: 0,
              score: 0,
              source: 'whatsapp',
            },
          });
        }
      }
    }
    return { accepted: true };
  }
}
