import { randomInt } from 'node:crypto';
import type { OnboardingPlan, PlanItem } from '@eimax/workflow-schema';

// Executor do provisionamento de TI. Cada tarefa verifica antes de criar: repetir uma
// solicitação (retry, lease vencido) nunca duplica conta, encaminhador ou ramal.

export type HttpResponse = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null; getSetCookie?(): string[] };
  text(): Promise<string>;
};
export type HttpFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; redirect?: 'manual' },
) => Promise<HttpResponse>;

export class ProvisioningError extends Error {
  constructor(
    readonly code: string,
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const defaultFetch: HttpFetch = (url, init) => fetch(url, init) as unknown as Promise<HttpResponse>;

// --- cPanel (UAPI por sessão: Basic Auth está desabilitado nestes servidores) ---

export type CpanelConfig = { host: string; user: string; pass: string };
export type CpanelClient = {
  listEmails(): Promise<string[]>;
  addEmail(local: string, domain: string, password: string): Promise<void>;
  listForwarders(): Promise<Array<{ dest: string; forward: string }>>;
  addForwarder(local: string, domain: string, to: string): Promise<void>;
};

export function cpanelClient(config: CpanelConfig, http: HttpFetch = defaultFetch): CpanelClient {
  let session: Promise<{ token: string; cookie: string }> | undefined;
  const login = async () => {
    const res = await http(`${config.host}/login/?login_only=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ user: config.user, pass: config.pass }).toString(),
      redirect: 'manual',
    });
    const text = await res.text();
    let body: { status?: number; security_token?: string };
    try {
      body = JSON.parse(text);
    } catch {
      // The hosting's anti-bot page answers instead of cPanel: the server IP must be allowed by the provider.
      throw new ProvisioningError(
        /one moment, please|<!doctype/i.test(text)
          ? 'CPANEL_BLOCKED_BY_HOSTING'
          : 'CPANEL_UNEXPECTED_RESPONSE',
        'a hospedagem respondeu com página de verificação; libere o IP deste servidor no provedor',
      );
    }
    if (body.status !== 1 || !body.security_token) throw new ProvisioningError('CPANEL_LOGIN_FAILED');
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const cookie = cookies
      .map((c) => c.split(';')[0])
      .filter((c) => c.startsWith('cpsession='))
      .join('; ');
    if (!cookie) throw new ProvisioningError('CPANEL_SESSION_COOKIE_MISSING');
    return { token: body.security_token, cookie };
  };
  const uapi = async <T>(fn: string, params: Record<string, string> = {}): Promise<T> => {
    session ??= login();
    const { token, cookie } = await session;
    const query = new URLSearchParams(params).toString();
    const res = await http(`${config.host}${token}/execute/${fn}${query ? `?${query}` : ''}`, {
      headers: { cookie },
      redirect: 'manual',
    });
    const text = await res.text();
    let body: { status?: number; errors?: string[] | null; data?: T };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProvisioningError('CPANEL_UNEXPECTED_RESPONSE', `${fn} HTTP ${res.status}`);
    }
    if (body.status !== 1)
      throw new ProvisioningError('CPANEL_ERROR', `${fn}: ${(body.errors ?? []).join(' ')}`);
    return body.data as T;
  };
  return {
    async listEmails() {
      const rows = await uapi<Array<{ email: string }>>('Email/list_pops');
      return rows.map((r) => r.email.toLowerCase());
    },
    async addEmail(local, domain, password) {
      await uapi('Email/add_pop', { email: local, domain, password, quota: '0' });
    },
    async listForwarders() {
      const rows = await uapi<Array<{ dest: string; forward: string }>>('Email/list_forwarders');
      return rows.map((r) => ({ dest: r.dest.toLowerCase(), forward: r.forward.toLowerCase() }));
    },
    async addForwarder(local, domain, to) {
      await uapi('Email/add_forwarder', { domain, email: local, fwdopt: 'fwd', fwdemail: to });
    },
  };
}

// --- Tarifando Suite ---

export type TarifandoConfig = { baseUrl: string; usuario: string; token: string };
export type TarifandoRamal = Record<string, unknown> & {
  ramal_id: string | number;
  nome: string;
  numero: string | number;
  tipo: string | number;
};
export type TarifandoClient = {
  listRamais(): Promise<TarifandoRamal[]>;
  insertRamal(dados: Record<string, unknown>): Promise<{ ramalId: string }>;
};

export function tarifandoClient(
  config: TarifandoConfig,
  http: HttpFetch = defaultFetch,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): TarifandoClient {
  const call = async (path: string, method = 'GET', body?: unknown) => {
    for (let attempt = 1; ; attempt++) {
      const res = await http(`${config.baseUrl}/${path}`, {
        method,
        headers: { usuario: config.usuario, token: config.token, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      if (res.status === 429 && attempt < 5) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 1500 * attempt);
        continue;
      }
      let json: Record<string, any> = {};
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProvisioningError('TARIFANDO_UNEXPECTED_RESPONSE', `${path} HTTP ${res.status}`);
      }
      if (!res.ok || (json.http_response_code && Number(json.http_response_code) !== 200)) {
        const message = Array.isArray(json)
          ? json.map((i: { mensagem?: string }) => i.mensagem).join(' ')
          : String(json.mensagem ?? `HTTP ${res.status}`);
        throw new ProvisioningError('TARIFANDO_ERROR', `${path}: ${message}`);
      }
      return json;
    }
  };
  return {
    async listRamais() {
      // listar_ramais ignora registro_inicial; a paginação real usa pos_registro_inicial.
      const all = new Map<string, TarifandoRamal>();
      for (let offset = 0; ; ) {
        const res = await call(`listar_ramais?pos_registro_inicial=${offset}`);
        const rows = (res.dados ?? []) as TarifandoRamal[];
        const fresh = rows.filter((r) => !all.has(String(r.ramal_id)));
        rows.forEach((r) => all.set(String(r.ramal_id), r));
        if (!rows.length || !fresh.length || all.size >= Number(res.qtd_total_resultados ?? 0)) break;
        offset += rows.length;
        await sleep(400);
      }
      return [...all.values()];
    },
    async insertRamal(dados) {
      const res = await call('inserir_ramal', 'POST', { dados });
      // The documented `ramal_id` is not always returned; the executor confirms by number when absent.
      const id = res.ramal_id ?? res.id ?? res.dados?.ramal_id;
      return { ramalId: id ? String(id) : '' };
    },
  };
}

// --- Executor ---

export type ProvisioningClients = {
  cpanel: (domain: string) => CpanelClient;
  tarifando: TarifandoClient;
};
export type TaskOutcome = {
  itemId: string;
  nome: string;
  task: 'email' | 'encaminhador' | 'ramal';
  status: 'criado' | 'existente' | 'falhou' | 'ignorado';
  detail: string;
};
export type ProvisioningRun = { outcomes: TaskOutcome[]; secrets: Record<string, string> };

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
export function generatePassword(length = 14, symbols = '') {
  const pools = [LOWER, UPPER, DIGITS, ...(symbols ? [symbols] : [])];
  const all = pools.join('');
  const chars = pools.map((p) => p[randomInt(p.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const normName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim();

/**
 * Senha de e-mail pelo padrão da empresa ou aleatória.
 * {Setor3} = prefixo do setor (regra do setor; senão as 3 primeiras letras). Ex.: Pes$2020$Realess.
 */
export function emailPassword(item: PlanItem, template?: string) {
  if (!template) return generatePassword(16, '$@#');
  const sector = normName(item.setor?.label ?? item.setorInformado).replace(/ /g, '');
  const setor3 = normName(item.setor?.senha ?? '') || sector.slice(0, 3);
  return template
    .replace('{Setor3}', setor3.charAt(0) + setor3.slice(1).toLowerCase())
    .replace('{SETOR3}', setor3);
}

async function step(
  outcomes: TaskOutcome[],
  base: Pick<TaskOutcome, 'itemId' | 'nome' | 'task'>,
  run: () => Promise<Pick<TaskOutcome, 'status' | 'detail'>>,
) {
  try {
    outcomes.push({ ...base, ...(await run()) });
  } catch (error) {
    outcomes.push({
      ...base,
      status: 'falhou',
      detail: error instanceof Error ? error.message.slice(0, 300) : 'Falha desconhecida',
    });
  }
}

export async function executeOnboardingPlan(
  plan: OnboardingPlan,
  clients: ProvisioningClients,
  options: { emailPasswordTemplate?: string } = {},
): Promise<ProvisioningRun> {
  const outcomes: TaskOutcome[] = [];
  const secrets: Record<string, string> = {};
  const emailCache = new Map<string, Promise<string[]>>();
  const emailsOf = (domain: string) => {
    if (!emailCache.has(domain)) emailCache.set(domain, clients.cpanel(domain).listEmails());
    return emailCache.get(domain)!;
  };
  let forwarders: Promise<Array<{ dest: string; forward: string }>> | undefined;
  let ramais: Promise<TarifandoRamal[]> | undefined;
  let nextNumber: number | undefined;

  for (const item of plan.items) {
    const base = { itemId: item.id, nome: item.nome };
    if (!item.setor || !item.email) {
      for (const task of ['email', 'encaminhador', 'ramal'] as const)
        outcomes.push({ ...base, task, status: 'ignorado', detail: 'Setor sem regra; responda a pergunta.' });
      continue;
    }
    const [local, domain] = item.email.split('@');
    await step(outcomes, { ...base, task: 'email' }, async () => {
      const existing = await emailsOf(domain);
      if (existing.includes(item.email)) return { status: 'existente', detail: item.email };
      const password = emailPassword(item, options.emailPasswordTemplate);
      await clients.cpanel(domain).addEmail(local, domain, password);
      existing.push(item.email);
      secrets[`email:${item.email}`] = password;
      return { status: 'criado', detail: item.email };
    });
    await step(outcomes, { ...base, task: 'encaminhador' }, async () => {
      if (!item.forward) return { status: 'ignorado', detail: 'Setor sem encaminhador geral.' };
      const forward = item.forward;
      const [fromLocal, fromDomain] = forward.from.split('@');
      forwarders ??= clients.cpanel(fromDomain).listForwarders();
      const list = await forwarders;
      if (list.some((f) => f.dest === forward.from && f.forward === forward.to))
        return { status: 'existente', detail: `${forward.from} → ${forward.to}` };
      await clients.cpanel(fromDomain).addForwarder(fromLocal, fromDomain, forward.to);
      list.push({ dest: forward.from, forward: forward.to });
      return { status: 'criado', detail: `${forward.from} → ${forward.to}` };
    });
    await step(outcomes, { ...base, task: 'ramal' }, async () => {
      ramais ??= clients.tarifando.listRamais();
      const list = await ramais;
      const target = normName(item.ramal.nome);
      const found = list.find((r) => normName(String(r.nome)) === target);
      if (found) return { status: 'existente', detail: `Ramal ${found.numero} (${found.nome})` };
      const sameType = list
        .filter((r) => Number(r.tipo) === item.ramal.tipo)
        .sort((a, b) => Number(b.numero) - Number(a.numero));
      const template = sameType[0];
      if (!template) throw new ProvisioningError('TARIFANDO_TEMPLATE_MISSING', `tipo ${item.ramal.tipo}`);
      nextNumber ??= Math.max(...list.map((r) => Number(r.numero)).filter(Number.isFinite)) + 1;
      const numero = nextNumber++;
      const prefix = String(template.usuario_autenticacao ?? 'realess-').split('-')[0];
      const senhaSip = generatePassword(14);
      const senhaWeb = generatePassword(14);
      const num = (key: string, fallback: number) =>
        Number.isFinite(Number(template[key])) && template[key] !== null ? Number(template[key]) : fallback;
      const { ramalId } = await clients.tarifando.insertRamal({
        tipo: item.ramal.tipo,
        nome: item.ramal.nome,
        numero,
        usuario_autenticacao: `${prefix}-${numero}`,
        senha_sip: senhaSip,
        senha_web: senhaWeb,
        plano_discagem_id: num('plano_discagem_id', 146),
        codigo_area: num('codigo_area', 47),
        escutar_chamadas: 1,
        gravar_chamadas: 1,
        bloquear_ramal: 0,
        habilitar_timers: num('habilitar_timers', 0),
        habilitar_blf: num('habilitar_blf', 0),
        puxar_chamadas: num('puxar_chamadas', 0),
        tempo_maximo_aciona_encaminhamento: num('tempo_maximo_aciona_encaminhamento', 30),
        habilitar_dupla_autenticacao: 0,
        habilitar_caixa_postal: 0,
      });
      let confirmedId = ramalId;
      if (!confirmedId) {
        const fresh = await clients.tarifando.listRamais();
        const created = fresh.find((r) => Number(r.numero) === numero && normName(String(r.nome)) === target);
        if (!created) throw new ProvisioningError('TARIFANDO_INSERT_UNCONFIRMED', `ramal ${numero}`);
        confirmedId = String(created.ramal_id);
      }
      list.push({ ramal_id: confirmedId, nome: item.ramal.nome, numero, tipo: item.ramal.tipo });
      secrets[`ramal:${numero}:sip`] = senhaSip;
      secrets[`ramal:${numero}:web`] = senhaWeb;
      const tipo = item.ramal.tipo === 2 ? 'PA' : 'PABX';
      return { status: 'criado', detail: `Ramal ${numero} ${tipo} (${prefix}-${numero})` };
    });
  }
  return { outcomes, secrets };
}

/** Clientes a partir do ambiente do servidor. Nunca recebe credenciais pelo fluxo ou pela UI. */
export function provisioningClientsFromEnv(env: Record<string, string | undefined>): ProvisioningClients {
  const need = (key: string) => {
    const value = env[key];
    if (!value) throw new ProvisioningError('CONFIGURATION_REQUIRED', key);
    return value;
  };
  const accounts: Record<string, CpanelConfig> = {
    'realess.adv.br': {
      host: need('TI_CPANEL_ADV_HOST'),
      user: need('TI_CPANEL_ADV_USER'),
      pass: need('TI_CPANEL_ADV_PASS'),
    },
    'realess.com.br': {
      host: need('TI_CPANEL_COM_HOST'),
      user: need('TI_CPANEL_COM_USER'),
      pass: need('TI_CPANEL_COM_PASS'),
    },
  };
  const cache = new Map<string, CpanelClient>();
  return {
    cpanel: (domain) => {
      const account = accounts[domain];
      if (!account) throw new ProvisioningError('CPANEL_DOMAIN_UNKNOWN', domain);
      if (!cache.has(domain)) cache.set(domain, cpanelClient(account));
      return cache.get(domain)!;
    },
    tarifando: tarifandoClient({
      baseUrl: env.TI_TARIFANDO_BASE_URL ?? 'https://suite.tarifando.com.br/suite/api',
      usuario: need('TI_TARIFANDO_USUARIO'),
      token: need('TI_TARIFANDO_TOKEN'),
    }),
  };
}
