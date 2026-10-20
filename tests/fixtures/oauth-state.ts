import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { IntegrationService } from '../../apps/api/src/workflows/integration.service';
import type { WorkflowService } from '../../apps/api/src/workflows/workflow.service';
const db = new PrismaClient();
async function main() {
  process.env.CONNECTOR_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-contract-client';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1/callback';
  const organization = await db.organization.create({ data: { name: 'Contrato OAuth local' } });
  const connection = await db.integrationConnection.create({
    data: { organizationId: organization.id, provider: 'GOOGLE_SHEETS', name: 'Fixture', settings: {} },
  });
  const service = new IntegrationService({ db } as WorkflowService);
  const prepared = await service.prepareOAuth(connection.id, organization.id);
  const state = new URL(prepared.authorizationUrl!).searchParams.get('state')!;
  const stored = await db.integrationOAuthAttempt.findFirstOrThrow({
    where: { integrationId: connection.id },
  });
  if (stored.stateHash === state || stored.verifier.includes('verifier'))
    throw new Error('Unprotected OAuth state');
  const [a, b] = await Promise.allSettled([
    service.consumeOAuthState(connection.id, organization.id, state),
    service.consumeOAuthState(connection.id, organization.id, state),
  ]);
  if ([a, b].filter((result) => result.status === 'fulfilled').length !== 1)
    throw new Error('State replay accepted');
  let isolated = false;
  try {
    await service.consumeOAuthState(connection.id, 'org-other', state);
  } catch {
    isolated = true;
  }
  const second = await service.prepareOAuth(connection.id, organization.id);
  const expiredState = new URL(second.authorizationUrl!).searchParams.get('state')!;
  await db.integrationOAuthAttempt.updateMany({
    where: { integrationId: connection.id, usedAt: null },
    data: { expiresAt: new Date(0) },
  });
  let expired = false;
  try {
    await service.consumeOAuthState(connection.id, organization.id, expiredState);
  } catch {
    expired = true;
  }
  console.log(JSON.stringify({ singleUse: true, isolated, expired, externalRequests: 0 }));
}
main()
  .finally(() => db.$disconnect())
  .catch(() => {
    console.error('OAuth contract failed');
    process.exitCode = 1;
  });
