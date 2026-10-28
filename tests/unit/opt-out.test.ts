import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPT_OUT_NOTICE,
  classifyOptOut,
  normalizeOptOutText,
  optOutEventKey,
  optOutExcerpt,
  parseWhatsAppEvents,
  resolveEsferaLink,
  toE164,
} from '@eimax/connectors';
import { buildOptOutDelivery, deliveryOutcome, optOutBackoffMs, OPT_OUT_MAX_BACKOFF_MS } from '@eimax/workflow-runtime';

afterEach(() => vi.unstubAllEnvs());

describe('Classificação de SAIR em mensagens recebidas (sem histórico, sem provedor)', () => {
  it('reconhece SAIR e equivalentes curtos com acentos, caixa, pontuação e emoji', () => {
    for (const text of [
      'SAIR',
      'sair',
      ' Sair! ',
      'sair 🙏',
      'PARAR',
      'Pare.',
      'stop',
      'Cancelar',
      'Descadastrar',
      'Não quero mais receber',
      'nao quero receber mensagens',
      'Remover meu número',
      'Pare de enviar',
      'quero sair',
      'me tira dessa lista',
    ])
      expect(classifyOptOut(text), text).toBe('OPT_OUT');
  });
  it('envia para revisão pedidos ambíguos ou misturados com negociação', () => {
    for (const text of [
      'quero sair mas me liga amanhã para negociar',
      'não quero mais receber, só o boleto',
      'pode parar de mandar mensagem? vou pagar sexta',
      'me tira da lista por favor e me manda o link',
      'cancelar o acordo',
      'não entre em contato comigo',
    ])
      expect(classifyOptOut(text), text).toBe('AMBIGUOUS');
  });
  it('ignora respostas comuns, vazias e textos longos', () => {
    for (const text of [
      '',
      '   ',
      'ok',
      'bom dia',
      'quanto está o valor?',
      'posso pagar sexta',
      'parece bom',
      'vou sairia nunca',
      'a'.repeat(5000),
      Array.from({ length: 45 }, () => 'quero sair').join(' '),
    ])
      expect(classifyOptOut(text), text).toBe('NONE');
    expect(classifyOptOut(undefined)).toBe('NONE');
    expect(classifyOptOut(null)).toBe('NONE');
  });
  it('normaliza acentos e símbolos de forma estável', () => {
    expect(normalizeOptOutText('  NÃO quero MAIS!!! 🙏 ')).toBe('nao quero mais');
  });
  it('mantém o aviso neutro sem vincular SAIR a dívida ou renúncia', () => {
    expect(OPT_OUT_NOTICE).toBe('Para deixar de receber mensagens por este canal, responda SAIR.');
    expect(OPT_OUT_NOTICE.toLowerCase()).not.toMatch(/d[ií]vida|reconhec|ren[uú]ncia|recurso|contesta/);
  });
});

describe('Número real em E.164 e identificador estável', () => {
  it('normaliza números brasileiros com e sem DDI e rejeita inválidos', () => {
    expect(toE164('5575988052539')).toBe('+5575988052539');
    expect(toE164('+55 (75) 98805-2539')).toBe('+5575988052539');
    expect(toE164('75988052539')).toBe('+5575988052539');
    expect(toE164('7588052539')).toBe('+557588052539');
    expect(toE164('5511999999999')).toBe('+5511999999999');
    expect(toE164('1234')).toBeUndefined();
    expect(toE164('')).toBeUndefined();
    expect(toE164(undefined)).toBeUndefined();
  });
  it('gera a mesma chave para o mesmo evento do provedor e um recorte curto do texto', () => {
    expect(optOutEventKey('conn-1', 'wamid.ABC')).toBe('whatsapp:conn-1:wamid.ABC');
    expect(optOutEventKey('conn-1', 'wamid.ABC')).toBe(optOutEventKey('conn-1', 'wamid.ABC'));
    expect(optOutExcerpt('  SAIR \n agora ')).toBe('SAIR agora');
    expect(optOutExcerpt('x'.repeat(500))).toHaveLength(80);
  });
});

describe('Somente mensagens individuais recebidas viram eventos MESSAGE', () => {
  it('Evolution: ignora grupos e mensagens próprias', () => {
    const settings = { instance: 'inst' };
    const own = parseWhatsAppEvents('EVOLUTION', settings, {
      instance: 'inst',
      event: 'messages.upsert',
      data: { key: { id: 'a', fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: 'SAIR' } },
    });
    const group = parseWhatsAppEvents('EVOLUTION', settings, {
      instance: 'inst',
      event: 'messages.upsert',
      data: { key: { id: 'b', fromMe: false, remoteJid: '123456-789@g.us' }, message: { conversation: 'SAIR' } },
    });
    const individual = parseWhatsAppEvents('EVOLUTION', settings, {
      instance: 'inst',
      event: 'messages.upsert',
      data: { key: { id: 'c', fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: 'SAIR' } },
    });
    expect(own).toHaveLength(0);
    expect(group).toHaveLength(0);
    expect(individual).toMatchObject([{ kind: 'MESSAGE', payload: { from: '5511999999999', text: 'SAIR' } }]);
  });
  it('Z-API: ignora grupos e mensagens próprias', () => {
    const settings = { instance: 'zinst' };
    const base = { instanceId: 'zinst', type: 'ReceivedCallback', messageId: 'm1', phone: '5511999999999', text: { message: 'SAIR' } };
    expect(parseWhatsAppEvents('Z_API', settings, { ...base, fromMe: true })).toHaveLength(0);
    expect(parseWhatsAppEvents('Z_API', settings, { ...base, isGroup: true })).toHaveLength(0);
    expect(parseWhatsAppEvents('Z_API', settings, base)).toHaveLength(1);
  });
});

describe('Mapeamento confiável organização -> empresa do Esfera', () => {
  it('lê somente da configuração da instalação e valida cada entrada', () => {
    const links = {
      'org-a': { baseUrl: 'http://127.0.0.1:8080', companyId: 1, token: 'a'.repeat(32) },
      'org-b': { baseUrl: 'https://esfera.example', companyId: 2, token: 'b'.repeat(32) },
      'org-bad': { baseUrl: 'http://192.168.0.10:8080', companyId: 3, token: 'c'.repeat(32) },
      'org-cred': { baseUrl: 'https://user:pw@esfera.example', companyId: 4, token: 'd'.repeat(32) },
      'org-short': { baseUrl: 'http://127.0.0.1:8080', companyId: 5, token: 'short' },
    };
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', JSON.stringify(links));
    expect(resolveEsferaLink('org-a')).toEqual(links['org-a']);
    expect(resolveEsferaLink('org-b')).toEqual(links['org-b']);
    expect(resolveEsferaLink('org-bad')).toBeUndefined();
    expect(resolveEsferaLink('org-cred')).toBeUndefined();
    expect(resolveEsferaLink('org-short')).toBeUndefined();
    expect(resolveEsferaLink('org-unknown')).toBeUndefined();
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', '{not json');
    expect(resolveEsferaLink('org-a')).toBeUndefined();
    vi.stubEnv('ESFERA_OPTOUT_LINKS_JSON', '');
    expect(resolveEsferaLink('org-a')).toBeUndefined();
  });
  it('monta a entrega com a empresa do mapeamento e sem o token no corpo', () => {
    const body = buildOptOutDelivery(
      {
        eventKey: 'whatsapp:conn:evt',
        phone: '+5575988052539',
        classification: 'OPT_OUT',
        excerpt: 'SAIR',
        receivedAt: new Date('2026-10-27T12:00:00.000Z'),
        connectionId: 'conn',
      },
      { baseUrl: 'http://127.0.0.1:8080', companyId: 7, token: 't'.repeat(32) },
    );
    expect(body).toMatchObject({ eventId: 'whatsapp:conn:evt', companyId: 7, phone: '+5575988052539', source: 'vexor' });
    expect(JSON.stringify(body)).not.toContain('t'.repeat(32));
  });
});

describe('Decisão da outbox a partir da resposta do Esfera', () => {
  it('só considera entregue com ack explícito do mesmo evento', () => {
    expect(deliveryOutcome(200, { ack: true, eventId: 'k', status: 'recorded', suppressedContacts: 3 }, 'k')).toEqual({
      kind: 'delivered',
      ackStatus: 'recorded',
      suppressedContacts: 3,
    });
    expect(deliveryOutcome(200, { ack: true, eventId: 'k', status: 'duplicate' }, 'k')).toMatchObject({ kind: 'delivered', ackStatus: 'duplicate' });
    expect(deliveryOutcome(200, { ack: true, eventId: 'other', status: 'recorded' }, 'k')).toMatchObject({ kind: 'retry', errorCode: 'ESFERA_ACK_MISSING' });
    expect(deliveryOutcome(200, {}, 'k')).toMatchObject({ kind: 'retry' });
  });
  it('falha de forma permanente só em payload rejeitado e repete nos demais casos', () => {
    expect(deliveryOutcome(400, { error: 'invalid_payload' }, 'k')).toEqual({ kind: 'failed', errorCode: 'ESFERA_REJECTED_INVALID_PAYLOAD' });
    expect(deliveryOutcome(401, { error: 'unauthorized' }, 'k')).toEqual({ kind: 'retry', errorCode: 'ESFERA_UNAUTHORIZED' });
    expect(deliveryOutcome(403, { error: 'company_mismatch' }, 'k')).toEqual({ kind: 'retry', errorCode: 'ESFERA_COMPANY_MISMATCH' });
    expect(deliveryOutcome(500, {}, 'k')).toEqual({ kind: 'retry', errorCode: 'ESFERA_HTTP_500' });
    expect(deliveryOutcome(0, {}, 'k')).toEqual({ kind: 'retry', errorCode: 'ESFERA_HTTP_UNAVAILABLE' });
  });
  it('aplica backoff exponencial com teto', () => {
    expect(optOutBackoffMs(1)).toBe(2000);
    expect(optOutBackoffMs(2)).toBe(4000);
    expect(optOutBackoffMs(30)).toBe(OPT_OUT_MAX_BACKOFF_MS);
  });
});
