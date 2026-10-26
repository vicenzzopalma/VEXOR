import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadLocalWhatsAppConfiguration } from '../../scripts/lib/local-whatsapp.mjs';
import { isWhatsAppQuarantined } from '@eimax/connectors';
import { WhatsAppService } from '../../apps/api/src/workflows/whatsapp.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

const folders: string[] = [];
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'vexor-whatsapp-quarantine-'));
  folders.push(folder);
  mkdirSync(join(folder, '.local'));
  const quarantinePath = join(folder, '.local/whatsapp-service-quarantined.json');
  writeFileSync(quarantinePath, '{}');
  return { folder, quarantinePath, environmentPath: join(folder, 'must-not-be-read.env') };
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) {
    const target = resolve(folder);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !basename(target).startsWith('vexor-whatsapp-quarantine-')
    )
      throw new Error('Destino de limpeza do teste fora da pasta temporária esperada.');
    rmSync(target, { recursive: true, force: true });
  }
});

it('quarentena impede sessões e envio mesmo com flags herdadas habilitadas, sem ler credenciais', () => {
  const files = fixture();
  vi.stubEnv('WHATSAPP_LOCAL_AUTOSTART', 'true');
  vi.stubEnv('WHATSAPP_SESSION_ENABLED', 'true');
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'true');
  expect(loadLocalWhatsAppConfiguration(files)).toBeUndefined();
  expect(process.env.WHATSAPP_SESSION_ENABLED).toBe('false');
  expect(process.env.WHATSAPP_EXTERNAL_ENABLED).toBe('false');
});

it('setup recusa reativação antes de buscar fonte, instalar dependências ou acessar banco', async () => {
  const { folder } = fixture();
  await expect(
    promisify(execFile)(process.execPath, [resolve('scripts/install-local-whatsapp.mjs')], {
      cwd: folder,
      windowsHide: true,
      timeout: 10000,
    }),
  ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Pareamento suspenso por incidente') });
});

it('isWhatsAppQuarantined detecta arquivo de quarentena ativo ou ausente', () => {
  const { quarantinePath } = fixture();
  expect(isWhatsAppQuarantined(quarantinePath)).toBe(true);
  expect(isWhatsAppQuarantined(join(tmpdir(), 'non-existent-quarantine.json'))).toBe(false);
});

it('WhatsAppService bloqueia qualquer operacao Evolution em quarentena sem contatar porta 8088', async () => {
  const { quarantinePath } = fixture();
  vi.stubEnv('WHATSAPP_QUARANTINE_PATH', quarantinePath);

  const mockEvolutionRow = {
    id: 'conn-evo-1',
    organizationId: 'org-test',
    name: 'Evolution Gateway',
    provider: 'EVOLUTION',
    state: 'DISCONNECTED',
    settings: { origin: 'http://127.0.0.1:8088', instance: 'instance-test' },
    credentials: 'sealed-credentials',
    lastError: null,
    checkedAt: null,
    updatedAt: new Date(),
    enabled: false,
  };

  const updateCalls: any[] = [];
  const mockDb = {
    whatsAppConnection: {
      findFirst: vi.fn().mockResolvedValue(mockEvolutionRow),
      update: vi.fn().mockImplementation((args) => {
        updateCalls.push(args);
        return Promise.resolve({ ...mockEvolutionRow, ...args.data });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const service = new WhatsAppService({ db: mockDb } as any);

  // The global marker is now an emergency switch: every Evolution account shows as quarantined.
  expect(service.publicConnection(mockEvolutionRow).quarantined).toBe(true);

  for (const action of ['connect', 'reconnect', 'refresh', 'create-instance'] as const) {
    await expect(service.operate('conn-evo-1', 'org-test', action)).rejects.toThrow(ConflictException);
    await expect(service.operate('conn-evo-1', 'org-test', action)).rejects.toThrow(
      /desligadas pelo administrador/,
    );
  }

  // Database must not have been updated by failed operations (safe state preserved)
  expect(updateCalls).toHaveLength(0);

  // Disconnect in quarantine sets state to DISCONNECTED locally without calling gateway
  const disconnectResult = await service.operate('conn-evo-1', 'org-test', 'disconnect');
  expect(disconnectResult.state).toBe('DISCONNECTED');
  expect(updateCalls).toHaveLength(1);
  expect(updateCalls[0].data).toMatchObject({ state: 'DISCONNECTED', enabled: false });
});

it('WhatsAppService recusa criacao de instancia para provedor META de imediato', async () => {
  const mockMetaRow = {
    id: 'conn-meta-1',
    organizationId: 'org-test',
    name: 'Meta Cloud API',
    provider: 'META',
    state: 'DISCONNECTED',
    settings: { phoneNumberId: '12345678', apiVersion: 'v21.0' },
    credentials: 'sealed-credentials',
    lastError: null,
    checkedAt: null,
    updatedAt: new Date(),
    enabled: false,
  };

  const mockDb = {
    whatsAppConnection: {
      findFirst: vi.fn().mockResolvedValue(mockMetaRow),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const service = new WhatsAppService({ db: mockDb } as any);

  await expect(service.operate('conn-meta-1', 'org-test', 'create-instance')).rejects.toThrow(
    BadRequestException,
  );
  await expect(service.operate('conn-meta-1', 'org-test', 'create-instance')).rejects.toThrow(
    'Esta conta não suporta criação de instâncias.',
  );
  expect(mockDb.whatsAppConnection.update).not.toHaveBeenCalled();
});

it('quarentena por conta isola apenas a conta afetada, sem contatar o gateway', async () => {
  vi.stubEnv('WHATSAPP_QUARANTINE_PATH', join(tmpdir(), 'vexor-no-marker-' + Date.now() + '.json'));
  const base = {
    organizationId: 'org-test',
    provider: 'EVOLUTION',
    state: 'DISCONNECTED',
    settings: { origin: 'http://127.0.0.1:8088', instance: 'instance-test' },
    credentials: null,
    lastError: null,
    checkedAt: null,
    updatedAt: new Date(),
    enabled: false,
  };
  const banned = {
    ...base,
    id: 'banned',
    name: 'Banida',
    quarantinedAt: new Date(),
    quarantineReason: 'PROVIDER_STATUS_403',
  };
  const healthy = { ...base, id: 'healthy', name: 'Saudável', quarantinedAt: null, quarantineReason: null };
  const update = vi.fn();
  const db = {
    whatsAppConnection: {
      findFirst: vi.fn(({ where }) => Promise.resolve(where.id === 'banned' ? banned : healthy)),
      update,
      updateMany: vi.fn(),
    },
  };
  const service = new WhatsAppService({ db } as any);
  expect(service.publicConnection(banned).quarantined).toBe(true);
  expect(service.publicConnection(healthy).quarantined).toBe(false);
  for (const action of ['connect', 'reconnect', 'refresh', 'create-instance'] as const)
    await expect(service.operate('banned', 'org-test', action)).rejects.toThrow(
      /Esta conta está em quarentena/,
    );
  await expect(service.pairingCode('banned', 'org-test', { phoneNumber: '5511912345678' })).rejects.toThrow(
    /Esta conta está em quarentena/,
  );
  // The healthy account is not blocked by the other account's quarantine.
  await expect(service.operate('healthy', 'org-test', 'connect')).rejects.not.toThrow(/quarentena/);
  expect(update).not.toHaveBeenCalled();
});
