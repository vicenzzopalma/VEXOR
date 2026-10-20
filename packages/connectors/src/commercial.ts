import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ConnectorError, equalSecret, secureTransport, type Transport } from './index';
import { connectorRegistry, sheetMappingSchema } from './contracts';

const emailPayload = connectorRegistry.RESEND.actions[0].schema;
const emailTransport: Transport = (...args) => {
  if (process.env.EMAIL_EXTERNAL_ENABLED !== 'true') throw new ConnectorError('CONFIGURATION_REQUIRED');
  return secureTransport(...args);
};
const sheetsTransport: Transport = (...args) => {
  if (process.env.GOOGLE_SHEETS_EXTERNAL_ENABLED !== 'true')
    throw new ConnectorError('CONFIGURATION_REQUIRED');
  return secureTransport(...args);
};
export function resendAdapter(
  settings: unknown,
  credentials: unknown,
  transport: Transport = emailTransport,
) {
  const config = connectorRegistry.RESEND.settingsSchema.parse(settings) as { from: string };
  const secrets = connectorRegistry.RESEND.credentialsSchema.parse(credentials) as { apiKey: string };
  return {
    async verify() {
      const result = await transport(new URL('https://api.resend.com/domains'), 'GET', {
        Authorization: `Bearer ${secrets.apiKey}`,
      });
      const domains = z
        .object({ data: z.array(z.object({ name: z.string(), status: z.string() })) })
        .parse(result).data;
      if (
        !domains.some(
          (domain) =>
            domain.name.toLowerCase() === config.from.split('@')[1].toLowerCase() &&
            domain.status === 'verified',
        )
      )
        throw new ConnectorError('SENDER_NOT_VERIFIED');
      return { verified: true };
    },
    async send(input: { to: string; subject: string; text: string }, idempotencyKey: string) {
      const payload = emailPayload.parse(input);
      if (!/^[a-zA-Z0-9_:-]{1,200}$/.test(idempotencyKey))
        throw new ConnectorError('INVALID_IDEMPOTENCY_KEY');
      const result = await transport(
        new URL('https://api.resend.com/emails'),
        'POST',
        { Authorization: `Bearer ${secrets.apiKey}`, 'Idempotency-Key': idempotencyKey },
        { from: config.from, ...payload },
      );
      const parsed = z.object({ id: z.string().min(1).max(200) }).safeParse(result);
      if (!parsed.success) throw new ConnectorError('PROVIDER_RESULT_UNCERTAIN');
      return { providerMessageId: parsed.data.id, status: 'PENDING' as const };
    },
  };
}
export function verifyResendWebhook(
  raw: Buffer,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  now = Date.now(),
) {
  if (
    !secret.startsWith('whsec_') ||
    !/^\d{10}$/.test(headers.timestamp) ||
    Math.abs(now / 1000 - Number(headers.timestamp)) > 300 ||
    !headers.id ||
    headers.id.length > 250
  )
    return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  if (key.length < 16) return false;
  const signed = Buffer.concat([Buffer.from(`${headers.id}.${headers.timestamp}.`), raw]);
  const expected = createHmac('sha256', key).update(signed).digest('base64');
  return headers.signature
    .split(' ')
    .some((signature) => signature.startsWith('v1,') && equalSecret(signature.slice(3), expected));
}
export const resendEventSchema = z
  .object({
    type: z.enum([
      'email.sent',
      'email.delivered',
      'email.bounced',
      'email.failed',
      'email.complained',
      'email.opened',
    ]),
    data: z.object({ email_id: z.string().min(1).max(200) }).passthrough(),
  })
  .passthrough();

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const cell = z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()]);
export const sheetRowsSchema = z.array(z.array(cell).max(30)).max(500);
export function mapSheetRows(headers: string[], rows: unknown, mapping: z.infer<typeof sheetMappingSchema>) {
  sheetMappingSchema.parse(mapping);
  if (new Set(headers).size !== headers.length) throw new ConnectorError('DUPLICATE_COLUMNS');
  const indices = mapping.fields.map((field) => ({ ...field, index: headers.indexOf(field.column) }));
  if (indices.some((field) => field.index < 0)) throw new ConnectorError('COLUMN_NOT_FOUND');
  return sheetRowsSchema
    .parse(rows)
    .map((row, index) => ({
      row: index + 2,
      fields: Object.fromEntries(indices.map((field) => [field.field, row[field.index] ?? null])),
    }));
}
export function exportSheetRows(
  leads: Array<Record<string, unknown>>,
  mapping: z.infer<typeof sheetMappingSchema>,
) {
  const parsed = sheetMappingSchema.parse(mapping);
  return {
    headers: parsed.fields.map((field) => field.column),
    rows: leads.map((lead) => parsed.fields.map((field) => cell.parse(lead[field.field] ?? null))),
  };
}
export function googleSheetsAdapter(credentials: unknown, transport: Transport = sheetsTransport) {
  const secrets = connectorRegistry.GOOGLE_SHEETS.credentialsSchema.parse(credentials) as {
    accessToken: string;
  };
  const headers = { Authorization: `Bearer ${secrets.accessToken}` };
  return {
    async spreadsheets() {
      const result = await transport(
        new URL(
          'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27%20and%20trashed%3Dfalse&fields=files(id,name)&pageSize=100',
        ),
        'GET',
        headers,
      );
      return z.object({ files: z.array(z.object({ id, name: z.string().max(300) })) }).parse(result).files;
    },
    async tabs(spreadsheetId: string) {
      id.parse(spreadsheetId);
      const result = await transport(
        new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`),
        'GET',
        headers,
      );
      return z
        .object({
          sheets: z.array(
            z.object({ properties: z.object({ sheetId: z.number().int(), title: z.string().max(100) }) }),
          ),
        })
        .parse(result)
        .sheets.map((sheet) => sheet.properties);
    },
    async read(mapping: z.infer<typeof sheetMappingSchema>) {
      sheetMappingSchema.parse(mapping);
      const range = encodeURIComponent(`'${mapping.sheet.replaceAll("'", "''")}'!A1:AD501`);
      const result = await transport(
        new URL(`https://sheets.googleapis.com/v4/spreadsheets/${mapping.spreadsheetId}/values/${range}`),
        'GET',
        headers,
      );
      const values = z
        .array(z.array(cell).max(30))
        .max(501)
        .parse(result.values ?? []);
      const [head = [], ...rows] = values;
      return mapSheetRows(head.map(String), rows, mapping);
    },
    async append(mapping: z.infer<typeof sheetMappingSchema>, leads: Array<Record<string, unknown>>) {
      const { rows } = exportSheetRows(leads, mapping);
      sheetRowsSchema.parse(rows);
      const range = encodeURIComponent(`'${mapping.sheet.replaceAll("'", "''")}'!A:AD`);
      const result = await transport(
        new URL(
          `https://sheets.googleapis.com/v4/spreadsheets/${mapping.spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        ),
        'POST',
        headers,
        { majorDimension: 'ROWS', values: rows },
      );
      return z
        .object({
          updates: z.object({ updatedRange: z.string(), updatedRows: z.number().int().nonnegative() }),
        })
        .parse(result).updates;
    },
  };
}
export function prepareGoogleAuthorization(clientId: string, redirectUri: string) {
  const redirect = new URL(redirectUri);
  if (
    redirect.protocol !== 'https:' &&
    !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))
  )
    throw new ConnectorError('INVALID_OAUTH_REDIRECT');
  if (redirect.username || redirect.password || redirect.hash)
    throw new ConnectorError('INVALID_OAUTH_REDIRECT');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
    prompt: 'consent',
  }).toString();
  return { state, verifier, authorizationUrl: url.href };
}
