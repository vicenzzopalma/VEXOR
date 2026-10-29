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
  isWhatsAppQuarantined,
  openSecrets,
  sealSecrets,
  validateOrigin,
  verifySignature,
  whatsappAdapter,
  parseWhatsAppEvents,
  connectorRegistry,
  connectorConfigurationReady,
  publicConnectorSettings,
  managedEvolutionConfiguration,
  managedEvolutionInstance,
  QUARANTINE_STATUS_REASONS,
  type Secrets,
  type Settings,
} from '@eimax/connectors';
import { WorkflowService } from './workflow.service';
import { parse } from './contracts';
import { type Workflow } from '@eimax/workflow-schema';
import { randomUUID } from 'node:crypto';
import type { WhatsAppConnection } from '@prisma/client';

export const connectionSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().optional(),
    name: z.string().trim().min(1).max(100),
    provider: z.enum(['META', 'Z_API', 'EVOLUTION', 'MOCK']),
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
        mockName: z.string().min(1).max(100).optional(),
      })
      .strict(),
    credentials: z
      .object({
        accessToken: z.string().max(5000).optional(),
        apiKey: z.string().max(5000).optional(),
        appSecret: z.string().max(5000).optional(),
        webhookSecret: z.string().min(24).max(5000).optional(),
        verifyToken: z.string().max(5000).optional(),
        token: z.string().max(5000).optional(),
        clientToken: z.string().max(5000).optional(),
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
    const row = await this.db.whatsAppConnection.findFirst({
      where: { id, organizationId, state: { not: 'ARCHIVED' } },
    });
    if (!row) throw new NotFoundException('Conexão não encontrada.');
    return row;
  }
  publicConnection(row: {
    id: string;
    organizationId: string;
    name: string;
    provider: string;
    state: string;
    settings: unknown;
    credentials: string | null;
    lastError: string | null;
    checkedAt: Date | null;
    quarantinedAt?: Date | null;
    quarantineReason?: string | null;
    updatedAt: Date;
  }) {
    const managed = this.isManaged(row);
    const quarantined = this.isConnectionQuarantined(row);
    let managedReady = false;
    if (managed) {
      try {
        managedEvolutionConfiguration(row.organizationId, row.id);
        managedReady = /^[a-f0-9]{64}$/i.test(process.env.CONNECTOR_ENCRYPTION_KEY ?? '');
      } catch {
        /* Central setup is unavailable. */
      }
    }
    const isMock = row.provider === 'MOCK';
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      state: row.state,
      managed,
      settings: managed ? {} : publicConnectorSettings(row.provider, row.settings),
      credentialsConfigured: isMock ? true : managed ? managedReady : !!row.credentials,
      lastError: row.lastError,
      checkedAt: row.checkedAt,
      updatedAt: row.updatedAt,
      quarantined,
      quarantinedAt: row.quarantinedAt ?? null,
      quarantineReason: row.quarantinedAt ? row.quarantineReason : this.isQuarantined() ? 'GLOBAL_KILL_SWITCH' : null,
      configurationRequired: isMock
        ? false
        : !(managed
            ? managedReady
            : connectorConfigurationReady(row.provider, row.settings, row.credentials)) ||
          (process.env.WHATSAPP_EXTERNAL_ENABLED !== 'true' &&
            process.env.WHATSAPP_SESSION_ENABLED !== 'true') ||
          !process.env.CONNECTOR_ENCRYPTION_KEY,
      webhookPath: `/webhooks/whatsapp/${row.id}`,
    };
  }
  // Emergency switch for the whole Evolution gateway; per-account isolation uses quarantinedAt.
  isQuarantined() {
    return isWhatsAppQuarantined();
  }
  private isConnectionQuarantined(row: { provider: string; quarantinedAt?: Date | null }) {
    return !!row.quarantinedAt || (row.provider === 'EVOLUTION' && this.isQuarantined());
  }
  private quarantineError(row: { quarantinedAt?: Date | null }) {
    return new ConflictException(
      row.quarantinedAt
        ? 'Esta conta está em quarentena porque o WhatsApp encerrou a sessão dela. As outras contas não são afetadas. Libere a quarentena para tentar de novo.'
        : 'Conexões por QR Code estão desligadas pelo administrador da instalação.',
    );
  }
  async releaseQuarantine(id: string, organizationId: string, body: unknown) {
    const input = parse(z.object({ expectedUpdatedAt: z.string().datetime() }).strict(), body);
    let row = await this.get(id, organizationId);
    if (!row.quarantinedAt) throw new BadRequestException('Esta conta não está em quarentena.');
    if (row.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new ConflictException('A conta mudou. Recarregue antes de liberar.');
    if (row.provider === 'EVOLUTION') {
      // The restricted session must not come back: remove it from the gateway before release.
      if (this.isQuarantined())
        throw new ConflictException('Conexões por QR Code estão desligadas pelo administrador da instalação.');
      try {
        if (this.isManaged(row)) row = await this.prepareManaged(row);
        const adapter = whatsappAdapter(
          row.provider,
          row.settings as Settings,
          row.credentials ? openSecrets(row.credentials) : {},
          undefined,
          true,
        );
        await adapter.deleteSession();
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        const code = error instanceof ConnectorError ? error.code : 'GATEWAY_UNAVAILABLE';
        throw new BadRequestException(`Não foi possível limpar a sessão antiga no gateway (${code}).`);
      }
    }
    const updated = await this.db.whatsAppConnection.updateMany({
      where: { id, organizationId, updatedAt: row.updatedAt },
      data: {
        quarantinedAt: null,
        quarantineReason: null,
        state: 'DISCONNECTED',
        enabled: false,
        lastError: null,
        checkedAt: new Date(),
      },
    });
    if (!updated.count) throw new ConflictException('A conta mudou. Recarregue antes de liberar.');
    return this.publicConnection(await this.get(id, organizationId));
  }
  private isManaged(row: { provider: string; settings: unknown; credentials: string | null }) {
    const settings = row.settings as Record<string, unknown>;
    return (
      row.provider === 'EVOLUTION' &&
      (settings.managed === true || (!row.credentials && !settings.origin && !settings.instance))
    );
  }
  async saveManaged(organizationId: string, body: unknown, id?: string) {
    const input = parse(
      z
        .object({
          name: z.string().trim().min(1).max(100),
          expectedUpdatedAt: z.string().datetime().optional(),
        })
        .strict(),
      body,
    );
    if (id) {
      const existing = await this.get(id, organizationId);
      if (existing.provider !== 'EVOLUTION')
        throw new BadRequestException('Esta conta não utiliza pareamento por QR Code.');
      if (input.expectedUpdatedAt !== existing.updatedAt.toISOString())
        throw new ConflictException('A conta mudou. Recarregue antes de salvar.');
      const updated = await this.db.whatsAppConnection.updateMany({
        where: { id, organizationId, updatedAt: existing.updatedAt },
        data: { name: input.name },
      });
      if (!updated.count) throw new ConflictException('A conta mudou. Recarregue antes de salvar.');
      return this.publicConnection(await this.get(id, organizationId));
    }
    const connectionId = randomUUID();
    return this.publicConnection(
      await this.db.whatsAppConnection.create({
        data: {
          id: connectionId,
          organizationId,
          name: input.name,
          provider: 'EVOLUTION',
          settings: { managed: true, instance: managedEvolutionInstance(organizationId, connectionId) },
          state: 'DISCONNECTED',
          enabled: false,
        },
      }),
    );
  }
  private async prepareManaged(row: WhatsAppConnection) {
    if (!this.isManaged(row)) return row;
    const config = managedEvolutionConfiguration(row.organizationId, row.id);
    let credentials = row.credentials;
    let unchanged = false;
    if (credentials) {
      try {
        const existing = openSecrets(credentials);
        unchanged =
          existing.apiKey === config.secrets.apiKey &&
          existing.webhookSecret === config.secrets.webhookSecret;
      } catch {
        /* Replace only from deployment configuration. */
      }
    }
    if (!unchanged) credentials = sealSecrets(config.secrets);
    const settings = { ...config.settings, managed: true };
    const currentSettings = row.settings as Record<string, unknown>;
    if (
      credentials === row.credentials &&
      currentSettings.managed === true &&
      currentSettings.origin === config.settings.origin &&
      currentSettings.instance === config.settings.instance
    )
      return row;
    const updated = await this.db.whatsAppConnection.updateMany({
      where: { id: row.id, organizationId: row.organizationId, updatedAt: row.updatedAt },
      data: { credentials, settings },
    });
    if (!updated.count) throw new ConflictException('A conta mudou. Recarregue antes de conectar.');
    return this.get(row.id, row.organizationId);
  }
  async list(organizationId: string) {
    const rows = await this.db.whatsAppConnection.findMany({
      where: { organizationId, state: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.publicConnection(row));
  }
  async archive(id: string, organizationId: string, body: unknown) {
    const input = parse(z.object({ expectedUpdatedAt: z.string().datetime() }).strict(), body);
    const row = await this.get(id, organizationId);
    if (row.enabled || !['DISCONNECTED', 'ERROR'].includes(row.state))
      throw new ConflictException('Desconecte a conta antes de removê-la da lista.');
    const updated = await this.db.whatsAppConnection.updateMany({
      where: {
        id,
        organizationId,
        updatedAt: new Date(input.expectedUpdatedAt),
        enabled: false,
        state: row.state,
      },
      data: { state: 'ARCHIVED', checkedAt: new Date() },
    });
    if (!updated.count) throw new ConflictException('A conta mudou. Recarregue antes de removê-la.');
    return { id, archived: true };
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
    if (existing && this.isManaged(existing))
      throw new BadRequestException(
        'Esta conexão é gerenciada pelo servidor. Apenas o nome pode ser alterado.',
      );
    if (existing && existing.provider !== input.provider)
      throw new BadRequestException('Cadastre outra conexão para mudar de provedor.');
    if (existing && existing.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new ConflictException('Recarregue a conta antes de salvar.');
    let credentials = existing?.credentials;
    if (input.credentials && Object.keys(input.credentials).length) {
      const validated = parse(connectorRegistry[input.provider].credentialsSchema, input.credentials);
      try {
        credentials = sealSecrets(validated);
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
    let row = await this.get(id, organizationId);
    // A quarantined account never reaches the provider; only a local disconnect is allowed.
    if (this.isConnectionQuarantined(row) && action !== 'disconnect') throw this.quarantineError(row);
    if (action === 'create-instance' && !['EVOLUTION', 'MOCK'].includes(row.provider)) {
      throw new BadRequestException('Esta conta não suporta criação de instâncias.');
    }
    if (action === 'refresh' && !row.enabled) return this.publicConnection(row);
    const unavailable = this.publicConnection(row).configurationRequired;
    if (action === 'disconnect' && (unavailable || this.isConnectionQuarantined(row)))
      return this.publicConnection(
        await this.db.whatsAppConnection.update({
          where: { id, updatedAt: row.updatedAt },
          data: { state: 'DISCONNECTED', enabled: false, checkedAt: new Date() },
        }),
      );
    if (unavailable)
      throw new BadRequestException(
        this.isManaged(row)
          ? 'O serviço WhatsApp ainda não foi habilitado pelo administrador. Você não precisa configurar gateway ou credenciais.'
          : 'Configuração necessária: credenciais, chave de criptografia e provedor autorizado.',
      );
    const managed = this.isManaged(row);
    if (managed) row = await this.prepareManaged(row);
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
      const secrets: Secrets = row.credentials ? openSecrets(row.credentials) : {};
      const adapter = whatsappAdapter(
        row.provider,
        row.settings as Settings,
        secrets,
        undefined,
        true,
      );
      if (managed && ['connect', 'reconnect'].includes(action)) {
        try {
          await adapter.status();
        } catch (error) {
          if (!(error instanceof ConnectorError) || error.code !== 'PROVIDER_HTTP_404') throw error;
          try {
            await adapter.createInstance();
          } catch (creationError) {
            if (!(creationError instanceof ConnectorError) || creationError.code !== 'PROVIDER_HTTP_409')
              throw creationError;
            await adapter.status();
          }
        }
      }
      let result: { state: string; qr?: string; expiresAt?: string };
      if (action === 'disconnect') {
        await adapter.disconnect();
        result = { state: 'DISCONNECTED' };
      } else if (action === 'refresh') {
        result = { state: await adapter.status() };
        // Same rule as VERITAS: a session closed as logged out/banned isolates only this account.
        const reason = result.state === 'DISCONNECTED' ? await adapter.closeReason() : undefined;
        if (reason !== undefined && QUARANTINE_STATUS_REASONS.includes(reason))
          return this.publicConnection(
            await this.db.whatsAppConnection.update({
              where: { id, updatedAt: lease.updatedAt },
              data: {
                state: 'ERROR',
                enabled: false,
                checkedAt: new Date(),
                lastError: `SESSION_CLOSED_${reason}`,
                quarantinedAt: new Date(),
                quarantineReason: `PROVIDER_STATUS_${reason}`,
              },
            }),
          );
      }
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
  async pairingCode(id: string, organizationId: string, body: unknown) {
    const input = parse(
      z
        .object({
          phoneNumber: z
            .string()
            .min(8)
            .max(30)
            .refine((val) => /^[1-9]\d{7,14}$/.test(val.replace(/[\s\-()+]/g, '')), {
              message: 'Número de telefone inválido.',
            }),
        })
        .strict(),
      body,
    );
    let row = await this.get(id, organizationId);
    if (row.provider === 'META') {
      throw new BadRequestException('Esta conta não suporta pareamento por código.');
    }
    if (this.isConnectionQuarantined(row)) throw this.quarantineError(row);
    const unavailable = this.publicConnection(row).configurationRequired;
    if (unavailable) {
      throw new BadRequestException(
        'Configuração necessária: credenciais, chave de criptografia e provedor autorizado.',
      );
    }
    const managed = this.isManaged(row);
    if (managed) row = await this.prepareManaged(row);
    const secrets: Secrets = row.credentials ? openSecrets(row.credentials) : {};
    const adapter = whatsappAdapter(
      row.provider,
      row.settings as Settings,
      secrets,
      undefined,
      true,
    );
    try {
      const result = await adapter.pairingCode(input.phoneNumber);
      return {
        id: row.id,
        code: result.code,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      const code = error instanceof ConnectorError ? error.code : 'PAIRING_CODE_FAILED';
      throw new BadRequestException(`Falha ao gerar código de pareamento (${code}).`);
    }
  }
  async verify(id: string, mode: string, token: string, challenge: string) {
    const row = await this.db.whatsAppConnection.findUnique({ where: { id } });
    if (!row?.credentials || row.state === 'ARCHIVED' || row.provider !== 'META')
      throw new HttpException('Webhook não autorizado.', 401);
    let secrets: Secrets;
    try {
      secrets = openSecrets(row.credentials);
    } catch {
      throw new HttpException('Webhook não autorizado.', 401);
    }
    if (
      mode !== 'subscribe' ||
      !challenge ||
      !secrets.verifyToken ||
      !equalSecret(token, secrets.verifyToken)
    )
      throw new HttpException('Webhook não autorizado.', 401);
    return challenge;
  }
  // Sandbox events never use the public webhook: they come from an authenticated member.
  async simulate(id: string, organizationId: string, body: unknown) {
    const row = await this.get(id, organizationId);
    if (row.provider !== 'MOCK') throw new BadRequestException('Simulação disponível apenas no Sandbox.');
    return this.persistEvents(row, body);
  }
  async webhook(id: string, body: any, raw: Buffer, signature: string, secret: string) {
    const row = await this.db.whatsAppConnection.findUnique({ where: { id } });
    if (!row || row.state === 'ARCHIVED') throw new HttpException('Webhook não autorizado.', 401);
    if (!row.credentials && row.provider !== 'MOCK')
      throw new HttpException('Webhook não autorizado.', 401);
    let secrets: Secrets = {};
    if (row.credentials) {
      try {
        secrets = openSecrets(row.credentials);
      } catch {
        throw new HttpException('Webhook não autorizado.', 401);
      }
    }
    const rawBuffer =
      Buffer.isBuffer(raw) && raw.length > 0
        ? raw
        : Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    let authorized = false;
    if (row.provider === 'META') {
      authorized = !!secrets.appSecret && verifySignature(rawBuffer, signature, secrets.appSecret);
    } else if (row.provider === 'Z_API') {
      // Fail closed: without a configured Client-Token anyone could inject inbound messages.
      authorized = !!secrets.clientToken && !!secret && equalSecret(secret, secrets.clientToken);
    } else if (row.provider === 'MOCK') {
      authorized = false;
    } else {
      authorized = !!secrets.webhookSecret && equalSecret(secret, secrets.webhookSecret);
    }
    if (!authorized) throw new HttpException('Webhook não autorizado.', 401);
    return this.persistEvents(row, body);
  }
  private async persistEvents(row: WhatsAppConnection, body: any) {
    const id = row.id;
    let events: ReturnType<typeof parseWhatsAppEvents>;
    try {
      events = parseWhatsAppEvents(row.provider, row.settings as Settings, body);
    } catch {
      throw new BadRequestException('Payload de webhook invalido.');
    }
    await this.db.$transaction(async (tx) => {
      const workflows = events.some((e) => e.kind === 'MESSAGE')
        ? await tx.workflow.findMany({
            // Fluxo inativo não é roteado; o worker confere de novo ao processar (pode ter sido desativado depois).
            where: { organizationId: row.organizationId, active: true, archivedAt: null, versions: { some: {} } },
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
