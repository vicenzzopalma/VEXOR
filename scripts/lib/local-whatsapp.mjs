import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

export const localWhatsAppDirectory = resolve('.local/evolution-api');
export const localWhatsAppEnvironment = resolve('.local/whatsapp-service.env');
export const localWhatsAppCommit = 'fa09d37892cdbb1d65a250155d293d92230c5b30';

export function loadLocalWhatsAppConfiguration({
  environmentPath = localWhatsAppEnvironment,
  quarantinePath = resolve('.local/whatsapp-service-quarantined.json'),
} = {}) {
  if (existsSync(quarantinePath)) {
    process.env.WHATSAPP_SESSION_ENABLED = 'false';
    process.env.WHATSAPP_EXTERNAL_ENABLED = 'false';
    return undefined;
  }
  if (process.env.WHATSAPP_LOCAL_AUTOSTART === 'false') return undefined;
  if (!existsSync(environmentPath)) return undefined;
  const config = parse(readFileSync(environmentPath));
  if (
    config.EVOLUTION_GATEWAY_URL !== 'http://127.0.0.1:8088' ||
    !/^[a-f0-9]{64}$/.test(config.EVOLUTION_API_KEY ?? '') ||
    !/^[a-f0-9]{64}$/.test(config.EVOLUTION_WEBHOOK_SECRET ?? '') ||
    !config.EVOLUTION_DATABASE_URL
  )
    throw new Error('Configuração local WhatsApp inválida. Execute npm run whatsapp:setup.');
  // An explicitly configured remote installation takes precedence over local setup.
  if (process.env.EVOLUTION_GATEWAY_URL && process.env.EVOLUTION_GATEWAY_URL !== config.EVOLUTION_GATEWAY_URL)
    return undefined;
  process.env.EVOLUTION_GATEWAY_URL = config.EVOLUTION_GATEWAY_URL;
  process.env.EVOLUTION_API_KEY = config.EVOLUTION_API_KEY;
  process.env.EVOLUTION_WEBHOOK_SECRET = config.EVOLUTION_WEBHOOK_SECRET;
  process.env.EVOLUTION_LOCAL_GATEWAY_ENABLED = 'true';
  process.env.WHATSAPP_SESSION_ENABLED = 'true';
  process.env.WHATSAPP_EXTERNAL_ENABLED = 'false';
  return config;
}

export function localWhatsAppProcessEnvironment(config) {
  return {
    ...process.env,
    SERVER_TYPE: 'http',
    SERVER_PORT: '8088',
    SERVER_URL: config.EVOLUTION_GATEWAY_URL,
    DATABASE_PROVIDER: 'postgresql',
    DATABASE_CONNECTION_URI: config.EVOLUTION_DATABASE_URL,
    DATABASE_CONNECTION_CLIENT_NAME: 'vexor_local',
    DATABASE_SAVE_DATA_INSTANCE: 'true',
    DATABASE_SAVE_DATA_NEW_MESSAGE: 'false',
    DATABASE_SAVE_MESSAGE_UPDATE: 'false',
    DATABASE_SAVE_DATA_CONTACTS: 'false',
    DATABASE_SAVE_DATA_CHATS: 'false',
    DATABASE_SAVE_DATA_HISTORIC: 'false',
    DATABASE_SAVE_DATA_LABELS: 'false',
    CACHE_REDIS_ENABLED: 'false',
    CACHE_REDIS_SAVE_INSTANCES: 'false',
    CACHE_LOCAL_ENABLED: 'true',
    AUTHENTICATION_API_KEY: config.EVOLUTION_API_KEY,
    AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: 'false',
    TELEMETRY_ENABLED: 'false',
    SENTRY_DSN: '',
    WEBHOOK_GLOBAL_ENABLED: 'false',
    WEBSOCKET_ENABLED: 'false',
    RABBITMQ_ENABLED: 'false',
    SQS_ENABLED: 'false',
    KAFKA_ENABLED: 'false',
    PUSHER_ENABLED: 'false',
    NATS_ENABLED: 'false',
    S3_ENABLED: 'false',
    CHATWOOT_ENABLED: 'false',
    TYPEBOT_ENABLED: 'false',
    OPENAI_ENABLED: 'false',
    DIFY_ENABLED: 'false',
    FLOWISE_ENABLED: 'false',
    CORS_ORIGIN: 'http://127.0.0.1:4000',
    LOG_LEVEL: 'ERROR,WARN',
    LOG_BAILEYS: 'silent',
    QRCODE_LIMIT: '60',
    CONFIG_SESSION_PHONE_CLIENT: 'VEXOR',
    CONFIG_SESSION_PHONE_NAME: 'Chrome',
    DEL_INSTANCE: 'false',
  };
}

// Evolution reconnects every instance saved as open/connecting when it boots. Before the
// gateway starts, force quarantined accounts to "close" so only they stay offline.
// Keys and history are preserved; only the auto-connect flag changes.
export async function closeQuarantinedInstances(config, { all = false } = {}) {
  const { PrismaClient } = await import('@prisma/client');
  const app = new PrismaClient();
  const gateway = new PrismaClient({ datasources: { db: { url: config.EVOLUTION_DATABASE_URL } } });
  try {
    const rows = await app.whatsAppConnection.findMany({
      where: { provider: 'EVOLUTION', quarantinedAt: { not: null } },
      select: { settings: true },
    });
    const names = rows.map((row) => row.settings?.instance).filter((name) => typeof name === 'string');
    if (all)
      return await gateway.$executeRawUnsafe(
        `UPDATE "Instance" SET "connectionStatus"='close' WHERE "connectionStatus" IN ('open','connecting')`,
      );
    if (!names.length) return 0;
    return await gateway.$executeRawUnsafe(
      `UPDATE "Instance" SET "connectionStatus"='close' WHERE "connectionStatus" IN ('open','connecting') AND name = ANY($1::text[])`,
      names,
    );
  } finally {
    await Promise.all([app.$disconnect(), gateway.$disconnect()]);
  }
}
