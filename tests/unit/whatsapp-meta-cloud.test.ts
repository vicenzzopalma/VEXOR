import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import {
  parseWhatsAppEvents,
  sealSecrets,
  verifySignature,
  whatsappAdapter,
} from '@eimax/connectors';
import { WhatsAppService } from '../../apps/api/src/workflows/whatsapp.service';
import { HttpException } from '@nestjs/common';

afterEach(() => vi.unstubAllEnvs());

const metaSettings = { phoneNumberId: '10987654321', apiVersion: 'v21.0', wabaId: '9876543210' };
const metaSecrets = {
  accessToken: 'EAAFxMetaAccessTokenTest123',
  appSecret: 'test-meta-app-secret-32-chars-long!',
  verifyToken: 'my-meta-webhook-verify-token-42',
};

describe('Meta WhatsApp Cloud API Adapter', () => {
  it('status() suporta todos os status documentados pela Meta, com tolerancia a caixa', async () => {
    const cases: [string, string][] = [
      ['CONNECTED', 'CONNECTED'],
      ['connected', 'CONNECTED'],
      ['PENDING', 'CONNECTING'],
      ['pending', 'CONNECTING'],
      ['DISCONNECTED', 'DISCONNECTED'],
      ['disconnected', 'DISCONNECTED'],
      ['UNVERIFIED', 'DISCONNECTED'],
      ['unverified', 'DISCONNECTED'],
      ['OFFLINE', 'DISCONNECTED'],
      ['offline', 'DISCONNECTED'],
      ['FLAGGED', 'ERROR'],
      ['flagged', 'ERROR'],
      ['RESTRICTED', 'ERROR'],
      ['restricted', 'ERROR'],
      ['BANNED', 'ERROR'],
      ['banned', 'ERROR'],
      ['RATE_LIMITED', 'ERROR'],
      ['rate_limited', 'ERROR'],
    ];

    for (const [providerStatus, expectedState] of cases) {
      const transport = vi.fn().mockResolvedValue({ id: metaSettings.phoneNumberId, status: providerStatus });
      const adapter = whatsappAdapter('META', metaSettings, metaSecrets, transport);
      const state = await adapter.status();
      expect(state).toBe(expectedState);
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: `/${metaSettings.apiVersion}/${metaSettings.phoneNumberId}`,
          search: '?fields=id,display_phone_number,status',
        }),
        'GET',
        { Authorization: `Bearer ${metaSecrets.accessToken}` },
        undefined,
      );
    }
  });

  it('status() falha se id retornado for divergente ou status nao confirmado', async () => {
    const wrongIdTransport = vi.fn().mockResolvedValue({ id: 'wrong-id', status: 'CONNECTED' });
    const wrongIdAdapter = whatsappAdapter('META', metaSettings, metaSecrets, wrongIdTransport);
    await expect(wrongIdAdapter.status()).rejects.toThrow('INVALID_PROVIDER_RESPONSE');

    const unconfirmedTransport = vi.fn().mockResolvedValue({ id: metaSettings.phoneNumberId, status: 'UNKNOWN_STATUS' });
    const unconfirmedAdapter = whatsappAdapter('META', metaSettings, metaSecrets, unconfirmedTransport);
    await expect(unconfirmedAdapter.status()).rejects.toThrow('SESSION_STATUS_UNCONFIRMED');

    const missingTransport = vi.fn().mockResolvedValue({ id: metaSettings.phoneNumberId });
    const missingAdapter = whatsappAdapter('META', metaSettings, metaSecrets, missingTransport);
    await expect(missingAdapter.status()).rejects.toThrow('SESSION_STATUS_UNCONFIRMED');
  });

  it('connect() e reconnect() retornam status sem gerar QR code', async () => {
    const transport = vi.fn().mockResolvedValue({ id: metaSettings.phoneNumberId, status: 'CONNECTED' });
    const adapter = whatsappAdapter('META', metaSettings, metaSecrets, transport);

    const connectResult = await adapter.connect();
    expect(connectResult).toEqual({ state: 'CONNECTED' });
    expect(connectResult.qr).toBeUndefined();

    const reconnectResult = await adapter.reconnect();
    expect(reconnectResult).toEqual({ state: 'CONNECTED' });
  });

  it('disconnect() conclui localmente sem revogar token globalmente', async () => {
    const transport = vi.fn();
    const adapter = whatsappAdapter('META', metaSettings, metaSecrets, transport);
    await adapter.disconnect();
    expect(transport).not.toHaveBeenCalled();
  });

  it('send() formata payload individual para texto e template e valida parametros', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ id: 'wamid.HBgL123', message_status: 'accepted' }] })
      .mockResolvedValueOnce({ messages: [{ id: 'wamid.HBgL456', message_status: 'sent' }] });

    const adapter = whatsappAdapter('META', metaSettings, metaSecrets, transport);

    // Mensagem de texto
    const textResult = await adapter.send({ to: '+5511999998888', text: 'Ola Mundo' });
    expect(textResult).toEqual({ providerMessageId: 'wamid.HBgL123', status: 'PENDING' });
    expect(transport.mock.calls[0][3]).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511999998888',
      type: 'text',
      text: { body: 'Ola Mundo' },
    });

    // Mensagem com template aprovado
    const templateResult = await adapter.send({
      to: '5511999998888',
      template: 'lead_welcome',
      language: 'pt_BR',
    });
    expect(templateResult).toEqual({ providerMessageId: 'wamid.HBgL456', status: 'SENT' });
    expect(transport.mock.calls[1][3]).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511999998888',
      type: 'template',
      template: { name: 'lead_welcome', language: { code: 'pt_BR' } },
    });

    // Validacao: destinatario invalido
    await expect(adapter.send({ to: 'invalid-number', text: 'Oi' })).rejects.toThrow('INVALID_RECIPIENT');

    // Validacao: texto vazio sem template
    await expect(adapter.send({ to: '+5511999998888', text: '   ' })).rejects.toThrow('INVALID_PAYLOAD');
  });

  it('templates() busca templates aprovados via Graph API e filtra variaveis', async () => {
    const transport = vi.fn().mockResolvedValue({
      data: [
        { name: 'boas_vindas', status: 'APPROVED', language: 'pt_BR', components: [{ type: 'BODY', text: 'Ola!' }] },
        { name: 'pendente', status: 'PENDING', language: 'pt_BR' },
        { name: 'com_variavel', status: 'APPROVED', language: 'pt_BR', components: [{ text: 'Ola {{1}}' }] },
        { name: 'com_botao', status: 'APPROVED', language: 'pt_BR', components: [{ type: 'BUTTONS' }] },
      ],
    });

    const adapter = whatsappAdapter('META', metaSettings, metaSecrets, transport);
    const templates = await adapter.templates();
    expect(templates).toEqual([{ name: 'boas_vindas', language: 'pt_BR' }]);
    expect(transport.mock.calls[0][0].pathname).toBe(`/${metaSettings.apiVersion}/${metaSettings.wabaId}/message_templates`);
  });
});

describe('Meta Webhook Events Parsing', () => {
  it('parseWhatsAppEvents extrai mensagens de texto, botoes e respostas interativas', () => {
    const envelope = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: metaSettings.phoneNumberId },
                contacts: [{ wa_id: '5511999997777', profile: { name: 'Joao Silva' } }],
                messages: [
                  {
                    id: 'wamid.msg1',
                    from: '5511999997777',
                    timestamp: 1672531199,
                    type: 'text',
                    text: { body: 'Quero um orcamento' },
                  },
                  {
                    id: 'wamid.msg2',
                    from: '5511999997777',
                    timestamp: '1672531200',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: 'btn_yes', title: 'Sim, concordo' },
                    },
                  },
                  {
                    id: 'wamid.msg3',
                    from: '5511999997777',
                    timestamp: 1672531201,
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: { id: 'item_1', title: 'Plano Pro' },
                    },
                  },
                  {
                    id: 'wamid.msg4',
                    from: '5511999997777',
                    type: 'button',
                    button: { text: 'Confirmar' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = parseWhatsAppEvents('META', metaSettings, envelope);
    expect(events).toHaveLength(4);

    expect(events[0]).toEqual({
      id: 'wamid.msg1',
      kind: 'MESSAGE',
      payload: {
        from: '5511999997777',
        text: 'Quero um orcamento',
        name: 'Joao Silva',
        timestamp: 1672531199,
      },
    });

    expect(events[1]).toEqual({
      id: 'wamid.msg2',
      kind: 'MESSAGE',
      payload: {
        from: '5511999997777',
        text: 'Sim, concordo',
        name: 'Joao Silva',
        timestamp: '1672531200',
      },
    });

    expect(events[2]).toEqual({
      id: 'wamid.msg3',
      kind: 'MESSAGE',
      payload: {
        from: '5511999997777',
        text: 'Plano Pro',
        name: 'Joao Silva',
        timestamp: 1672531201,
      },
    });

    expect(events[3]).toEqual({
      id: 'wamid.msg4',
      kind: 'MESSAGE',
      payload: {
        from: '5511999997777',
        text: 'Confirmar',
        name: 'Joao Silva',
      },
    });
  });

  it('parseWhatsAppEvents extrai recibos de entrega (sent, delivered, read, failed)', () => {
    const envelope = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: metaSettings.phoneNumberId },
                statuses: [
                  { id: 'wamid.status1', status: 'sent', timestamp: '1672531300', recipient_id: '5511999997777' },
                  { id: 'wamid.status2', status: 'delivered', timestamp: '1672531305', recipient_id: '5511999997777' },
                  { id: 'wamid.status3', status: 'read', timestamp: '1672531310', recipient_id: '5511999997777' },
                  { id: 'wamid.status4', status: 'failed', timestamp: '1672531315', recipient_id: '5511999997777' },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = parseWhatsAppEvents('META', metaSettings, envelope);
    expect(events).toHaveLength(4);

    expect(events[0]).toMatchObject({
      id: 'wamid.status1',
      kind: 'SENT',
      payload: { providerMessageId: 'wamid.status1', from: '5511999997777', timestamp: '1672531300' },
    });
    expect(events[1]).toMatchObject({
      id: 'wamid.status2',
      kind: 'DELIVERED',
      payload: { providerMessageId: 'wamid.status2', from: '5511999997777', timestamp: '1672531305' },
    });
    expect(events[2]).toMatchObject({
      id: 'wamid.status3',
      kind: 'READ',
      payload: { providerMessageId: 'wamid.status3', from: '5511999997777', timestamp: '1672531310' },
    });
    expect(events[3]).toMatchObject({
      id: 'wamid.status4',
      kind: 'FAILED',
      payload: { providerMessageId: 'wamid.status4', from: '5511999997777', timestamp: '1672531315' },
    });
  });

  it('parseWhatsAppEvents ignora eventos destinados a outro phoneNumberId', () => {
    const envelope = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'another-phone-id' },
                messages: [{ id: 'wamid.other', from: '5511999997777', text: { body: 'Ola' } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppEvents('META', metaSettings, envelope)).toEqual([]);
  });
});

describe('Meta Webhook Verification e Assinatura SHA256', () => {
  it('verifySignature valida assinatura sha256 no formato x-hub-signature-256 e tolera caixa', () => {
    const secret = 'super-secret-key';
    const raw = Buffer.from(JSON.stringify({ test: 'payload' }));
    const hash = createHmac('sha256', secret).update(raw).digest('hex');

    expect(verifySignature(raw, `sha256=${hash}`, secret)).toBe(true);
    expect(verifySignature(raw, `sha256=${hash.toUpperCase()}`, secret)).toBe(true);
    expect(verifySignature(raw, `  sha256=${hash}  `, secret)).toBe(true);

    expect(verifySignature(raw, `sha256=invalidhash`, secret)).toBe(false);
    expect(verifySignature(Buffer.from('tampered'), `sha256=${hash}`, secret)).toBe(false);
    expect(verifySignature(raw, `sha256=${hash}`, 'wrong-secret')).toBe(false);
    expect(verifySignature(raw, '', secret)).toBe(false);
  });

  it('WhatsAppService.verify() responde ao handshake da Meta com hub.challenge', async () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
    const sealed = sealSecrets(metaSecrets);

    const mockMetaRow = {
      id: 'conn-meta-verify',
      organizationId: 'org-test',
      provider: 'META',
      state: 'CONNECTED',
      credentials: sealed,
    };

    const mockDb = {
      whatsAppConnection: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === 'conn-meta-verify') return Promise.resolve(mockMetaRow);
          return Promise.resolve(null);
        }),
      },
    };

    const service = new WhatsAppService({ db: mockDb } as any);

    // Handshake valido
    const challenge = await service.verify('conn-meta-verify', 'subscribe', metaSecrets.verifyToken, 'challenge-string-12345');
    expect(challenge).toBe('challenge-string-12345');

    // Token incorreto -> 401
    await expect(service.verify('conn-meta-verify', 'subscribe', 'wrong-token', '12345')).rejects.toThrow(HttpException);

    // Mode incorreto -> 401
    await expect(service.verify('conn-meta-verify', 'unsubscribe', metaSecrets.verifyToken, '12345')).rejects.toThrow(HttpException);

    // Challenge ausente -> 401
    await expect(service.verify('conn-meta-verify', 'subscribe', metaSecrets.verifyToken, '')).rejects.toThrow(HttpException);

    // Conexao inexistente -> 401
    await expect(service.verify('non-existent', 'subscribe', metaSecrets.verifyToken, '12345')).rejects.toThrow(HttpException);
  });

  it('WhatsAppService.webhook() aceita payload assinado e persiste eventos no banco', async () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
    const sealed = sealSecrets(metaSecrets);

    const mockMetaRow = {
      id: 'conn-meta-hook',
      organizationId: 'org-test',
      provider: 'META',
      state: 'CONNECTED',
      settings: metaSettings,
      credentials: sealed,
    };

    const upsertedEvents: any[] = [];
    const mockDb = {
      whatsAppConnection: {
        findUnique: vi.fn().mockResolvedValue(mockMetaRow),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          workflow: { findMany: vi.fn().mockResolvedValue([]) },
          whatsAppEvent: {
            upsert: vi.fn().mockImplementation((args) => {
              upsertedEvents.push(args);
              return Promise.resolve(args.create);
            }),
          },
        };
        return callback(tx);
      }),
    };

    const service = new WhatsAppService({ db: mockDb } as any);

    const webhookBody = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: metaSettings.phoneNumberId },
                messages: [{ id: 'wamid.hook1', from: '5511999997777', text: { body: 'Teste Hook' } }],
              },
            },
          ],
        },
      ],
    };

    const raw = Buffer.from(JSON.stringify(webhookBody));
    const validSignature = `sha256=${createHmac('sha256', metaSecrets.appSecret).update(raw).digest('hex')}`;

    const result = await service.webhook('conn-meta-hook', webhookBody, raw, validSignature, '');
    expect(result).toEqual({ accepted: true, persistedEvents: 1, processing: 'ASYNCHRONOUS' });
    expect(upsertedEvents).toHaveLength(1);
    expect(upsertedEvents[0].create).toMatchObject({
      connectionId: 'conn-meta-hook',
      providerEventId: 'wamid.hook1',
      kind: 'MESSAGE',
      status: 'PENDING',
    });

    // Assinatura invalida -> 401
    await expect(
      service.webhook('conn-meta-hook', webhookBody, raw, 'sha256=invalid', ''),
    ).rejects.toThrow(HttpException);
  });
});
