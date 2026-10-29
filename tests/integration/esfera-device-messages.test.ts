import 'dotenv/config';
import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { captureDeviceOptOut } from '@eimax/workflow-runtime';
import { OPT_OUT_CONFIRMATION_TEXT } from '@eimax/connectors';

// Replies read on the Esfera dispatch phone: classified and recorded, nothing sent.
process.env.DATABASE_URL ??= 'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
const db = new PrismaClient();
const created: string[] = [];

afterAll(async () => {
  await db.optOutEvent.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

it('registra SAIR do celular, devolve a confirmação aprovada e não duplica', async () => {
  const org = await db.organization.findFirstOrThrow();
  const id = randomUUID();
  const first = await captureDeviceOptOut(db, org.id, { id, from: '+55 11 98888-7777', text: 'sair', device: 'ESF-TESTE' });
  expect(first.decision).toBe('OPT_OUT');
  expect(first.confirmationText).toBe(OPT_OUT_CONFIRMATION_TEXT);
  created.push(first.eventId!);
  const row = await db.optOutEvent.findUniqueOrThrow({ where: { id: first.eventId } });
  expect(row).toMatchObject({ status: 'DELIVERED', ackStatus: 'DEVICE', connectionId: null, organizationId: org.id });
  const again = await captureDeviceOptOut(db, org.id, { id, from: '+55 11 98888-7777', text: 'sair', device: 'ESF-TESTE' });
  expect(again.eventId).toBe(first.eventId);
  expect(await db.optOutConfirmation.count({ where: { sourceOptOutId: first.eventId } })).toBe(0);
});

it('mensagem comum não registra nada e dúvida vai para revisão', async () => {
  const org = await db.organization.findFirstOrThrow();
  const none = await captureDeviceOptOut(db, org.id, { id: randomUUID(), from: '+5511988887777', text: 'bom dia, quero negociar' });
  expect(none).toMatchObject({ decision: 'NONE' });
  expect(none.eventId).toBeUndefined();
  const doubt = await captureDeviceOptOut(db, org.id, { id: randomUUID(), from: '+5511988887777', text: 'não quero mais receber isso' });
  if (doubt.eventId) created.push(doubt.eventId);
  expect(['OPT_OUT', 'REVIEW']).toContain(doubt.decision);
});
