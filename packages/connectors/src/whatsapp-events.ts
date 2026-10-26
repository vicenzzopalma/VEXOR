import { z } from 'zod';
import { createHash } from 'node:crypto';
const array = z.array(z.any()).max(100).optional().default([]);
const envelope = z
  .object({
    entry: array,
    event: z.string().max(100).optional(),
    instance: z.string().max(100).optional(),
    instanceId: z.string().max(100).optional(),
    type: z.string().max(100).optional(),
    data: z.any().optional(),
  })
  .passthrough();
const parsedEvent = z.object({
  id: z.string().min(1).max(250),
  kind: z.enum(['MESSAGE', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CONNECTION_CLOSED']),
  payload: z
    .object({
      from: z
        .string()
        .regex(/^\+?[1-9]\d{7,14}$/)
        .optional(),
      text: z.string().max(10000).optional(),
      name: z.string().max(200).optional(),
      timestamp: z.union([z.string().max(30), z.number()]).optional(),
      providerMessageId: z.string().max(250).optional(),
      statusReason: z.number().int().min(0).max(9999).optional(),
    })
    .strict(),
});
// Disconnect codes after which the provider will not reconnect: logged out, forbidden/banned,
// payment required and not acceptable (Baileys/Evolution). The account must be quarantined.
export const QUARANTINE_STATUS_REASONS = [401, 402, 403, 406];
export type InboundWhatsAppEvent = z.infer<typeof parsedEvent>;
export function parseWhatsAppEvents(
  provider: string,
  settings: { phoneNumberId?: string; instance?: string },
  raw: unknown,
): InboundWhatsAppEvent[] {
  const body = envelope.parse(raw);
  const events: unknown[] = [];
  if (provider === 'META') {
    for (const entry of body.entry)
      for (const change of array.parse(entry.changes)) {
        const value = change.value;
        if (value?.metadata?.phone_number_id !== settings.phoneNumberId) continue;
        for (const status of array.parse(value.statuses)) {
          const kind = String(status.status ?? '').toUpperCase();
          const recipient =
            typeof status.recipient_id === 'string' && /^\+?[1-9]\d{7,14}$/.test(status.recipient_id)
              ? status.recipient_id
              : undefined;
          events.push({
            id: status.id,
            kind,
            payload: {
              providerMessageId: status.id,
              ...(recipient ? { from: recipient } : {}),
              ...(status.timestamp !== undefined ? { timestamp: status.timestamp } : {}),
            },
          });
        }
        for (const message of array.parse(value.messages)) {
          const contact = array.parse(value.contacts).find((c) => c.wa_id === message.from);
          const text =
            message.text?.body ??
            message.button?.text ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            '';
          events.push({
            id: message.id,
            kind: 'MESSAGE',
            payload: {
              from: message.from,
              text,
              ...(contact?.profile?.name ? { name: contact.profile.name } : {}),
              ...(message.timestamp !== undefined ? { timestamp: message.timestamp } : {}),
            },
          });
        }
      }
  } else if (provider === 'Z_API') {
    const rawRecord = body as Record<string, any>;
    const instance = rawRecord.instanceId ?? rawRecord.instance;
    // Fail closed: events must name the configured instance.
    if (settings.instance && instance === settings.instance) {
      if (rawRecord.type === 'ReceivedCallback' && rawRecord.fromMe !== true && rawRecord.isGroup !== true) {
        let text = '';
        if (typeof rawRecord.text === 'string') text = rawRecord.text;
        else if (typeof rawRecord.text?.message === 'string') text = rawRecord.text.message;
        else if (typeof rawRecord.text?.text === 'string') text = rawRecord.text.text;
        else if (typeof rawRecord.caption === 'string') text = rawRecord.caption;
        const id = String(rawRecord.messageId ?? rawRecord.zaapId ?? rawRecord.id ?? '');
        const from = String(rawRecord.phone ?? rawRecord.from ?? '').replace('+', '');
        const name =
          typeof rawRecord.senderName === 'string'
            ? rawRecord.senderName
            : typeof rawRecord.name === 'string'
              ? rawRecord.name
              : undefined;
        const timestamp = rawRecord.momment ?? rawRecord.timestamp;
        if (id && /^[1-9]\d{7,14}$/.test(from)) {
          events.push({
            id,
            kind: 'MESSAGE',
            payload: {
              from,
              text,
              ...(name ? { name } : {}),
              ...(timestamp !== undefined ? { timestamp } : {}),
            },
          });
        }
      } else if (
        rawRecord.type === 'DeliveryCallback' ||
        rawRecord.type === 'MessageStatusCallback' ||
        rawRecord.status !== undefined
      ) {
        const zapiStatuses: Record<string, string> = {
          SENT: 'SENT',
          RECEIVED: 'DELIVERED',
          DELIVERED: 'DELIVERED',
          READ: 'READ',
          FAILED: 'FAILED',
          ERROR: 'FAILED',
        };
        const kind = zapiStatuses[String(rawRecord.status ?? '').toUpperCase()];
        const messageId = String(rawRecord.messageId ?? rawRecord.zaapId ?? rawRecord.id ?? '');
        if (kind && messageId) {
          events.push({
            id: messageId,
            kind,
            payload: { providerMessageId: messageId },
          });
        }
      }
      if (rawRecord.type === 'Disconnected' || rawRecord.connected === false) {
        events.push({
          id: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
          kind: 'CONNECTION_CLOSED',
          payload: {},
        });
      }
    }
  } else if (provider === 'MOCK') {
    const rawRecord = body as Record<string, any>;
    const mockFrom = String(rawRecord.from ?? rawRecord.phone ?? '').replace('+', '');
    if ((rawRecord.kind === 'MESSAGE' || rawRecord.event === 'mock.message') && /^[1-9]\d{7,14}$/.test(mockFrom)) {
      events.push({
        id: String(rawRecord.id ?? rawRecord.messageId ?? 'mock-msg-' + Date.now()),
        kind: 'MESSAGE',
        payload: {
          from: mockFrom,
          text: String(rawRecord.text ?? 'Mensagem mock'),
          ...(rawRecord.name ? { name: String(rawRecord.name) } : {}),
          ...(rawRecord.timestamp !== undefined ? { timestamp: rawRecord.timestamp } : {}),
        },
      });
    } else if (
      ['SENT', 'DELIVERED', 'READ', 'FAILED', 'CONNECTION_CLOSED'].includes(
        String(rawRecord.kind ?? rawRecord.status ?? '').toUpperCase(),
      )
    ) {
      const kind = String(rawRecord.kind ?? rawRecord.status).toUpperCase();
      events.push({
        id: String(rawRecord.id ?? rawRecord.messageId ?? 'mock-evt-' + Date.now()),
        kind,
        payload:
          kind === 'CONNECTION_CLOSED'
            ? Number.isInteger(rawRecord.statusReason)
              ? { statusReason: rawRecord.statusReason }
              : {}
            : {
                providerMessageId: String(
                  rawRecord.providerMessageId ?? rawRecord.messageId ?? rawRecord.id ?? 'mock-1',
                ),
              },
      });
    }
  } else if (body.instance === settings.instance) {
    const items = Array.isArray(body.data) ? array.parse(body.data) : [body.data];
    for (const data of items) {
      if (
        body.event === 'messages.upsert' &&
        data?.key?.fromMe === false &&
        data?.key?.remoteJid?.endsWith('@s.whatsapp.net')
      )
        events.push({
          id: data.key.id,
          kind: 'MESSAGE',
          payload: {
            from: data.key.remoteJid.split('@')[0],
            text: data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '',
            ...(data.pushName ? { name: data.pushName } : {}),
            ...(data.messageTimestamp !== undefined ? { timestamp: data.messageTimestamp } : {}),
          },
        });
      if (body.event === 'messages.update') {
        const statuses: Record<string, string> = {
          SERVER_ACK: 'SENT',
          DELIVERY_ACK: 'DELIVERED',
          READ: 'READ',
          ERROR: 'FAILED',
          '2': 'SENT',
          '3': 'DELIVERED',
          '4': 'READ',
        };
        const kind = statuses[String(data?.status)];
        if (kind)
          events.push({
            id: data.keyId ?? data.key?.id,
            kind,
            payload: { providerMessageId: data.keyId ?? data.key?.id },
          });
      }
      if (body.event === 'connection.update' && data?.state === 'close')
        events.push({
          id: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
          kind: 'CONNECTION_CLOSED',
          payload: Number.isInteger(data?.statusReason) ? { statusReason: data.statusReason } : {},
        });
    }
  }
  if (events.length > 100) throw new Error('EVENT_BATCH_TOO_LARGE');
  // Ignore unsupported event kinds; reject malformed supported events so ingress audits the failure.
  return events
    .filter((event) =>
      ['MESSAGE', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CONNECTION_CLOSED'].includes(
        String((event as { kind?: unknown }).kind),
      ),
    )
    .map((event) => {
      const parsed = parsedEvent.parse(event);
      if (parsed.kind === 'MESSAGE' && (!parsed.payload.from || parsed.payload.text === undefined))
        throw new Error('INVALID_MESSAGE_EVENT');
      return parsed;
    });
}
