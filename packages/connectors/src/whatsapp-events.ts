import { z } from 'zod';
import { createHash } from 'node:crypto';
const array = z.array(z.any()).max(100).optional().default([]);
const envelope = z
  .object({
    entry: array,
    event: z.string().max(100).optional(),
    instance: z.string().max(100).optional(),
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
    })
    .strict(),
});
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
        for (const status of array.parse(value.statuses))
          events.push({
            id: status.id,
            kind: String(status.status).toUpperCase(),
            payload: { providerMessageId: status.id },
          });
        for (const message of array.parse(value.messages)) {
          const contact = array.parse(value.contacts).find((c) => c.wa_id === message.from);
          events.push({
            id: message.id,
            kind: 'MESSAGE',
            payload: {
              from: message.from,
              text: message.text?.body ?? '',
              ...(contact?.profile?.name ? { name: contact.profile.name } : {}),
              ...(message.timestamp !== undefined ? { timestamp: message.timestamp } : {}),
            },
          });
        }
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
          payload: {},
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
