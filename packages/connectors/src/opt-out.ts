import { z } from 'zod';

// Opt-out ("SAIR") detection for inbound WhatsApp messages. Only individual, non-own messages
// reach this classifier: the event parsers already drop groups and messages sent by the account.
// The classifier never reads conversation history; it decides on the single message text.

/** Neutral notice to append to outbound messages. Never ties SAIR to debt acknowledgement or waivers. */
export const OPT_OUT_NOTICE = 'Para deixar de receber mensagens por este canal, responda SAIR.';

export type OptOutClassification = 'OPT_OUT' | 'AMBIGUOUS' | 'NONE';

/** Exact short requests. Accents, case, punctuation and emoji are ignored (see normalizeOptOutText). */
export const OPT_OUT_EXACT_PHRASES = [
  'sair',
  'parar',
  'pare',
  'stop',
  'cancelar',
  'cancela',
  'descadastrar',
  'descadastra',
  'remover',
  'remove',
  'excluir',
  'exclui',
  'nao quero mais receber',
  'nao quero receber',
  'nao quero receber mensagens',
  'nao quero mais receber mensagens',
  'nao quero mais mensagens',
  'nao quero mais',
  'nao quero',
  'remover meu numero',
  'remova meu numero',
  'remova meu contato',
  'remover numero',
  'retirar meu numero',
  'retire meu numero',
  'excluir meu numero',
  'exclua meu numero',
  'descadastre meu numero',
  'quero sair',
  'quero parar',
  'pode parar',
  'pare de enviar',
  'pare de mandar',
  'parar de enviar',
  'parar de mandar',
  'nao envie mais',
  'nao mande mais',
  'nao me envie mais mensagens',
  'nao me mande mais mensagens',
  'cancelar mensagens',
  'cancelar envio',
  'quero cancelar',
  'quero me descadastrar',
  'me descadastrar',
  'me descadastre',
  'me tira dessa lista',
  'me tire dessa lista',
  'me tira da lista',
  'me tire da lista',
  'tira meu numero',
  'tire meu numero',
  'nao tenho interesse',
  'sem interesse',
  'sair por favor',
  'por favor sair',
  'quero sair da lista',
  'sair da lista',
  'me remove',
  'me remova',
  'me exclua',
  'nao quero mais receber essas mensagens',
  'pare de me mandar mensagem',
  'pare de me mandar mensagens',
  'parem de mandar',
  'nao me mande mais',
] as const;
const EXACT_PHRASES = new Set<string>(OPT_OUT_EXACT_PHRASES);

// A conservative allowlist of isolated SAIR typos, not fuzzy matching of arbitrary words.
// "sar" is explicitly accepted; air, sairia, sais, sari, para and other real words are not.
export const OPT_OUT_SAIR_TYPOS = ['sai', 'sar', 'siar'] as const;
export const OPT_OUT_TYPO_RULE =
  'Somente palavra isolada: sair, sai, sar ou siar; repetições consecutivas de letras são reduzidas antes da comparação. Não se aplica a frases, pare, para, parar ou stop.';
export const OPT_OUT_CONFIRMATION_TEXT =
  'Pronto, seu número foi retirado das nossas mensagens automáticas. Você não receberá mais avisos por este canal, conforme o seu direito de oposição previsto na LGPD (Lei 13.709/2018, art. 18) e as regras de cobrança do Código de Defesa do Consumidor.\nEste pedido não altera e não reconhece nenhum débito.';

/** Esfera-compatible Brazilian key; DDD 55 is preserved unless length proves a DDI. */
export function optOutPhoneKey(raw: string) {
  let digits = raw.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') digits = digits.slice(0, 2) + digits.slice(3);
  return digits;
}
export function optOutConfirmationPolicy(phone: string) {
  if (process.env.OPT_OUT_CONFIRMATION_ENABLED === 'false') return 'DISABLED';
  const raw = (process.env.OPT_OUT_CONFIRMATION_ALLOWLIST ?? '').trim();
  if (!raw) return 'ALLOWED';
  const allowed = raw.split(',').map(optOutPhoneKey).filter(Boolean);
  const key = optOutPhoneKey(phone);
  return allowed.includes(key) ? 'ALLOWED' : 'HELD';
}

/**
 * Word-start fragments that signal an opt-out intent inside a longer sentence; those go to human
 * review instead of automatic opt-out. A trailing space requires the whole word ("pare", not "parece").
 */
const INTENT_FRAGMENTS = [
  'sair ',
  'parar ',
  'pare ',
  'parem ',
  'stop ',
  'cancel',
  'descadastr',
  'nao quero',
  'nao mande',
  'nao mandem',
  'nao envie',
  'nao enviem',
  'me tir',
  'remov',
  'exclu',
  'retir',
  'bloque',
  'denunci',
  'nao me lig',
  'nao me procur',
  'nao entre em contato',
  'nao entrem em contato',
];

export function normalizeOptOutText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * OPT_OUT: an unambiguous short request (at most 8 words, in the known phrase list).
 * AMBIGUOUS: a message of up to 40 words that carries an opt-out fragment but is not a known phrase,
 *            or that mixes an opt-out phrase with negotiation terms. It must be reviewed by a person.
 * NONE: everything else (empty text, long messages, unrelated replies).
 */
export function classifyOptOut(text: string | undefined | null): OptOutClassification {
  if (typeof text !== 'string') return 'NONE';
  const normalized = normalizeOptOutText(text);
  if (!normalized) return 'NONE';
  const words = normalized.split(' ');
  if (words.length === 1) {
    const reduced = normalized.replace(/(.)\1+/g, '$1');
    if (reduced === 'sair' || (OPT_OUT_SAIR_TYPOS as readonly string[]).includes(reduced)) return 'OPT_OUT';
  }
  if (words.length <= 8 && EXACT_PHRASES.has(normalized)) return 'OPT_OUT';
  if (words.length > 40) return 'NONE';
  if (normalized === 'chega') return 'AMBIGUOUS';
  // False positives cost one human look; false negatives cost an unwanted message.
  const padded = ` ${normalized} `;
  return INTENT_FRAGMENTS.some((fragment) => padded.includes(` ${fragment}`)) ? 'AMBIGUOUS' : 'NONE';
}

/** E.164 without spaces: `+` followed by 8-15 digits. Brazilian numbers without DDI get +55. */
export function toE164(raw: string | undefined | null, defaultCountryCode = '55'): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return undefined;
  const candidate = digits.length === 10 || digits.length === 11 ? `${defaultCountryCode}${digits}` : digits;
  if (!/^[1-9]\d{7,14}$/.test(candidate)) return undefined;
  return `+${candidate}`;
}

/** Stable identifier for an inbound opt-out: one per provider event, never per attempt. */
export function optOutEventKey(connectionId: string, providerEventId: string) {
  return `whatsapp:${connectionId}:${providerEventId}`;
}

/** Short excerpt kept for audit; the full conversation is never copied. */
export function optOutExcerpt(text: string | undefined | null, max = 80) {
  const single = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

export const esferaLinkSchema = z
  .object({
    baseUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash) return false;
        if (url.protocol === 'https:') return true;
        return (
          url.protocol === 'http:' &&
          (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')
        );
      }, 'Use https:// ou http://127.0.0.1 sem credenciais, query ou fragmento.'),
    companyId: z.number().int().positive(),
    token: z.string().min(16).max(500),
  })
  .strict();
export type EsferaLink = z.infer<typeof esferaLinkSchema>;

/**
 * Organization -> Esfera company mapping from installation configuration (never from a request).
 * ESFERA_OPTOUT_LINKS_JSON = {"<organizationId>": {"baseUrl": "http://127.0.0.1:8080", "companyId": 1, "token": "..."}}
 */
export function resolveEsferaLink(
  organizationId: string,
  raw = process.env.ESFERA_OPTOUT_LINKS_JSON,
): EsferaLink | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const entry = (parsed as Record<string, unknown>)[organizationId];
  const result = esferaLinkSchema.safeParse(entry);
  return result.success ? result.data : undefined;
}
