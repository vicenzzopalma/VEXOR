import { z } from 'zod';

export const connectionStates = [
  'DISCONNECTED',
  'CONNECTING',
  'WAITING_FOR_QR',
  'CONNECTED',
  'RECONNECTING',
  'ERROR',
] as const;
const identifier = z.string().trim().min(1).max(200);
const token = z
  .string()
  .min(1)
  .max(10000)
  .refine((value) => !/[\r\n]/.test(value), 'Credencial inválida.');
export type FormField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'email';
  required?: boolean;
};
type Operation = { id: string; label: string; schema: z.ZodTypeAny };
export type ConnectorDefinition = {
  id: string;
  version: string;
  name: string;
  channel: string;
  authentication: 'bearer' | 'api-key' | 'oauth2';
  settingsSchema: z.AnyZodObject;
  credentialsSchema: z.AnyZodObject;
  fields: FormField[];
  secretFields: FormField[];
  actions: Operation[];
  triggers: Operation[];
  capabilities: {
    qr: boolean;
    pairingCode: boolean;
    createInstance: boolean;
    templates: boolean;
    oauth: boolean;
    providerIdempotency: boolean;
    deliveryReceipts: boolean;
  };
  implementation: 'adapter' | 'contract';
};
const message = z
  .object({ to: z.string().regex(/^\+?[1-9]\d{7,14}$/), text: z.string().trim().min(1).max(4096) })
  .strict();
export const sheetMappingSchema = z
  .object({
    spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
    sheet: z.string().min(1).max(100),
    fields: z
      .array(
        z
          .object({
            column: z.string().min(1).max(100),
            field: z.enum(['name', 'email', 'company', 'phone', 'source', 'budget', 'score']),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.fields.map((f) => f.column)).size !== value.fields.length ||
      new Set(value.fields.map((f) => f.field)).size !== value.fields.length
    )
      ctx.addIssue({ code: 'custom', message: 'Não repita colunas ou campos no mapeamento.' });
  });
const baseCapabilities = {
  qr: false,
  pairingCode: false,
  createInstance: false,
  templates: false,
  oauth: false,
  providerIdempotency: false,
  deliveryReceipts: false,
};
export const connectorRegistry: Record<string, ConnectorDefinition> = {
  META: {
    id: 'whatsapp.meta',
    version: '1.0.0',
    name: 'WhatsApp Business Platform',
    channel: 'WHATSAPP',
    authentication: 'bearer',
    implementation: 'adapter',
    settingsSchema: z
      .object({
        phoneNumberId: z.string().regex(/^\d+$/),
        apiVersion: z.string().regex(/^v\d+\.\d+$/),
        wabaId: z.string().regex(/^\d+$/).optional(),
      })
      .strict(),
    credentialsSchema: z.object({ accessToken: token, appSecret: token, verifyToken: token }).strict(),
    fields: [
      { key: 'phoneNumberId', label: 'Identificador do número', type: 'text', required: true },
      { key: 'apiVersion', label: 'Versão Graph habilitada', type: 'text', required: true },
      { key: 'wabaId', label: 'Identificador WABA', type: 'text' },
    ],
    secretFields: [
      { key: 'accessToken', label: 'Token de acesso', type: 'password', required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
      { key: 'verifyToken', label: 'Token de verificação', type: 'password', required: true },
    ],
    actions: [
      { id: 'text.send', label: 'Enviar texto', schema: message },
      {
        id: 'template.send',
        label: 'Enviar template aprovado',
        schema: z.object({ to: message.shape.to, template: identifier, language: identifier }).strict(),
      },
    ],
    triggers: [
      {
        id: 'message.received',
        label: 'Mensagem recebida',
        schema: z.object({ id: identifier, from: identifier, text: z.string().max(10000) }),
      },
    ],
    capabilities: { ...baseCapabilities, templates: true, deliveryReceipts: true },
  },
  EVOLUTION: {
    id: 'whatsapp.evolution',
    version: '1.0.0',
    name: 'Evolution API',
    channel: 'WHATSAPP',
    authentication: 'api-key',
    implementation: 'adapter',
    settingsSchema: z
      .object({ origin: z.string().url(), instance: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) })
      .strict(),
    credentialsSchema: z.object({ apiKey: token, webhookSecret: z.string().min(24).max(10000) }).strict(),
    fields: [
      { key: 'origin', label: 'Gateway HTTPS autorizado', type: 'url', required: true },
      { key: 'instance', label: 'Instância', type: 'text', required: true },
    ],
    secretFields: [
      { key: 'apiKey', label: 'Chave da API', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Segredo do webhook', type: 'password', required: true },
    ],
    actions: [
      { id: 'text.send', label: 'Enviar texto', schema: message },
      {
        id: 'instance.create',
        label: 'Criar instância',
        schema: z.object({ instanceName: identifier }).strict(),
      },
    ],
    triggers: [
      {
        id: 'message.received',
        label: 'Mensagem recebida',
        schema: z.object({ id: identifier, from: identifier, text: z.string().max(10000) }),
      },
    ],
    capabilities: {
      ...baseCapabilities,
      qr: true,
      pairingCode: true,
      createInstance: true,
      deliveryReceipts: true,
    },
  },
  Z_API: {
    id: 'whatsapp.zapi',
    version: '1.0.0',
    name: 'Z-API WhatsApp',
    channel: 'WHATSAPP',
    authentication: 'api-key',
    implementation: 'adapter',
    settingsSchema: z
      .object({
        origin: z.string().url().default('https://api.z-api.io'),
        instance: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
      })
      .strict(),
    // Secrets live only in encrypted credentials, never in plaintext settings.
    credentialsSchema: z
      .object({
        token: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
        clientToken: token,
      })
      .strict(),
    fields: [
      { key: 'origin', label: 'Gateway Z-API', type: 'url' },
      { key: 'instance', label: 'ID da Instância Z-API', type: 'text', required: true },
    ],
    secretFields: [
      { key: 'token', label: 'Token da Instância', type: 'password' },
      { key: 'clientToken', label: 'Client-Token de Segurança', type: 'password' },
    ],
    actions: [
      { id: 'text.send', label: 'Enviar texto', schema: message },
    ],
    triggers: [
      {
        id: 'message.received',
        label: 'Mensagem recebida',
        schema: z.object({ id: identifier, from: identifier, text: z.string().max(10000) }),
      },
    ],
    // Templates are only implemented for the official Meta platform.
    capabilities: { ...baseCapabilities, qr: true, pairingCode: true, deliveryReceipts: true },
  },
  MOCK: {
    id: 'whatsapp.mock',
    version: '1.0.0',
    name: 'WhatsApp Sandbox Mock',
    channel: 'WHATSAPP',
    authentication: 'api-key',
    implementation: 'adapter',
    settingsSchema: z
      .object({
        mockName: z.string().min(1).max(100).optional(),
      })
      .strict(),
    credentialsSchema: z.object({}).strict(),
    fields: [{ key: 'mockName', label: 'Nome do ambiente mock', type: 'text' }],
    secretFields: [],
    actions: [
      { id: 'text.send', label: 'Enviar texto (simulado)', schema: message },
    ],
    triggers: [
      {
        id: 'message.received',
        label: 'Mensagem recebida (simulada)',
        schema: z.object({ id: identifier, from: identifier, text: z.string().max(10000) }),
      },
    ],
    capabilities: {
      ...baseCapabilities,
      qr: true,
      pairingCode: true,
      createInstance: true,
      deliveryReceipts: true,
    },
  },
  RESEND: {
    id: 'email.resend',
    version: '1.0.0',
    name: 'E-mail · Resend',
    channel: 'EMAIL',
    authentication: 'api-key',
    implementation: 'adapter',
    settingsSchema: z.object({ from: z.string().email() }).strict(),
    credentialsSchema: z.object({ apiKey: token, webhookSecret: token.optional() }).strict(),
    fields: [{ key: 'from', label: 'Remetente verificado no provedor', type: 'email', required: true }],
    secretFields: [
      { key: 'apiKey', label: 'Chave da API', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Segredo de assinatura dos recibos', type: 'password' },
    ],
    actions: [
      {
        id: 'email.send',
        label: 'Enviar e-mail',
        schema: z
          .object({
            to: z.string().email(),
            subject: z.string().min(1).max(200),
            text: z.string().min(1).max(5000),
          })
          .strict(),
      },
    ],
    triggers: [],
    capabilities: { ...baseCapabilities, providerIdempotency: true, deliveryReceipts: true },
  },
  GOOGLE_SHEETS: {
    id: 'google.sheets',
    version: '1.0.0',
    name: 'Google Sheets',
    channel: 'SHEETS',
    authentication: 'oauth2',
    implementation: 'adapter',
    settingsSchema: z.object({ spreadsheetId: identifier.optional(), sheet: identifier.optional() }).strict(),
    credentialsSchema: z.object({ accessToken: token, refreshToken: token.optional() }).strict(),
    fields: [],
    secretFields: [],
    actions: [
      { id: 'rows.append', label: 'Exportar leads', schema: sheetMappingSchema },
      { id: 'rows.read', label: 'Importar leads', schema: sheetMappingSchema },
    ],
    triggers: [],
    capabilities: { ...baseCapabilities, oauth: true },
  },
  RD_STATION: {
    id: 'crm.rdstation',
    version: '1.0.0',
    name: 'RD Station',
    channel: 'CRM',
    authentication: 'oauth2',
    implementation: 'contract',
    settingsSchema: z.object({}).strict(),
    credentialsSchema: z.object({ accessToken: token }).strict(),
    fields: [],
    secretFields: [],
    actions: [
      {
        id: 'contact.upsert',
        label: 'Atualizar contato',
        schema: z.object({ email: z.string().email(), name: identifier }).strict(),
      },
    ],
    triggers: [],
    capabilities: { ...baseCapabilities, oauth: true },
  },
  HUBSPOT: {
    id: 'crm.hubspot',
    version: '1.0.0',
    name: 'HubSpot',
    channel: 'CRM',
    authentication: 'oauth2',
    implementation: 'contract',
    settingsSchema: z.object({}).strict(),
    credentialsSchema: z.object({ accessToken: token }).strict(),
    fields: [],
    secretFields: [],
    actions: [
      {
        id: 'contact.upsert',
        label: 'Atualizar contato',
        schema: z.object({ email: z.string().email(), name: identifier }).strict(),
      },
    ],
    triggers: [],
    capabilities: { ...baseCapabilities, oauth: true },
  },
};
export function publicConnectorCatalog() {
  return Object.entries(connectorRegistry).map(([provider, definition]) => ({
    provider,
    id: definition.id,
    version: definition.version,
    name: definition.name,
    channel: definition.channel,
    authentication: definition.authentication,
    fields: definition.fields,
    secretFields: definition.secretFields,
    actions: definition.actions.map(({ id, label }) => ({ id, label })),
    triggers: definition.triggers.map(({ id, label }) => ({ id, label })),
    states: connectionStates,
    capabilities: definition.capabilities,
    implementation: definition.implementation,
    homologated: false,
  }));
}

export function publicConnectorSettings(provider: string, input: unknown): Record<string, unknown> {
  const definition = connectorRegistry[provider];
  if (!definition) return {};
  const parsed = definition.settingsSchema.partial().strip().safeParse(input);
  if (!parsed.success) return {};
  const settings: Record<string, unknown> = parsed.data;
  if (provider === 'META') {
    const templates = z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z0-9_]{1,200}$/),
            language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
          })
          .strip(),
      )
      .max(100)
      .safeParse((input as Record<string, unknown>)?.approvedTemplates);
    if (templates.success) settings.approvedTemplates = templates.data;
  }
  if (provider === 'Z_API') {
    delete settings.token;
    delete settings.clientToken;
  }
  return settings;
}
