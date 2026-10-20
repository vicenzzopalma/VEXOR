import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  connectorRegistry,
  publicConnectorCatalog,
  sealSecrets,
  openSecrets,
  googleSheetsAdapter,
  resendAdapter,
  prepareGoogleAuthorization,
  mapSheetRows,
  exportSheetRows,
  sheetMappingSchema,
  sheetRowsSchema,
  verifyResendWebhook,
  resendEventSchema,
  ConnectorError,
} from '@eimax/connectors';
import { WorkflowService } from './workflow.service';
import { parse } from './contracts';

const saveSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    provider: z.enum(['RESEND', 'GOOGLE_SHEETS', 'RD_STATION', 'HUBSPOT']),
    settings: z.record(z.unknown()),
    credentials: z.record(z.string().max(10000)).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();
@Injectable()
export class IntegrationService {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  get db() {
    return this.workflows.db;
  }
  catalog() {
    return publicConnectorCatalog();
  }
  async get(id: string, organizationId: string) {
    const row = await this.db.integrationConnection.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Integração não encontrada.');
    return row;
  }
  publicConnection(row: {
    id: string;
    name: string;
    provider: string;
    state: string;
    enabled: boolean;
    settings: unknown;
    credentials: string | null;
    updatedAt: Date;
    lastError: string | null;
  }) {
    const flag =
      row.provider === 'RESEND'
        ? process.env.EMAIL_EXTERNAL_ENABLED
        : row.provider === 'GOOGLE_SHEETS'
          ? process.env.GOOGLE_SHEETS_EXTERNAL_ENABLED
          : undefined;
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      state: row.state,
      enabled: row.enabled,
      settings: row.settings,
      credentialsConfigured: !!row.credentials,
      updatedAt: row.updatedAt,
      lastError: row.lastError,
      configurationRequired:
        flag !== 'true' ||
        !row.credentials ||
        !process.env.CONNECTOR_ENCRYPTION_KEY ||
        connectorRegistry[row.provider].implementation === 'contract',
      homologated: false,
    };
  }
  async list(organizationId: string) {
    return (
      await this.db.integrationConnection.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((row) => this.publicConnection(row));
  }
  async save(organizationId: string, body: unknown, id?: string) {
    const input = parse(saveSchema, body);
    const definition = connectorRegistry[input.provider];
    const settings = parse(definition.settingsSchema.partial().strict(), input.settings) as Record<
      string,
      string
    >;
    const existing = id ? await this.get(id, organizationId) : null;
    if (existing && existing.provider !== input.provider)
      throw new BadRequestException('Cadastre outra integração para mudar de provedor.');
    if (
      existing &&
      (!input.expectedUpdatedAt || existing.updatedAt.toISOString() !== input.expectedUpdatedAt)
    )
      throw new ConflictException('A integração mudou. Recarregue antes de salvar.');
    let credentials = existing?.credentials;
    if (input.credentials) {
      const validated = parse(definition.credentialsSchema, input.credentials);
      try {
        credentials = sealSecrets(validated);
      } catch {
        throw new BadRequestException('Configure a chave de criptografia no servidor.');
      }
    }
    const data = {
      name: input.name,
      provider: input.provider,
      settings,
      credentials,
      state: 'DISCONNECTED',
      enabled: false,
      lastError: null,
    };
    try {
      return this.publicConnection(
        existing
          ? await this.db.integrationConnection.update({
              where: { id: existing.id, updatedAt: existing.updatedAt },
              data,
            })
          : await this.db.integrationConnection.create({ data: { ...data, organizationId } }),
      );
    } catch {
      throw new ConflictException('A integração mudou. Recarregue antes de salvar.');
    }
  }
  async operate(id: string, organizationId: string, action: 'enable' | 'disconnect') {
    const row = await this.get(id, organizationId);
    if (action === 'disconnect')
      return this.publicConnection(
        await this.db.integrationConnection.update({
          where: { id, updatedAt: row.updatedAt },
          data: { state: 'DISCONNECTED', enabled: false },
        }),
      );
    if (this.publicConnection(row).configurationRequired)
      throw new BadRequestException(
        'Configuração necessária. Nenhum serviço externo está habilitado para esta integração.',
      );
    try {
      const secrets = openSecrets(row.credentials!);
      if (row.provider === 'RESEND') await resendAdapter(row.settings, secrets).verify();
      else if (row.provider === 'GOOGLE_SHEETS') await googleSheetsAdapter(secrets).spreadsheets();
      else throw new ConnectorError('CAPABILITY_NOT_IMPLEMENTED');
      return this.publicConnection(
        await this.db.integrationConnection.update({
          where: { id, updatedAt: row.updatedAt },
          data: { state: 'CONNECTED', enabled: true, lastError: null },
        }),
      );
    } catch (error) {
      const code = error instanceof ConnectorError ? error.code : 'CONNECTION_CHANGED_OR_FAILED';
      await this.db.integrationConnection.updateMany({
        where: { id, updatedAt: row.updatedAt },
        data: { state: 'ERROR', enabled: false, lastError: code },
      });
      throw new BadRequestException(`Não foi possível validar a integração (${code}).`);
    }
  }
  async prepareOAuth(id: string, organizationId: string) {
    const row = await this.get(id, organizationId);
    if (row.provider !== 'GOOGLE_SHEETS')
      throw new BadRequestException('Autorização deste provedor ainda está em preparação.');
    if (
      !process.env.GOOGLE_OAUTH_CLIENT_ID ||
      !process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      !process.env.CONNECTOR_ENCRYPTION_KEY
    )
      return { configurationRequired: true, authorizationUrl: null, status: 'CONFIGURATION_REQUIRED' };
    const prepared = prepareGoogleAuthorization(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
    );
    const expiresAt = new Date(Date.now() + 600000);
    await this.db.integrationOAuthAttempt.create({
      data: {
        integrationId: id,
        organizationId,
        stateHash: createHash('sha256').update(prepared.state).digest('hex'),
        verifier: sealSecrets({ verifier: prepared.verifier }),
        redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
        expiresAt,
      },
    });
    return {
      configurationRequired: true,
      status: 'PREPARED_AWAITING_TOKEN_EXCHANGE',
      authorizationUrl: prepared.authorizationUrl,
      expiresAt,
      message: 'Preparação local concluída. Troca de tokens e homologação OAuth ainda não habilitadas.',
    };
  }
  async consumeOAuthState(id: string, organizationId: string, state: string) {
    await this.get(id, organizationId);
    return this.db.$transaction(async (tx) => {
      const hash = createHash('sha256').update(state).digest('hex');
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "IntegrationOAuthAttempt" WHERE "integrationId"=${id} AND "organization_id"=${organizationId} AND "stateHash"=${hash} AND "usedAt" IS NULL AND "expiresAt">${new Date()} FOR UPDATE`;
      if (!rows[0]) throw new BadRequestException('Autorização expirada, inválida ou já utilizada.');
      return tx.integrationOAuthAttempt.update({ where: { id: rows[0].id }, data: { usedAt: new Date() } });
    });
  }
  async sheets(id: string, organizationId: string, spreadsheetId?: string) {
    const row = await this.get(id, organizationId);
    if (row.provider !== 'GOOGLE_SHEETS')
      throw new BadRequestException('Selecione uma conexão Google Sheets.');
    if (this.publicConnection(row).configurationRequired || !row.enabled || row.state !== 'CONNECTED')
      return { configurationRequired: true, items: [] };
    const adapter = googleSheetsAdapter(openSecrets(row.credentials!));
    return {
      configurationRequired: false,
      items: spreadsheetId ? await adapter.tabs(spreadsheetId) : await adapter.spreadsheets(),
    };
  }
  async previewImport(id: string, organizationId: string, body: unknown) {
    const row = await this.get(id, organizationId);
    if (row.provider !== 'GOOGLE_SHEETS') throw new BadRequestException('Selecione Google Sheets.');
    const input = parse(
      z
        .object({
          mapping: sheetMappingSchema,
          headers: z.array(z.string().max(100)).max(30),
          rows: sheetRowsSchema,
        })
        .strict(),
      body,
    );
    try {
      return {
        mode: 'LOCAL_PREVIEW',
        persisted: false,
        rows: mapSheetRows(input.headers, input.rows, input.mapping),
      };
    } catch {
      throw new BadRequestException('Revise as colunas e o mapeamento.');
    }
  }
  async previewExport(id: string, organizationId: string, body: unknown) {
    const row = await this.get(id, organizationId);
    if (row.provider !== 'GOOGLE_SHEETS') throw new BadRequestException('Selecione Google Sheets.');
    const input = parse(
      z
        .object({ mapping: sheetMappingSchema, leadIds: z.array(z.string().min(1).max(100)).min(1).max(100) })
        .strict(),
      body,
    );
    const leads = await this.db.lead.findMany({ where: { id: { in: input.leadIds }, organizationId } });
    if (leads.length !== new Set(input.leadIds).size)
      throw new NotFoundException('Lead não encontrado nesta organização.');
    return { mode: 'LOCAL_PREVIEW', externalWrites: 0, ...exportSheetRows(leads, input.mapping) };
  }
  async emailWebhook(
    id: string,
    raw: Buffer,
    headers: { id: string; timestamp: string; signature: string },
    body: unknown,
  ) {
    const row = await this.db.integrationConnection.findUnique({ where: { id } });
    if (!row?.credentials || row.provider !== 'RESEND')
      throw new HttpException('Webhook não autorizado.', 401);
    let secret: string | undefined;
    try {
      secret = openSecrets(row.credentials).webhookSecret;
    } catch {
      /* Fail closed. */
    }
    if (!secret || !verifyResendWebhook(raw, headers, secret))
      throw new HttpException('Webhook não autorizado.', 401);
    const event = parse(resendEventSchema, body);
    const kind: Record<string, string> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.bounced': 'FAILED',
      'email.failed': 'FAILED',
      'email.complained': 'FAILED',
      'email.opened': 'OPENED',
    };
    await this.db.integrationEvent.upsert({
      where: { integrationId_providerEventId: { integrationId: id, providerEventId: headers.id } },
      update: {},
      create: {
        integrationId: id,
        providerEventId: headers.id,
        providerMessageId: event.data.email_id,
        kind: kind[event.type],
      },
    });
    return { accepted: true, processing: 'ASYNCHRONOUS' };
  }
}
