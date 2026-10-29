// Provisionamento de TI (admissão): leitura do e-mail do DP e regras por setor.
// Funções puras: nenhuma rede, nenhum segredo. A execução real fica no worker.

export type Colaborador = {
  nome: string;
  horario: string;
  cpf: string;
  cargo: string;
  setor: string;
  sistema?: string;
  loginSistema?: string;
};

/** Tipo de ramal no Tarifando: 1 = PABX, 2 = Posição de atendimento (PA). */
export type RamalTipo = 1 | 2;

export type SectorRule = {
  key: string;
  label: string;
  domain: 'realess.adv.br' | 'realess.com.br';
  /** Comercial Externo não recebe o encaminhador geral. */
  forward: boolean;
  ramalTipo: RamalTipo;
  lemit: boolean;
  manual: string[];
  /** Outras grafias do setor no e-mail do DP (já sem acento, espaço e pontuação). */
  aliases?: string[];
  /** Prefixo do setor na senha padrão (ex.: Pes, Com, Fin). */
  senha?: string;
};

export const FORWARD_FROM = 'realess@realess.com.br';

const base = ['Criar usuário no AD', 'Criar assinatura (Canva)', 'Ajustar o computador'];
// Regra da empresa: operação usa realess.adv.br; setores administrativos usam realess.com.br.
const administrativo = (key: string, label: string, senha: string, aliases: string[] = []): SectorRule => ({
  key,
  label,
  domain: 'realess.com.br',
  forward: true,
  ramalTipo: 1,
  lemit: false,
  manual: [...base, 'Configurar MicroSIP com o ramal'],
  aliases,
  senha,
});
export const sectorRules: SectorRule[] = [
  administrativo('financeiro', 'Financeiro', 'Fin'),
  administrativo('administrativo', 'Administrativo', 'Adm', ['adm', 'administracao']),
  administrativo('ti', 'TI', 'Ti', ['tecnologia', 'tecnologiadainformacao', 'informatica']),
  administrativo('supervisao', 'Supervisão', 'Sup', ['supervisor', 'supervisora', 'supervisores']),
  administrativo('compras', 'Compras', 'Com'),
  administrativo('rh', 'RH', 'Rh', ['recursoshumanos', 'dp', 'departamentopessoal']),
  {
    // P.A Fixa é sempre posição de atendimento no discador.
    key: 'pafixa',
    label: 'P.A Fixa',
    domain: 'realess.adv.br',
    forward: true,
    ramalTipo: 2,
    lemit: false,
    manual: [...base, 'Configurar MicroSIP com o ramal', 'Vincular operador e campanha no Tarifando'],
    senha: 'Ope',
  },
  {
    key: 'pesquisa',
    label: 'Pesquisa',
    domain: 'realess.adv.br',
    forward: true,
    ramalTipo: 1,
    lemit: true,
    manual: [...base, 'Configurar MicroSIP com o ramal'],
    senha: 'Pes',
  },
  {
    key: 'comercialinterno',
    label: 'Comercial Interno',
    domain: 'realess.adv.br',
    forward: true,
    ramalTipo: 1,
    lemit: true,
    manual: [...base, 'Configurar MicroSIP com o ramal', 'Baixar Konfiansa'],
    senha: 'Com',
  },
  {
    key: 'atendimentoaocliente',
    label: 'Atendimento ao Cliente (Comercial Interno)',
    domain: 'realess.adv.br',
    forward: true,
    ramalTipo: 1,
    lemit: true,
    manual: [...base, 'Configurar MicroSIP com o ramal', 'Baixar Konfiansa'],
    senha: 'Com',
  },
  {
    key: 'comercialexterno',
    label: 'Comercial Externo',
    domain: 'realess.adv.br',
    forward: false,
    ramalTipo: 1,
    lemit: true,
    manual: ['Criar assinatura (Canva)', 'Configurar a máquina via AnyDesk'],
    senha: 'Com',
  },
  {
    key: 'operacao',
    label: 'Operação',
    domain: 'realess.adv.br',
    forward: true,
    ramalTipo: 1,
    lemit: true,
    manual: [...base, 'Configurar MicroSIP com o ramal', 'Baixar Konfiansa'],
    senha: 'Ope',
  },
];

export type PlanItem = {
  id: string;
  nome: string;
  cargo: string;
  setorInformado: string;
  horario: string;
  /** Apenas os 4 últimos dígitos; o CPF completo fica no e-mail de origem. */
  cpfFinal: string;
  sistema?: string;
  loginSistema?: string;
  setor: SectorRule | null;
  email: string;
  forward: { from: string; to: string } | null;
  ramal: { tipo: RamalTipo; nome: string };
  manual: string[];
};

export type PlanQuestion = {
  id: string;
  itemId: string;
  prompt: string;
  options: Array<{ value: string; label: string }>;
};

export type OnboardingPlan = {
  version: 1;
  kind: 'admissao';
  items: PlanItem[];
  questions: PlanQuestion[];
  warnings: string[];
};

const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const compact = (value: string) =>
  plain(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const titleCase = (value: string) =>
  plain(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

export function findSector(setor: string): SectorRule | null {
  const key = compact(setor);
  if (!key) return null;
  return sectorRules.find((rule) => rule.key === key || rule.aliases?.includes(key)) ?? null;
}

/** Login de e-mail: primeiro e último nome (ex.: Maria Eduarda Nunes Batista → maria.batista). */
export function emailLocalPart(nome: string) {
  const words = plain(nome)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`;
}

/** Nome do ramal: primeiro e último nome em maiúsculas. */
export function ramalName(nome: string) {
  return emailLocalPart(nome).replace('.', ' ').toUpperCase();
}

const FIELD = /^\s*(colaborador|hor[aá]rio|cpf|cargo|setor|login\s+([a-z0-9 ]+)|senha)\s*:\s*(.*)$/i;

/** Lê os blocos "Colaborador: ..." do e-mail do DP. Senhas de sistemas não são guardadas. */
export function parseAdmissionEmail(text: string): Colaborador[] {
  const people: Colaborador[] = [];
  let current: Colaborador | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const match = FIELD.exec(raw.replace(/\*/g, ''));
    if (!match) continue;
    const label = plain(match[1]).toLowerCase();
    const value = match[3].trim().replace(/\.$/, '');
    if (label === 'colaborador') {
      current = { nome: value, horario: '', cpf: '', cargo: '', setor: '' };
      people.push(current);
    } else if (!current) continue;
    else if (label === 'horario') current.horario = value;
    else if (label === 'cpf') current.cpf = value.replace(/\D/g, '');
    else if (label === 'cargo') current.cargo = value;
    else if (label === 'setor') current.setor = value;
    else if (label.startsWith('login')) {
      current.sistema = match[2].trim().toUpperCase();
      current.loginSistema = value;
    }
  }
  return people.filter((p) => p.nome);
}

function planItem(person: Colaborador, index: number, setor: SectorRule | null): PlanItem {
  const local = emailLocalPart(person.nome);
  const email = setor ? `${local}@${setor.domain}` : '';
  return {
    id: `c${index + 1}`,
    nome: titleCase(person.nome),
    cargo: person.cargo,
    setorInformado: person.setor,
    horario: person.horario,
    cpfFinal: person.cpf.slice(-4),
    ...(person.sistema ? { sistema: person.sistema, loginSistema: person.loginSistema } : {}),
    setor,
    email,
    forward: setor?.forward && email ? { from: FORWARD_FROM, to: email } : null,
    ramal: { tipo: setor?.ramalTipo ?? 1, nome: ramalName(person.nome) },
    manual: setor ? [...setor.manual, ...(setor.lemit ? ['Criar usuário no Lemit'] : [])] : [],
  };
}

export function buildOnboardingPlan(people: Colaborador[]): OnboardingPlan {
  const warnings: string[] = [];
  const questions: PlanQuestion[] = [];
  const items = people.map((person, index) => {
    const setor = findSector(person.setor);
    const item = planItem(person, index, setor);
    if (!setor)
      questions.push({
        id: `setor:${item.id}`,
        itemId: item.id,
        prompt: `O setor "${person.setor || 'não informado'}" de ${item.nome} não tem regra. Qual regra aplicar?`,
        options: sectorRules.map((rule) => ({ value: rule.key, label: rule.label })),
      });
    if (person.cpf.length !== 11) warnings.push(`${item.nome}: CPF ausente ou incompleto.`);
    if (!emailLocalPart(person.nome)) warnings.push(`Colaborador ${index + 1}: nome inválido.`);
    return item;
  });
  const seen = new Set<string>();
  for (const item of items) {
    if (item.email && seen.has(item.email))
      warnings.push(`${item.nome}: e-mail ${item.email} repetido nesta admissão.`);
    seen.add(item.email);
  }
  return { version: 1, kind: 'admissao', items, questions, warnings };
}

/** Aplica as respostas do aprovador (ex.: setor escolhido) e devolve as perguntas restantes. */
export function applyPlanAnswers(plan: OnboardingPlan, answers: Record<string, string>): OnboardingPlan {
  const items = plan.items.map((item) => {
    const answer = answers[`setor:${item.id}`];
    const rule = answer ? sectorRules.find((r) => r.key === answer) : undefined;
    if (!rule) return item;
    const local = emailLocalPart(item.nome);
    const email = `${local}@${rule.domain}`;
    return {
      ...item,
      setor: rule,
      email,
      forward: rule.forward ? { from: FORWARD_FROM, to: email } : null,
      ramal: { ...item.ramal, tipo: rule.ramalTipo },
      manual: [...rule.manual, ...(rule.lemit ? ['Criar usuário no Lemit'] : [])],
    };
  });
  const questions = plan.questions.filter(
    (q) => !(answers[q.id] && q.options.some((o) => o.value === answers[q.id])),
  );
  return { ...plan, items, questions };
}
