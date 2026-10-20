import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ConnectorError,
  equalSecret,
  openSecrets,
  sealSecrets,
  validateOrigin,
  verifySignature,
  whatsappAdapter,
  parseWhatsAppEvents,
  type Secrets,
  type Settings,
} from '@eimax/connectors';
import { WorkflowService } from './workflow.service';
import { parse } from './contracts';
import { type Workflow } from '@eimax/workflow-schema';

export const connectionSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().optional(),
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
    updatedAt: Date;
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
      updatedAt: row.updatedAt,
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
    if (existing && existing.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new ConflictException('Recarregue a conta antes de salvar.');
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
      ? await this.db.whatsAppConnection
          .update({ where: { id, updatedAt: existing!.updatedAt }, data })
          .catch(() => {
            throw new ConflictException('A conta mudou. Recarregue antes de salvar.');
          })
      : await this.db.whatsAppConnection.create({ data });
    return this.publicConnection(row);
  }
  async operate(
    id: string,
    organizationId: string,
    action: 'connect' | 'refresh' | 'disconnect' | 'create-instance' | 'reconnect',
  ) {
    const row = await this.get(id, organizationId);
    if (action === 'refresh' && !row.enabled) return this.publicConnection(row);
    const unavailable = this.publicConnection(row).configurationRequired;
    if (action === 'disconnect' && unavailable)
      return this.publicConnection(
        await this.db.whatsAppConnection.update({
          where: { id, updatedAt: row.updatedAt },
          data: { state: 'DISCONNECTED', enabled: false },
        }),
      );
    if (unavailable)
      throw new BadRequestException(
        'Configuração necessária: credenciais, chave de criptografia e provedor autorizado.',
      );
    // CAS reserves this operation; a later edit/disconnect fences stale provider results.
    const lease = await this.db.whatsAppConnection
      .update({
        where: { id, updatedAt: row.updatedAt },
        data: {
          state:
            action === 'disconnect'
              ? 'DISCONNECTED'
              : action === 'refresh'
                ? row.state
                : action === 'reconnect'
                  ? 'RECONNECTING'
                  : 'CONNECTING',
          enabled: action !== 'disconnect',
        },
      })
      .catch(() => {
        throw new ConflictException('A conta mudou. Recarregue antes de continuar.');
      });
    try {
      const adapter = whatsappAdapter(row.provider, row.settings as Settings, openSecrets(row.credentials!));
      let result: { state: string; qr?: string; expiresAt?: string };
      if (action === 'disconnect') {
        await adapter.disconnect();
        result = { state: 'DISCONNECTED' };
      } else if (action === 'refresh') result = { state: await adapter.status() };
      else if (action === 'create-instance') {
        await adapter.createInstance();
        result = { state: 'DISCONNECTED' };
      } else result = action === 'reconnect' ? await adapter.reconnect() : await adapter.connect();
      const settings = row.settings as Settings;
      const approvedTemplates =
        row.provider === 'META' && result.state === 'CONNECTED'
          ? await adapter.templates()
          : settings.approvedTemplates;
      const updated = await this.db.whatsAppConnection.update({
        where: { id, updatedAt: lease.updatedAt },
        data: {
          state: result.state,
          enabled: !['disconnect', 'create-instance'].includes(action),
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
      const code = error instanceof ConnectorError ? error.code : 'CONNECTION_CHANGED_OR_FAILED';
      await this.db.whatsAppConnection.updateMany({
        where: { id, updatedAt: lease.updatedAt },
        data: {
          state: action === 'disconnect' ? 'DISCONNECTED' : 'ERROR',
          enabled: false,
          checkedAt: new Date(),
          lastError: code,
        },
      });
      throw new BadRequestException(`Falha ao confirmar a conta (${code}).`);
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
    let events: ReturnType<typeof parseWhatsAppEvents>;
    try {
      events = parseWhatsAppEvents(row.provider, row.settings as Settings, body);
    } catch {
      throw new BadRequestException('Payload de webhook invalido.');
    }
    await this.db.$transaction(async (tx) => {
      const workflows = events.some((e) => e.kind === 'MESSAGE')
        ? await tx.workflow.findMany({
            where: { organizationId: row.organizationId, versions: { some: {} } },
            include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
          })
        : [];
      const routing = workflows
        .filter((workflow) =>
          (workflow.versions[0].snapshot as unknown as Workflow).nodes.some(
            (n) => n.type === 'whatsapp.message.received' && n.config.connectionId === row.id,
          ),
        )
        .map((workflow) => workflow.versions[0].id);
      for (const event of events)
        await tx.whatsAppEvent.upsert({
          where: {
            connectionId_providerEventId_kind: {
              connectionId: id,
              providerEventId: event.id,
              kind: event.kind,
            },
          },
          update: {},
          create: {
            connectionId: id,
            providerEventId: event.id,
            kind: event.kind,
            payload: JSON.parse(JSON.stringify(event.payload)),
            routing: event.kind === 'MESSAGE' ? routing : [],
            status: 'PENDING',
          },
        });
    });
    return { accepted: true, persistedEvents: events.length, processing: 'ASYNCHRONOUS' };
  }
}
