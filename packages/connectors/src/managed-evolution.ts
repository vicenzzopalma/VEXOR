import { createHash, createHmac } from 'node:crypto';
import { ConnectorError, validateOrigin } from './index';
import { connectorRegistry } from './contracts';

export function managedEvolutionInstance(organizationId: string, connectionId: string) {
  return `vexor_${createHash('sha256')
    .update(JSON.stringify([organizationId, connectionId]))
    .digest('hex')
    .slice(0, 40)}`;
}

// Deployment configuration is shared; session identity and webhook secrets are tenant-scoped.
export function managedEvolutionConfiguration(organizationId: string, connectionId: string) {
  const origin = process.env.EVOLUTION_GATEWAY_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const seed = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!origin || !apiKey || !seed || seed.length < 24)
    throw new ConnectorError('WHATSAPP_SERVICE_UNAVAILABLE');
  const settings = connectorRegistry.EVOLUTION.settingsSchema.parse({
    origin: validateOrigin(origin, 'EVOLUTION'),
    instance: managedEvolutionInstance(organizationId, connectionId),
  });
  const secrets = connectorRegistry.EVOLUTION.credentialsSchema.parse({
    apiKey,
    webhookSecret: createHmac('sha256', seed)
      .update(JSON.stringify([organizationId, connectionId]))
      .digest('hex'),
  });
  return { settings, secrets };
}
