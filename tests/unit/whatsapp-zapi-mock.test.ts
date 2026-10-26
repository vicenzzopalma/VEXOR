import { describe, expect, it, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  connectorConfigurationReady,
  connectorRegistry,
  publicConnectorSettings,
  sealSecrets,
  whatsappAdapter,
  parseWhatsAppEvents,
  ConnectorError,
} from '@eimax/connectors';
import { connectionSchema } from '../../apps/api/src/workflows/whatsapp.service';

afterEach(() => vi.unstubAllEnvs());

describe('WhatsApp Multi-Provider Architecture (Z-API, MOCK Sandbox & Pairing Code)', () => {
  describe('Catálogo e Registro de Conectores', () => {
    it('registra provedores Z_API, MOCK e EVOLUTION com capacidades corretas de pairingCode', () => {
      expect(connectorRegistry.Z_API).toBeDefined();
      expect(connectorRegistry.Z_API.capabilities.pairingCode).toBe(true);
      expect(connectorRegistry.Z_API.capabilities.qr).toBe(true);
      expect(connectorRegistry.Z_API.capabilities.templates).toBe(false);
      expect(connectorRegistry.Z_API.capabilities.deliveryReceipts).toBe(true);

      expect(connectorRegistry.MOCK).toBeDefined();
      expect(connectorRegistry.MOCK.capabilities.pairingCode).toBe(true);
      expect(connectorRegistry.MOCK.capabilities.qr).toBe(true);
      expect(connectorRegistry.MOCK.capabilities.createInstance).toBe(true);
      expect(connectorRegistry.MOCK.capabilities.templates).toBe(false);

      expect(connectorRegistry.EVOLUTION.capabilities.pairingCode).toBe(true);
      expect(connectorRegistry.META.capabilities.pairingCode).toBe(false);
    });

    it('remove token e clientToken em publicConnectorSettings para Z_API', () => {
      const publicSettings = publicConnectorSettings('Z_API', {
        origin: 'https://api.z-api.io',
        instance: 'inst-12345',
        token: 'secret-token-value',
        clientToken: 'secret-client-token',
      });
      expect(publicSettings.origin).toBe('https://api.z-api.io');
      expect(publicSettings.instance).toBe('inst-12345');
      expect(publicSettings.token).toBeUndefined();
      expect(publicSettings.clientToken).toBeUndefined();
    });

    it('verifica prontidão de configuração para MOCK e Z_API', () => {
      vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('hex'));

      // MOCK is ready immediately with valid settings and no ciphertext
      expect(connectorConfigurationReady('MOCK', { mockName: 'sandbox-1' }, null)).toBe(true);
      expect(connectorConfigurationReady('MOCK', {}, null)).toBe(true);

      // Secrets in plaintext settings are never accepted.
      expect(
        connectorConfigurationReady(
          'Z_API',
          { origin: 'https://api.z-api.io', instance: 'inst-1', token: 'token-in-settings' },
          null,
        ),
      ).toBe(false);

      // Z_API needs both the instance token and the Client-Token, encrypted.
      expect(
        connectorConfigurationReady(
          'Z_API',
          { origin: 'https://api.z-api.io', instance: 'inst-1' },
          sealSecrets({ token: 'token-in-secrets' }),
        ),
      ).toBe(false);
      expect(
        connectorConfigurationReady(
          'Z_API',
          { origin: 'https://api.z-api.io', instance: 'inst-1' },
          sealSecrets({ token: 'token-in-secrets', clientToken: 'client-token' }),
        ),
      ).toBe(true);

      // Z_API is not ready without token
      expect(
        connectorConfigurationReady('Z_API', { origin: 'https://api.z-api.io', instance: 'inst-1' }, null),
      ).toBe(false);
    });
  });

  describe('Z-API Adapter', () => {
    it('exige token e instância para inicializar chamadas', () => {
      expect(() =>
        whatsappAdapter('Z_API', { instance: 'inst-1' }, {}, vi.fn()),
      ).toThrowError(/CONFIGURATION_REQUIRED/);

      expect(() =>
        whatsappAdapter('Z_API', {}, { token: 'tok-1' }, vi.fn()),
      ).toThrowError(/CONFIGURATION_REQUIRED/);
    });

    it('consulta status do Z-API e mapeia estados', async () => {
      const transport = vi
        .fn()
        .mockResolvedValueOnce({ connected: true })
        .mockResolvedValueOnce({ connected: false, connecting: true })
        .mockResolvedValueOnce({ connected: false, connecting: false });

      const adapter = whatsappAdapter(
        'Z_API',
        { instance: 'inst-99', origin: 'https://api.z-api.io' },
        { token: 'tok-abc' },
        transport,
      );

      expect(await adapter.status()).toBe('CONNECTED');
      expect(await adapter.status()).toBe('CONNECTING');
      expect(await adapter.status()).toBe('DISCONNECTED');

      expect(transport).toHaveBeenCalledWith(
        new URL('https://api.z-api.io/instances/inst-99/token/tok-abc/status'),
        'GET',
        {},
        undefined,
      );
    });

    it('solicita QR Code no Z-API e formata prefixo data:image/png;base64', async () => {
      const transport = vi
        .fn()
        .mockResolvedValueOnce({ connected: false })
        .mockResolvedValueOnce({ value: 'rawBase64StringData==' });

      const adapter = whatsappAdapter(
        'Z_API',
        { instance: 'inst-99', origin: 'https://api.z-api.io' },
        { token: 'tok-abc' },
        transport,
      );

      const result = await adapter.connect();
      expect(result.state).toBe('WAITING_FOR_QR');
      expect(result.qr).toBe('data:image/png;base64,rawBase64StringData==');
      expect(result.expiresAt).toBeDefined();
    });

    it('gera pairing code de 8 dígitos no Z-API com número limpo', async () => {
      const transport = vi.fn().mockResolvedValueOnce({ code: '9876-5432' });

      const adapter = whatsappAdapter(
        'Z_API',
        { instance: 'inst-99', origin: 'https://api.z-api.io' },
        { token: 'tok-abc', clientToken: 'sec-client-token' },
        transport,
      );

      const result = await adapter.pairingCode('+55 (11) 98765-4321');
      expect(result.code).toBe('9876-5432');
      expect(result.expiresAt).toBeDefined();

      expect(transport).toHaveBeenCalledWith(
        new URL('https://api.z-api.io/instances/inst-99/token/tok-abc/phone-code/5511987654321'),
        'GET',
        { 'Client-Token': 'sec-client-token' },
        undefined,
      );
    });

    it('envia mensagem de texto e template via Z-API incluindo header Client-Token', async () => {
      const transport = vi
        .fn()
        .mockResolvedValueOnce({ zaapId: 'zaap-msg-101' })
        .mockResolvedValueOnce({ messageId: 'zaap-tpl-202' });

      const adapter = whatsappAdapter(
        'Z_API',
        { instance: 'inst-99', origin: 'https://api.z-api.io' },
        { token: 'tok-abc', clientToken: 'client-secret-123' },
        transport,
      );

      const sendTextResult = await adapter.send({ to: '+5511999999999', text: 'Olá Z-API!' });
      expect(sendTextResult).toEqual({ providerMessageId: 'zaap-msg-101', status: 'SENT' });
      expect(transport).toHaveBeenNthCalledWith(
        1,
        new URL('https://api.z-api.io/instances/inst-99/token/tok-abc/send-text'),
        'POST',
        { 'Client-Token': 'client-secret-123' },
        { phone: '5511999999999', message: 'Olá Z-API!' },
      );

      const sendTplResult = await adapter.send({
        to: '+5511888888888',
        template: 'hello_world',
        text: 'Corpo do template',
      });
      expect(sendTplResult).toEqual({ providerMessageId: 'zaap-tpl-202', status: 'SENT' });
      expect(transport).toHaveBeenNthCalledWith(
        2,
        new URL('https://api.z-api.io/instances/inst-99/token/tok-abc/send-template'),
        'POST',
        { 'Client-Token': 'client-secret-123' },
        { phone: '5511888888888', template: 'hello_world', message: 'Corpo do template' },
      );
    });

    it('executa reconnect e disconnect via Z-API', async () => {
      const transport = vi
        .fn()
        .mockResolvedValueOnce({}) // restart
        .mockResolvedValueOnce({ connected: true }) // status
        .mockResolvedValueOnce({}); // disconnect

      const adapter = whatsappAdapter(
        'Z_API',
        { instance: 'inst-99', origin: 'https://api.z-api.io' },
        { token: 'tok-abc' },
        transport,
      );

      const recon = await adapter.reconnect();
      expect(recon.state).toBe('CONNECTED');

      await adapter.disconnect();
      expect(transport).toHaveBeenLastCalledWith(
        new URL('https://api.z-api.io/instances/inst-99/token/tok-abc/disconnect'),
        'GET',
        {},
        undefined,
      );
    });
  });

  describe('MOCK Sandbox Provider (Zero Chamadas Externas)', () => {
    it('executa ciclo de vida completo em memória sem acionar transporte de rede', async () => {
      const transport = vi.fn();
      const adapter = whatsappAdapter('MOCK', { mockName: 'dev-sandbox' }, {}, transport);

      expect(await adapter.status()).toBe('CONNECTED');

      const connectRes = await adapter.connect();
      expect(connectRes.state).toBe('CONNECTED');

      const reconRes = await adapter.reconnect();
      expect(reconRes.state).toBe('CONNECTED');

      const templates = await adapter.templates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].name).toBe('mock_hello');

      const instanceRes = await adapter.createInstance();
      expect(instanceRes.created).toBe(true);

      const pairingRes = await adapter.pairingCode('+55 11 99999-8888');
      expect(pairingRes.code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      expect(pairingRes.expiresAt).toBeDefined();

      const sendRes = await adapter.send({ to: '+5511999998888', text: 'Teste mock' });
      expect(sendRes.status).toBe('SENT');
      expect(sendRes.providerMessageId).toMatch(/^mock-msg-[a-f0-9]{16}$/);

      await adapter.disconnect();

      // Zero chamadas ao transporte de rede externo
      expect(transport).not.toHaveBeenCalled();
    });

    it('gera código de pareamento determinístico baseado no número de telefone', async () => {
      const adapter = whatsappAdapter('MOCK', {}, {});
      const codeA1 = await adapter.pairingCode('+55 (11) 91234-5678');
      const codeA2 = await adapter.pairingCode('5511912345678');
      const codeB = await adapter.pairingCode('5511999990000');

      expect(codeA1.code).toBe(codeA2.code);
      expect(codeA1.code).not.toBe(codeB.code);
    });
  });

  describe('Pairing Code Trans-provedores e Validação', () => {
    it('gera pairing code via Evolution API em POST /instance/pairingCode/:instance', async () => {
      vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example');
      const transport = vi.fn().mockResolvedValueOnce({ code: 'EVO1-2345' });

      const adapter = whatsappAdapter(
        'EVOLUTION',
        { origin: 'https://gateway.example', instance: 'evo-inst' },
        { apiKey: 'secret-key' },
        transport,
      );

      const result = await adapter.pairingCode('+55 21 98765-4321');
      expect(result.code).toBe('EVO1-2345');
      expect(transport).toHaveBeenCalledWith(
        new URL('https://gateway.example/instance/pairingCode/evo-inst'),
        'POST',
        { apikey: 'secret-key' },
        { number: '5521987654321' },
      );
    });

    it('rejeita pairing code para META lançando CAPABILITY_NOT_SUPPORTED', async () => {
      const adapter = whatsappAdapter(
        'META',
        { apiVersion: 'v21.0', phoneNumberId: '10987654321' },
        { accessToken: 'meta-token' },
      );

      await expect(adapter.pairingCode('+5511999999999')).rejects.toThrowError(
        new ConnectorError('CAPABILITY_NOT_SUPPORTED'),
      );
    });

    it('rejeita números de telefone inválidos no pairing code', async () => {
      const adapter = whatsappAdapter('MOCK', {}, {});
      await expect(adapter.pairingCode('abc')).rejects.toThrowError(
        new ConnectorError('INVALID_RECIPIENT'),
      );
      await expect(adapter.pairingCode('')).rejects.toThrowError(
        new ConnectorError('INVALID_RECIPIENT'),
      );
    });
  });

  describe('Parser de Webhooks Multi-provedor (Z-API & MOCK)', () => {
    it('faz parse de mensagem recebida (ReceivedCallback) do Z-API', () => {
      const rawZApiMessage = {
        instanceId: 'inst-99',
        type: 'ReceivedCallback',
        phone: '5511988887777',
        fromMe: false,
        text: { message: 'Mensagem de teste Z-API' },
        messageId: 'ZAAP-IN-123456',
        momment: 1730000000,
        senderName: 'Carlos Silva',
      };

      const events = parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, rawZApiMessage);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: 'ZAAP-IN-123456',
        kind: 'MESSAGE',
        payload: {
          from: '5511988887777',
          text: 'Mensagem de teste Z-API',
          name: 'Carlos Silva',
          timestamp: 1730000000,
        },
      });
    });

    it('faz parse de confirmação de entrega e leitura do Z-API', () => {
      const rawDelivery = {
        instanceId: 'inst-99',
        type: 'DeliveryCallback',
        messageId: 'ZAAP-MSG-888',
        status: 'DELIVERED',
      };

      const events = parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, rawDelivery);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: 'ZAAP-MSG-888',
        kind: 'DELIVERED',
        payload: { providerMessageId: 'ZAAP-MSG-888' },
      });

      const rawRead = {
        instanceId: 'inst-99',
        type: 'MessageStatusCallback',
        messageId: 'ZAAP-MSG-888',
        status: 'READ',
      };
      const readEvents = parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, rawRead);
      expect(readEvents[0].kind).toBe('READ');
    });

    it('faz parse de evento de desconexão do Z-API', () => {
      const rawDisconnected = {
        instanceId: 'inst-99',
        type: 'Disconnected',
      };
      const events = parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, rawDisconnected);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('CONNECTION_CLOSED');
    });

    it('faz parse de eventos do MOCK sandbox', () => {
      const mockMsg = {
        kind: 'MESSAGE',
        id: 'mock-evt-1',
        from: '5511999990000',
        text: 'Mensagem do sandbox',
        name: 'Simulador',
      };
      const events = parseWhatsAppEvents('MOCK', {}, mockMsg);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('MESSAGE');
      expect(events[0].payload.text).toBe('Mensagem do sandbox');

      const mockReceipt = {
        kind: 'DELIVERED',
        id: 'mock-receipt-1',
        providerMessageId: 'mock-msg-999',
      };
      const receiptEvents = parseWhatsAppEvents('MOCK', {}, mockReceipt);
      expect(receiptEvents[0].kind).toBe('DELIVERED');
      expect(receiptEvents[0].payload.providerMessageId).toBe('mock-msg-999');
    });
  });

  describe('Validação do connectionSchema no NestJS API', () => {
    it('recusa segredos Z-API em settings (texto puro no banco)', () => {
      expect(() =>
        connectionSchema.parse({
          name: 'Z-API',
          provider: 'Z_API',
          settings: { instance: 'inst-corp-1', token: 'tok-abc' },
        }),
      ).toThrow();
    });

    it('rejeita token Z-API que alteraria o caminho da requisição', () => {
      expect(() =>
        whatsappAdapter('Z_API', { instance: 'inst-1' }, { token: '../../x?y=1', clientToken: 'c' }, vi.fn()),
      ).toThrow(ConnectorError);
    });

    it('ignora eventos Z-API sem a instância configurada, de grupo ou com remetente inválido', () => {
      const base = { type: 'ReceivedCallback', phone: '5511988887777', messageId: 'm1', text: { message: 'x' } };
      expect(parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, base)).toHaveLength(0);
      expect(
        parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, { ...base, instanceId: 'other' }),
      ).toHaveLength(0);
      expect(
        parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, { ...base, instanceId: 'inst-99', isGroup: true }),
      ).toHaveLength(0);
      expect(
        parseWhatsAppEvents('Z_API', { instance: 'inst-99' }, { ...base, instanceId: 'inst-99', phone: 'abc' }),
      ).toHaveLength(0);
    });

    it('valida conexão Z_API com origin, instance, token e clientToken', () => {
      const parsed = connectionSchema.parse({
        name: 'Z-API Conexão Principal',
        provider: 'Z_API',
        settings: {
          origin: 'https://api.z-api.io',
          instance: 'inst-corp-1',
        },
        credentials: {
          token: 'tok-abc',
          clientToken: 'sec-client-tok',
        },
      });
      expect(parsed.provider).toBe('Z_API');
      expect(parsed.settings.instance).toBe('inst-corp-1');
    });

    it('valida conexão MOCK com mockName e sem credenciais obrigatórias', () => {
      const parsed = connectionSchema.parse({
        name: 'Sandbox Local',
        provider: 'MOCK',
        settings: {
          mockName: 'teste-local',
        },
      });
      expect(parsed.provider).toBe('MOCK');
      expect(parsed.settings.mockName).toBe('teste-local');
    });

    it('rejeita provedor desconhecido', () => {
      expect(() =>
        connectionSchema.parse({
          name: 'Invalido',
          provider: 'UNKNOWN_PROVIDER',
          settings: {},
        }),
      ).toThrow();
    });
  });
});
