import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

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
  approvedTemplates?: { name: string; language: string }[];
};
export type Secrets = {
  accessToken?: string;
  apiKey?: string;
  appSecret?: string;
  webhookSecret?: string;
  verifyToken?: string;
};
export type SendPayload = { to: string; text?: string; template?: string; language?: string };
export type Transport = (
  url: URL,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
) => Promise<any>;
export class ConnectorError extends Error {
  constructor(public readonly code: string) {
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
  const data = Buffer.from(value, 'base64');
  if (data.length < 28) throw new ConnectorError('INVALID_CREDENTIALS');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
}
export function equalSecret(actual: string, expected: string) {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
export function verifySignature(raw: Buffer, signature: string, secret: string) {
  return equalSecret(signature, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
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
export function validateOrigin(origin: string, provider: string) {
  const url = new URL(origin);
  const allowed =
    provider === 'META'
      ? ['https://graph.facebook.com']
      : (process.env.WHATSAPP_GATEWAY_ORIGINS ?? '').split(',').filter(Boolean);
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
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(() => reject(new ConnectorError('DNS_TIMEOUT')), 10000);
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address)))
    throw new ConnectorError('UNSAFE_ADDRESS');
  // Pin the verified address to the TLS socket to prevent DNS rebinding. Never follow redirects.
  return new Promise((resolve, reject) => {
    const req = request(
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

export function whatsappAdapter(
  provider: string,
  settings: Settings,
  secrets: Secrets,
  transport: Transport = secureTransport,
) {
  const origin = validateOrigin(
    provider === 'META' ? 'https://graph.facebook.com' : (settings.origin ?? ''),
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
  if (!['META', 'EVOLUTION'].includes(provider)) throw new ConnectorError('PROVIDER_NOT_SUPPORTED');
  const metaPath = `/${settings.apiVersion}/${settings.phoneNumberId}`;
  const headers: Record<string, string> =
    provider === 'META' ? { Authorization: `Bearer ${secrets.accessToken}` } : { apikey: secrets.apiKey! };
  const call = (path: string, method = 'GET', body?: unknown) =>
    transport(new URL(path, origin), method, headers, body);
  return {
    async templates(): Promise<{ name: string; language: string }[]> {
      if (provider !== 'META' || !/^\d+$/.test(settings.wabaId ?? '')) return [];
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
    },
    async status(): Promise<ConnectionState> {
      const result = await call(
        provider === 'META'
          ? `${metaPath}?fields=id,display_phone_number`
          : `/instance/connectionState/${settings.instance}`,
      );
      if (provider === 'META') {
        if (result.id !== settings.phoneNumberId) throw new ConnectorError('INVALID_PROVIDER_RESPONSE');
        return 'CONNECTED';
      }
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
      const result = await call(`/instance/connect/${settings.instance}`);
      const qr = result.base64 ?? result.qrcode?.base64;
      if (typeof qr !== 'string' || !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(qr))
        throw new ConnectorError('QR_UNAVAILABLE');
      return { state: 'WAITING_FOR_QR', qr, expiresAt: new Date(Date.now() + 30000).toISOString() };
    },
    async disconnect() {
      // Meta tokens are organization managed: disconnect locally; never revoke the business app globally.
      if (provider === 'EVOLUTION') await call(`/instance/logout/${settings.instance}`, 'DELETE');
    },
    async send(payload: SendPayload): Promise<{ providerMessageId: string; status: MessageStatus }> {
      if (!/^\+?[1-9]\d{7,14}$/.test(payload.to)) throw new ConnectorError('INVALID_RECIPIENT');
      if (provider === 'EVOLUTION' && payload.template) throw new ConnectorError('TEMPLATE_NOT_SUPPORTED');
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
