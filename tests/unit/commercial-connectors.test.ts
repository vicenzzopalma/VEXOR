import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  ConnectorError,
  exportSheetRows,
  googleSheetsAdapter,
  mapSheetRows,
  parseWhatsAppEvents,
  prepareGoogleAuthorization,
  resendAdapter,
  verifyResendWebhook,
  whatsappAdapter,
} from '@eimax/connectors';
afterEach(() => vi.unstubAllEnvs());
const mapping = {
  spreadsheetId: 'sheet-fixture',
  sheet: "Equipe's leads",
  fields: [{ column: 'Nome', field: 'name' as const }],
};
describe('Conectores comerciais: transportes isolados, sem homologação externa', () => {
  it('Resend envia com chave idempotente e mantém aceitação PENDING', async () => {
    const transport = vi.fn().mockResolvedValue({ id: 'fixture-provider-id' });
    const adapter = resendAdapter({ from: 'team@example.com' }, { apiKey: 'fixture' }, transport);
    expect(
      await adapter.send({ to: 'lead@example.com', subject: 'Fixture', text: 'Texto' }, 'vexor:job'),
    ).toEqual({ providerMessageId: 'fixture-provider-id', status: 'PENDING' });
    expect(transport.mock.calls[0][2]['Idempotency-Key']).toBe('vexor:job');
    expect(transport.mock.calls[0][0].origin).toBe('https://api.resend.com');
    transport.mockResolvedValue({});
    await expect(
      adapter.send({ to: 'lead@example.com', subject: 'Fixture', text: 'Texto' }, 'vexor:job'),
    ).rejects.toThrow('UNCERTAIN');
  });
  it('verifica remetente sem enviar mensagem e propaga autenticação inválida', async () => {
    const transport = vi.fn().mockResolvedValue({ data: [{ name: 'example.com', status: 'pending' }] });
    const adapter = resendAdapter({ from: 'team@example.com' }, { apiKey: 'fixture' }, transport);
    await expect(adapter.verify()).rejects.toThrow('SENDER_NOT_VERIFIED');
    transport.mockRejectedValue(new ConnectorError('AUTHENTICATION_FAILED'));
    await expect(adapter.verify()).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(transport.mock.calls.every((call) => call[1] === 'GET')).toBe(true);
  });
  it('nenhum adaptador comercial padrão chama rede sem habilitação explícita', async () => {
    vi.stubEnv('EMAIL_EXTERNAL_ENABLED', 'false');
    vi.stubEnv('GOOGLE_SHEETS_EXTERNAL_ENABLED', 'false');
    await expect(resendAdapter({ from: 'team@example.com' }, { apiKey: 'fixture' }).verify()).rejects.toThrow(
      'CONFIGURATION_REQUIRED',
    );
    await expect(googleSheetsAdapter({ accessToken: 'fixture' }).spreadsheets()).rejects.toThrow(
      'CONFIGURATION_REQUIRED',
    );
  });
  it('valida Svix com bytes originais, timestamp e múltiplas assinaturas', () => {
    const key = Buffer.alloc(32, 9);
    const raw = Buffer.from('{"type":"email.delivered"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const id = 'msg-fixture';
    const signature = `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.`).update(raw).digest('base64')}`;
    const secret = `whsec_${key.toString('base64')}`;
    expect(verifyResendWebhook(raw, { id, timestamp, signature: `v1,invalid ${signature}` }, secret)).toBe(
      true,
    );
    expect(verifyResendWebhook(Buffer.from('{}'), { id, timestamp, signature }, secret)).toBe(false);
    expect(verifyResendWebhook(raw, { id, timestamp, signature }, secret, Date.now() + 600000)).toBe(false);
    expect(verifyResendWebhook(raw, { id: 'other', timestamp, signature }, secret)).toBe(false);
  });
  it('prepara OAuth com estado aleatório, PKCE e destino fixo', () => {
    const a = prepareGoogleAuthorization('fixture-client', 'http://127.0.0.1/callback');
    const b = prepareGoogleAuthorization('fixture-client', 'http://127.0.0.1/callback');
    expect(a.state).not.toBe(b.state);
    const url = new URL(a.authorizationUrl);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(a.verifier).digest('base64url'),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(a.authorizationUrl).not.toContain(a.verifier);
    expect(() => prepareGoogleAuthorization('fixture', 'http://evil.example/callback')).toThrow();
    expect(() => prepareGoogleAuthorization('fixture', 'https://user:pass@example.com/callback')).toThrow();
  });
  it('mapeia campos permitidos, ausências, tipos e caracteres especiais', () => {
    expect(mapSheetRows(['Nome'], [['A & B <script>'], []], mapping)).toEqual([
      { row: 2, fields: { name: 'A & B <script>' } },
      { row: 3, fields: { name: null } },
    ]);
    expect(() => mapSheetRows(['Outro'], [['A']], mapping)).toThrow('COLUMN_NOT_FOUND');
    expect(() => mapSheetRows(['Nome', 'Nome'], [['A']], mapping)).toThrow('DUPLICATE_COLUMNS');
    expect(() => mapSheetRows(['Nome'], [[{ secret: 'x' }]], mapping)).toThrow();
    expect(exportSheetRows([{ name: 'A', credentials: 'secret' }], mapping)).toEqual({
      headers: ['Nome'],
      rows: [['A']],
    });
  });
  it('Sheets envia células RAW e protege aba com aspas e identificador', async () => {
    const transport = vi.fn().mockResolvedValue({ updates: { updatedRows: 1, updatedRange: 'fixture!A2' } });
    const adapter = googleSheetsAdapter({ accessToken: 'fixture' }, transport);
    await adapter.append(mapping, [{ name: '=IMPORTXML("https://example.com")' }]);
    const call = transport.mock.calls[0];
    expect(call[0].origin).toBe('https://sheets.googleapis.com');
    expect(call[0].searchParams.get('valueInputOption')).toBe('RAW');
    expect(decodeURIComponent(call[0].pathname)).toContain("'Equipe''s leads'!A:AD");
    expect(call[3].values[0][0]).toContain('=IMPORTXML');
    await expect(adapter.tabs('../other')).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('Evolution cria e reinicia instância sem afirmar conexão ou inventar QR', async () => {
    vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example');
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ instance: { instanceName: 'sales' } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ instance: { state: 'close' } })
      .mockResolvedValueOnce({});
    const adapter = whatsappAdapter(
      'EVOLUTION',
      { origin: 'https://gateway.example', instance: 'sales' },
      { apiKey: 'fixture' },
      transport,
    );
    expect(await adapter.createInstance()).toEqual({ created: true, instance: 'sales' });
    expect(transport.mock.calls[0][1]).toBe('POST');
    expect(transport.mock.calls[0][3]).toMatchObject({ qrcode: false, integration: 'WHATSAPP-BAILEYS' });
    await expect(adapter.reconnect()).rejects.toThrow('QR_UNAVAILABLE');
    expect(transport.mock.calls[1][0].pathname).toBe('/instance/restart/sales');
  });
  it('normaliza mensagens sem aceitar outra conta, eco de envio ou grupo', () => {
    const value = {
      metadata: { phone_number_id: '1234' },
      messages: [{ id: 'm1', from: '5511999999999', text: { body: 'Empresa & Cia' } }],
      contacts: [{ wa_id: '5511999999999', profile: { name: 'Maria' } }],
    };
    const envelope = { object: 'whatsapp_business_account', entry: [{ changes: [{ value }] }] };
    expect(parseWhatsAppEvents('META', { phoneNumberId: 'other' }, envelope)).toEqual([]);
    expect(parseWhatsAppEvents('META', { phoneNumberId: '1234' }, envelope)[0].payload).toMatchObject({
      text: 'Empresa & Cia',
      name: 'Maria',
    });
    const malformed = structuredClone(envelope);
    malformed.entry[0].changes[0].value.messages[0].from = 'invalid-phone';
    expect(() => parseWhatsAppEvents('META', { phoneNumberId: '1234' }, malformed)).toThrow();
    for (const [fromMe, remoteJid] of [
      [true, '5511999999999@s.whatsapp.net'],
      [false, 'group@g.us'],
    ])
      expect(
        parseWhatsAppEvents(
          'EVOLUTION',
          { instance: 'sales' },
          {
            instance: 'sales',
            event: 'messages.upsert',
            data: { key: { id: 'm1', fromMe, remoteJid }, message: { conversation: 'fixture' } },
          },
        ),
      ).toEqual([]);
  });
});
