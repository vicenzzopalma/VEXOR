import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { request as localRequest } from 'node:http';
import { isIP } from 'node:net';
import { connectorRegistry } from './contracts';
export * from './contracts';
export * from './whatsapp-events';
export * from './managed-evolution';
export * from './opt-out';
export * from './ti-provisioning';
import { OPT_OUT_CONFIRMATION_TEXT, optOutConfirmationPolicy } from './opt-out';

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'WAITING_FOR_QR'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';
export type MessageStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type Settings = {
  origin?: string;
  instance?: string;
  phoneNumberId?: string;
  apiVersion?: string;
  wabaId?: string;
  mockName?: string;
  approvedTemplates?: { name: string; language: string }[];
};
export type Secrets = {
  accessToken?: string;
  apiKey?: string;
  appSecret?: string;
  webhookSecret?: string;
  verifyToken?: string;
  refreshToken?: string;
  verifier?: string;
  token?: string;
  clientToken?: string;
};
export type SendPayload = { to: string; text?: string; template?: string; language?: string };
export type Transport = (
  url: URL,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
) => Promise<any>;
export class ConnectorError extends Error {
  constructor(
    public readonly code: string,
    public readonly retrySafe = false,
    public readonly retryAfterMs = 0,
  ) {
    super(code);
  }
}
function encryptionKey() {
  const key = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) throw new ConnectorError('ENCRYPTION_CONFIGURATION_REQUIRED');
  return Buffer.from(key, 'hex');
}
export function sealSecrets(value: Secrets) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function openSecrets(value: string): Secrets {
  const key = encryptionKey();
  try {
    const data = Buffer.from(value, 'base64');
    if (data.length < 28) throw new Error('Malformed ciphertext');
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
  } catch {
    throw new ConnectorError('INVALID_CREDENTIALS');
  }
}
// A read-only session refresh must not invalidate queued messages; an account/settings/secret change must.
export function connectionRevision(row: {
  id: string;
  organizationId: string;
  provider: string;
  settings: unknown;
  credentials: string | null;
}) {
  const definition = connectorRegistry[row.provider];
  if (!definition) throw new ConnectorError('PROVIDER_NOT_SUPPORTED');
  const settings = definition.settingsSchema.strip().parse(row.settings);
  const canonical = Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));
  return `cfg1:${createHash('sha256')
    .update(JSON.stringify([row.id, row.organizationId, row.provider, canonical, row.credentials]))
    .digest('hex')}`;
}
export function connectorConfigurationReady(provider: string, settings: unknown, ciphertext: string | null) {
  try {
    const definition = connectorRegistry[provider];
    if (!definition) return false;
    if (provider === 'MOCK') {
      return definition.settingsSchema.strip().safeParse(settings).success;
    }
    if (provider === 'Z_API') {
      const parsedSettings = definition.settingsSchema.strip().safeParse(settings);
      if (!parsedSettings.success) return false;
      if (!ciphertext) return false;
      return definition.credentialsSchema.safeParse(openSecrets(ciphertext)).success;
    }
    return (
      !!definition &&
      !!ciphertext &&
      definition.settingsSchema.strip().safeParse(settings).success &&
      definition.credentialsSchema.safeParse(openSecrets(ciphertext)).success
    );
  } catch {
    return false;
  }
}
export function isWhatsAppQuarantined(
  quarantinePath = process.env.WHATSAPP_QUARANTINE_PATH ||
    resolve('.local/whatsapp-service-quarantined.json'),
): boolean {
  try {
    return existsSync(quarantinePath);
  } catch {
    return false;
  }
}
export function equalSecret(actual: string, expected: string) {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
export function verifySignature(raw: Buffer, signature: string, secret: string) {
  if (!signature || typeof signature !== 'string') return false;
  const normalized = signature.trim().toLowerCase();
  return equalSecret(normalized, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
export function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
// Only deployment configuration may opt in to this single numeric loopback endpoint.
// Keep public gateway allowlists and DNS/TLS protection independent of this exception.
function localEvolutionOrigin() {
  if (process.env.EVOLUTION_LOCAL_GATEWAY_ENABLED !== 'true') return undefined;
  const configured = process.env.EVOLUTION_GATEWAY_URL ?? '';
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/?$/.exec(configured);
  if (!match || Number(match[1]) > 65535) return undefined;
  return configured.replace(/\/$/, '');
}
export function validateOrigin(origin: string, provider: string) {
  if (provider === 'MOCK') return 'https://mock.local';
  const effectiveOrigin = origin || (provider === 'Z_API' ? 'https://api.z-api.io' : '');
  const url = new URL(effectiveOrigin);
  const localOrigin = localEvolutionOrigin();
  if (
    provider === 'EVOLUTION' &&
    localOrigin &&
    /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/?$/.test(effectiveOrigin) &&
    url.origin === new URL(localOrigin).origin
  )
    return localOrigin;
  const allowed =
    provider === 'META'
      ? ['https://graph.facebook.com']
      : provider === 'Z_API'
        ? ['https://api.z-api.io', ...(process.env.WHATSAPP_GATEWAY_ORIGINS ?? '').split(',').filter(Boolean)]
        : [
            ...(process.env.WHATSAPP_GATEWAY_ORIGINS ?? '').split(',').filter(Boolean),
            process.env.EVOLUTION_GATEWAY_URL?.replace(/\/$/, ''),
          ].filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !allowed.includes(url.origin)
  )
    throw new ConnectorError('ORIGIN_NOT_ALLOWED');
  return url.origin;
}
export const secureTransport: Transport = async (url, method, headers, body) => {
  const deadline = Date.now() + 10000;
  const localOrigin = localEvolutionOrigin();
  const local = !!localOrigin && url.protocol === 'http:' && url.origin === new URL(localOrigin).origin;
  if ((url.protocol !== 'https:' && !local) || url.username || url.password)
    throw new ConnectorError('ORIGIN_NOT_ALLOWED');
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = local
    ? [{ address: '127.0.0.1', family: 4 }]
    : await Promise.race([
        lookup(url.hostname, { all: true, family: 4 }),
        new Promise<never>((_resolve, reject) => {
          dnsTimer = setTimeout(() => reject(new ConnectorError('DNS_TIMEOUT')), 10000);
        }),
      ]).finally(() => clearTimeout(dnsTimer));
  if (!local && (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address))))
    throw new ConnectorError('UNSAFE_ADDRESS');
  // Pin the verified address to the TLS socket to prevent DNS rebinding. Never follow redirects.
  return new Promise((resolve, reject) => {
    const req = (local ? localRequest : request)(
      url,
      {
        method,
        family: 4,
        headers: { ...headers, 'Content-Type': 'application/json' },
        lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      },
      (res) => {
        let length = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 1024 * 1024) req.destroy(new ConnectorError('RESPONSE_TOO_LARGE'));
          else chunks.push(chunk);
        });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300)
            return reject(
              new ConnectorError(
                res.statusCode === 401 || res.statusCode === 403
                  ? 'AUTHENTICATION_FAILED'
                  : `PROVIDER_HTTP_${res.statusCode}`,
                res.statusCode === 429,
                Math.min(60000, Math.max(1000, Number(res.headers['retry-after']) * 1000 || 5000)),
              ),
            );
          try {
            resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
          } catch {
            reject(new ConnectorError('INVALID_PROVIDER_RESPONSE'));
          }
        });
        res.on('aborted', () => reject(new ConnectorError('PROVIDER_RESULT_UNCERTAIN')));
        res.on('error', () => reject(new ConnectorError('PROVIDER_RESULT_UNCERTAIN')));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new ConnectorError('PROVIDER_TIMEOUT')),
      Math.max(1, deadline - Date.now()),
    );
    req.on('close', () => clearTimeout(timer));
    req.setTimeout(10000, () => req.destroy(new ConnectorError('PROVIDER_TIMEOUT')));
    req.on('error', () => reject(new ConnectorError('PROVIDER_REQUEST_UNCERTAIN')));
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
};

const whatsappTransport: Transport = (...args) => {
  if (process.env.WHATSAPP_EXTERNAL_ENABLED !== 'true') throw new ConnectorError('CONFIGURATION_REQUIRED');
  return secureTransport(...args);
};

/** Narrow exception: fixed opt-out text, hard-capped recipient, only status/send adapter calls.
 * No caller-provided text and no change to the normal external-send gate. */
export async function sendOptOutConfirmation(
  provider: string,
  settings: Settings,
  secrets: Secrets,
  phone: string,
  transport: Transport = secureTransport,
) {
  if (optOutConfirmationPolicy(phone) !== 'ALLOWED') throw new ConnectorError('CONFIRMATION_HELD');
  const adapter = whatsappAdapter(provider, settings, secrets, transport);
  if ((await adapter.status()) !== 'CONNECTED') throw new ConnectorError('SESSION_DISCONNECTED');
  // Re-read policy immediately before sending, including for injected test transports.
  if (optOutConfirmationPolicy(phone) !== 'ALLOWED') throw new ConnectorError('CONFIRMATION_HELD');
  return adapter.send({ to: phone, text: OPT_OUT_CONFIRMATION_TEXT });
}
export function whatsappAdapter(
  provider: string,
  settings: Settings,
  secrets: Secrets,
  transport: Transport = whatsappTransport,
  sessionOnly = false,
) {
  if (!['META', 'EVOLUTION', 'Z_API', 'MOCK'].includes(provider))
    throw new ConnectorError('PROVIDER_NOT_SUPPORTED');

  if (provider === 'MOCK') {
    return {
      async createInstance() {
        return { created: true, instance: settings.instance || settings.mockName || 'mock-instance' };
      },
      async reconnect() {
        return this.connect();
      },
      async templates(): Promise<{ name: string; language: string }[]> {
        return [
          { name: 'mock_hello', language: 'pt_BR' },
          { name: 'mock_confirmation', language: 'pt_BR' },
        ];
      },
      async status(): Promise<ConnectionState> {
        return 'CONNECTED';
      },
      async connect(): Promise<{ state: ConnectionState; qr?: string; expiresAt?: string }> {
        return { state: 'CONNECTED' };
      },
      async pairingCode(phoneNumber: string): Promise<{ code: string; expiresAt?: string }> {
        const cleanPhone = phoneNumber.replace(/[\s\-()+]/g, '');
        if (!/^[1-9]\d{7,14}$/.test(cleanPhone)) throw new ConnectorError('INVALID_RECIPIENT');
        const hash = createHash('sha256').update(`mock:${cleanPhone}`).digest('hex').toUpperCase();
        const code = `${hash.slice(0, 4)}-${hash.slice(4, 8)}`;
        return { code, expiresAt: new Date(Date.now() + 120000).toISOString() };
      },
      async disconnect() {},
      async closeReason(): Promise<number | undefined> {
        return undefined;
      },
      async deleteSession() {},
      async send(payload: SendPayload): Promise<{ providerMessageId: string; status: MessageStatus }> {
        if (!/^\+?[1-9]\d{7,14}$/.test(payload.to)) throw new ConnectorError('INVALID_RECIPIENT');
        if (!payload.template && (!payload.text || !payload.text.trim()))
          throw new ConnectorError('INVALID_PAYLOAD');
        return { providerMessageId: `mock-msg-${randomBytes(8).toString('hex')}`, status: 'SENT' };
      },
    };
  }

  if (sessionOnly && transport === whatsappTransport)
    transport = (...args) => {
      if (process.env.WHATSAPP_SESSION_ENABLED !== 'true' && process.env.WHATSAPP_EXTERNAL_ENABLED !== 'true')
        throw new ConnectorError('CONFIGURATION_REQUIRED');
      return secureTransport(...args);
    };
  const origin = validateOrigin(
    provider === 'META'
      ? 'https://graph.facebook.com'
      : provider === 'Z_API'
        ? (settings.origin ?? 'https://api.z-api.io')
        : (settings.origin ?? ''),
    provider,
  );
  if (
    provider === 'META' &&
    (!secrets.accessToken ||
      !/^\d+$/.test(settings.phoneNumberId ?? '') ||
      !/^v\d+\.\d+$/.test(settings.apiVersion ?? ''))
  )
    throw new ConnectorError('CONFIGURATION_REQUIRED');
  if (provider === 'EVOLUTION' && (!secrets.apiKey || !/^[a-zA-Z0-9_-]{1,80}$/.test(settings.instance ?? '')))
    throw new ConnectorError('CONFIGURATION_REQUIRED');
  const zapiToken = secrets.token;
  const zapiClientToken = secrets.clientToken;
  // The token is part of the URL path; restrict it so it cannot alter the request target.
  if (
    provider === 'Z_API' &&
    (!zapiToken ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(zapiToken) ||
      !settings.instance ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(settings.instance))
  )
    throw new ConnectorError('CONFIGURATION_REQUIRED');

  const metaPath = `/${settings.apiVersion}/${settings.phoneNumberId}`;
  const zapiBasePath = `/instances/${settings.instance}/token/${zapiToken}`;
  const headers: Record<string, string> =
    provider === 'META'
      ? { Authorization: `Bearer ${secrets.accessToken}` }
      : provider === 'EVOLUTION'
        ? { apikey: secrets.apiKey! }
        : { ...(zapiClientToken ? { 'Client-Token': zapiClientToken } : {}) };
  const call = (path: string, method = 'GET', body?: unknown) =>
    transport(new URL(path, origin), method, headers, body);
  return {
    async createInstance() {
      if (provider !== 'EVOLUTION') throw new ConnectorError('CAPABILITY_NOT_SUPPORTED');
      const result = await call('/instance/create', 'POST', {
        instanceName: settings.instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: false,
      });
      if (result.instance?.instanceName !== settings.instance)
        throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
      return { created: true, instance: settings.instance };
    },
    async reconnect() {
      if (provider === 'EVOLUTION') await call(`/instance/restart/${settings.instance}`, 'POST');
      if (provider === 'Z_API') await call(`${zapiBasePath}/restart`);
      return this.connect();
    },
    async templates(): Promise<{ name: string; language: string }[]> {
      if (provider === 'META') {
        if (!/^\d+$/.test(settings.wabaId ?? '')) return [];
        const result = await call(
          `/${settings.apiVersion}/${settings.wabaId}/message_templates?fields=name,status,language,components&limit=100`,
        );
        return (Array.isArray(result.data) ? result.data : [])
          .filter(
            (item: any) =>
              item.status === 'APPROVED' &&
              /^[a-z0-9_]{1,200}$/.test(item.name) &&
              /^[a-z]{2}(?:_[A-Z]{2})?$/.test(item.language) &&
              !JSON.stringify(item.components ?? []).includes('{{') &&
              !(item.components ?? []).some(
                (c: any) => (c.type === 'HEADER' && c.format !== 'TEXT') || c.type === 'BUTTONS',
              ),
          )
          .map((item: any) => ({ name: item.name, language: item.language }));
      }
      return settings.approvedTemplates ?? [];
    },
    async status(): Promise<ConnectionState> {
      if (provider === 'META') {
        const result = await call(`${metaPath}?fields=id,display_phone_number,status`);
        if (result.id !== settings.phoneNumberId) throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
        const status = String(result.status ?? '').toUpperCase();
        if (status === 'CONNECTED') return 'CONNECTED';
        if (status === 'PENDING') return 'CONNECTING';
        if (['DISCONNECTED', 'UNVERIFIED', 'OFFLINE'].includes(status)) return 'DISCONNECTED';
        if (['FLAGGED', 'RESTRICTED', 'BANNED', 'RATE_LIMITED'].includes(status)) return 'ERROR';
        throw new ConnectorError('SESSION_STATUS_UNCONFIRMED');
      }
      if (provider === 'Z_API') {
        const result = await call(`${zapiBasePath}/status`);
        if (result.connected === true) return 'CONNECTED';
        if (result.connecting === true) return 'CONNECTING';
        return 'DISCONNECTED';
      }
      const result = await call(`/instance/connectionState/${settings.instance}`);
      const state = result.instance?.state;
      if (['open', 'connected'].includes(state)) return 'CONNECTED';
      if (state === 'connecting') return 'CONNECTING';
      if (['close', 'closed', 'disconnected'].includes(state)) return 'DISCONNECTED';
      throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
    },
    async connect(): Promise<{ state: ConnectionState; qr?: string; expiresAt?: string }> {
      if (provider === 'META') return { state: await this.status() };
      const status = await this.status();
      if (status === 'CONNECTED') return { state: status };
      if (provider === 'Z_API') {
        const result = await call(`${zapiBasePath}/qr-code`);
        const rawQr = result.value ?? result.qr ?? result.base64;
        if (typeof rawQr !== 'string' || !rawQr) throw new ConnectorError('QR_UNAVAILABLE');
        const qr = rawQr.startsWith('data:image') ? rawQr : `data:image/png;base64,${rawQr}`;
        return { state: 'WAITING_FOR_QR', qr, expiresAt: new Date(Date.now() + 30000).toISOString() };
      }
      const result = await call(`/instance/connect/${settings.instance}`);
      const qr = result.base64 ?? result.qrcode?.base64;
      if (typeof qr !== 'string' || !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(qr))
        throw new ConnectorError('QR_UNAVAILABLE');
      return { state: 'WAITING_FOR_QR', qr, expiresAt: new Date(Date.now() + 30000).toISOString() };
    },
    async pairingCode(phoneNumber: string): Promise<{ code: string; expiresAt?: string }> {
      if (provider === 'META') throw new ConnectorError('CAPABILITY_NOT_SUPPORTED');
      const cleanPhone = phoneNumber.replace(/[\s\-()+]/g, '');
      if (!/^[1-9]\d{7,14}$/.test(cleanPhone)) throw new ConnectorError('INVALID_RECIPIENT');
      if (provider === 'Z_API') {
        const result = await call(`${zapiBasePath}/phone-code/${cleanPhone}`);
        const rawCode = result.code ?? result.phoneCode;
        if (typeof rawCode !== 'string' || !rawCode) throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
        return { code: rawCode, expiresAt: new Date(Date.now() + 120000).toISOString() };
      }
      const result = await call(`/instance/pairingCode/${settings.instance}`, 'POST', { number: cleanPhone });
      const rawCode = result.code ?? result.pairingCode;
      if (typeof rawCode !== 'string' || !rawCode) throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
      return { code: rawCode, expiresAt: new Date(Date.now() + 120000).toISOString() };
    },
    // Last disconnect code stored by the gateway for this instance (Evolution only).
    async closeReason(): Promise<number | undefined> {
      if (provider !== 'EVOLUTION') return undefined;
      const result = await call(
        `/instance/fetchInstances?instanceName=${encodeURIComponent(settings.instance!)}`,
      );
      const item = Array.isArray(result) ? result.find((i: any) => i?.name === settings.instance) : undefined;
      const code = Number(item?.disconnectionReasonCode);
      return Number.isInteger(code) ? code : undefined;
    },
    // Drop this instance's session and keys so a released account starts from a fresh QR.
    async deleteSession() {
      if (provider !== 'EVOLUTION') return;
      await call(`/instance/delete/${settings.instance}`, 'DELETE').catch((error) => {
        if (!(error instanceof ConnectorError) || error.code !== 'PROVIDER_HTTP_404') throw error;
      });
    },
    async disconnect() {
      // Meta tokens are organization managed: disconnect locally; never revoke the business app globally.
      if (provider === 'EVOLUTION') await call(`/instance/logout/${settings.instance}`, 'DELETE');
      if (provider === 'Z_API') await call(`${zapiBasePath}/disconnect`);
    },
    async send(payload: SendPayload): Promise<{ providerMessageId: string; status: MessageStatus }> {
      if (!/^\+?[1-9]\d{7,14}$/.test(payload.to)) throw new ConnectorError('INVALID_RECIPIENT');
      if (provider === 'EVOLUTION' && payload.template) throw new ConnectorError('TEMPLATE_NOT_SUPPORTED');
      if (!payload.template && (!payload.text || !payload.text.trim()))
        throw new ConnectorError('INVALID_PAYLOAD');
      if (provider === 'Z_API') {
        const cleanPhone = payload.to.replace('+', '');
        const path = payload.template ? `${zapiBasePath}/send-template` : `${zapiBasePath}/send-text`;
        const body = payload.template
          ? { phone: cleanPhone, template: payload.template, message: payload.text ?? payload.template }
          : { phone: cleanPhone, message: payload.text };
        const result = await call(path, 'POST', body);
        const providerMessageId = result.zaapId ?? result.messageId ?? result.id;
        if (typeof providerMessageId !== 'string' || !providerMessageId)
          throw new ConnectorError('PROVIDER_RESULT_UNCERTAIN');
        return { providerMessageId, status: 'SENT' };
      }
      const body =
        provider === 'META'
          ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: payload.to.replace('+', ''),
              ...(payload.template
                ? {
                    type: 'template',
                    template: { name: payload.template, language: { code: payload.language ?? 'pt_BR' } },
                  }
                : { type: 'text', text: { body: payload.text } }),
            }
          : { number: payload.to.replace('+', ''), text: payload.text };
      const result = await call(
        provider === 'META' ? `${metaPath}/messages` : `/message/sendText/${settings.instance}`,
        'POST',
        body,
      );
      const providerMessageId = provider === 'META' ? result.messages?.[0]?.id : result.key?.id;
      if (typeof providerMessageId !== 'string' || !providerMessageId)
        throw new ConnectorError('PROVIDER_RESULT_UNCERTAIN');
      // An identifier proves acceptance, not transmission or delivery.
      const confirmedSent =
        provider === 'META'
          ? result.messages?.[0]?.message_status === 'sent'
          : ['SENT', 'SERVER_ACK'].includes(result.status);
      return { providerMessageId, status: confirmedSent ? 'SENT' : 'PENDING' };
    },
  };
}

export * from './commercial';
