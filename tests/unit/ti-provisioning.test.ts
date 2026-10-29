import { describe, expect, it } from 'vitest';
import {
  applyPlanAnswers,
  buildOnboardingPlan,
  createTiOnboardingTemplate,
  findSector,
  parseAdmissionEmail,
  sampleLead,
  validateWorkflow,
} from '@eimax/workflow-schema';
import { simulateWorkflow } from '@eimax/workflow-engine';
import {
  cpanelClient,
  emailPassword,
  executeOnboardingPlan,
  tarifandoClient,
  type CpanelClient,
  type HttpFetch,
  type ProvisioningClients,
  type TarifandoRamal,
} from '@eimax/connectors';

const EMAIL = `Bom dia,

Segue informação das novas contratações.

Colaborador: LUANA CORREIA
Horário: 08h às 18h Sex 17h
CPF: 137.640.499-01
Cargo: Consultor Comercial pleno.
Setor: Atendimento ao Cliente
Login KONFIANSA: LUANA.CORREIA
Senha: 123

Colaborador: MARIA EDUARDA NUNES BATISTA
Horário: 08h às 14h
CPF: 151.323.049-23
Cargo: Estágio
Setor: Financeiro
Login KONFIANSA: MARIA.BATISTA
Senha: 123

Colaborador: LEILA STIIPP
Horário: 08h às 14h
CPF: 152.397.699-31
Cargo: Estágio
Setor: P.A Fixa
Login CUBO: LEILA.STIIPP

Colaborador: FULANO DE TAL
Setor: Marketing
`;

function fakeCpanel(emails: string[], forwarders: Array<{ dest: string; forward: string }>) {
  const calls: string[] = [];
  const client: CpanelClient = {
    listEmails: async () => emails,
    addEmail: async (local, domain) => {
      calls.push(`add_pop ${local}@${domain}`);
    },
    listForwarders: async () => forwarders,
    addForwarder: async (local, domain, to) => {
      calls.push(`add_forwarder ${local}@${domain} -> ${to}`);
    },
  };
  return { client, calls };
}

describe('provisionamento de TI', () => {
  it('lê o e-mail do DP sem guardar senhas de sistemas', () => {
    const people = parseAdmissionEmail(EMAIL);
    expect(people.map((p) => p.nome)).toEqual([
      'LUANA CORREIA',
      'MARIA EDUARDA NUNES BATISTA',
      'LEILA STIIPP',
      'FULANO DE TAL',
    ]);
    expect(people[0]).toMatchObject({
      cpf: '13764049901',
      sistema: 'KONFIANSA',
      setor: 'Atendimento ao Cliente',
    });
    expect(people[2]).toMatchObject({ sistema: 'CUBO', loginSistema: 'LEILA.STIIPP' });
    expect(JSON.stringify(people)).not.toContain('"123"');
  });

  it('aplica domínio, encaminhador e tipo de ramal por setor', () => {
    const plan = buildOnboardingPlan(parseAdmissionEmail(EMAIL));
    const [luana, maria, leila, fulano] = plan.items;
    expect(luana).toMatchObject({
      email: 'luana.correia@realess.adv.br',
      ramal: { tipo: 1, nome: 'LUANA CORREIA' },
    });
    expect(maria).toMatchObject({ email: 'maria.batista@realess.com.br', ramal: { tipo: 1 } });
    // P.A Fixa é sempre posição de atendimento.
    expect(leila).toMatchObject({ email: 'leila.stiipp@realess.adv.br', ramal: { tipo: 2 } });
    expect(leila.forward).toEqual({ from: 'realess@realess.com.br', to: 'leila.stiipp@realess.adv.br' });
    expect(luana.cpfFinal).toBe('9901');
    expect(JSON.stringify(plan)).not.toContain('13764049901');
    expect(fulano.setor).toBeNull();
    expect(plan.questions).toHaveLength(1);
    expect(plan.warnings.some((w) => w.includes('Fulano De Tal'))).toBe(true);
  });

  it('setores administrativos usam .com.br e operação usa .adv.br', () => {
    for (const setor of ['ADM', 'TI', 'Supervisor', 'Compras', 'RH', 'Recursos Humanos', 'Financeiro'])
      expect(findSector(setor)?.domain).toBe('realess.com.br');
    for (const setor of ['Operação', 'P.A Fixa', 'Pesquisa', 'Comercial Externo'])
      expect(findSector(setor)?.domain).toBe('realess.adv.br');
    expect(findSector('')).toBeNull();
  });

  it('senha padrão de e-mail usa o prefixo do setor', () => {
    const plan = buildOnboardingPlan(parseAdmissionEmail(EMAIL));
    const template = '{Setor3}$2020$Realess';
    expect(plan.items.slice(0, 3).map((item) => emailPassword(item, template))).toEqual([
      'Com$2020$Realess',
      'Fin$2020$Realess',
      'Ope$2020$Realess',
    ]);
    expect(emailPassword(plan.items[0])).not.toContain('Realess');
  });

  it('a resposta do aprovador resolve o setor sem regra', () => {
    const plan = buildOnboardingPlan(parseAdmissionEmail(EMAIL));
    const answered = applyPlanAnswers(plan, { [plan.questions[0].id]: 'comercialexterno' });
    expect(answered.questions).toHaveLength(0);
    expect(answered.items[3]).toMatchObject({ email: 'fulano.tal@realess.adv.br', forward: null });
    expect(applyPlanAnswers(plan, { [plan.questions[0].id]: 'inexistente' }).questions).toHaveLength(1);
  });

  it('o modelo do fluxo é válido e a simulação não cria nada', async () => {
    const flow = createTiOnboardingTemplate();
    expect(validateWorkflow(flow)).toEqual([]);
    const steps = await simulateWorkflow(flow, { ...sampleLead, message: EMAIL });
    const plan = steps.find((s) => s.type === 'ti.onboarding.plan');
    expect(plan).toMatchObject({
      status: 'success',
      output: { simulated: true, colaboradores: 4, perguntas: 1 },
    });
  });

  it('executa de forma idempotente: existentes não são recriados', async () => {
    const plan = applyPlanAnswers(buildOnboardingPlan(parseAdmissionEmail(EMAIL)), {
      'setor:c4': 'comercialexterno',
    });
    const adv = fakeCpanel(['luana.correia@realess.adv.br'], []);
    const com = fakeCpanel(
      ['maria.batista@realess.com.br'],
      [{ dest: 'realess@realess.com.br', forward: 'luana.correia@realess.adv.br' }],
    );
    const ramais: TarifandoRamal[] = [
      {
        ramal_id: '1',
        nome: 'Luana.Correia',
        numero: '1990',
        tipo: '1',
        usuario_autenticacao: 'realess-1990',
        plano_discagem_id: '146',
        codigo_area: '10',
      },
      {
        ramal_id: '2',
        nome: 'Julia Krapp',
        numero: '1991',
        tipo: '2',
        usuario_autenticacao: 'realess-1991',
        plano_discagem_id: '146',
        codigo_area: '10',
      },
    ];
    const inserted: Array<Record<string, unknown>> = [];
    const clients: ProvisioningClients = {
      cpanel: (domain) => (domain === 'realess.adv.br' ? adv.client : com.client),
      tarifando: {
        listRamais: async () => ramais,
        insertRamal: async (dados) => {
          inserted.push(dados);
          return { ramalId: String(100 + inserted.length) };
        },
      },
    };
    const run = await executeOnboardingPlan(plan, clients);
    const status = (nome: string, task: string) =>
      run.outcomes.find((o) => o.nome === nome && o.task === task)?.status;
    expect(status('Luana Correia', 'email')).toBe('existente');
    expect(status('Luana Correia', 'encaminhador')).toBe('existente');
    expect(status('Luana Correia', 'ramal')).toBe('existente');
    expect(status('Leila Stiipp', 'email')).toBe('criado');
    expect(status('Fulano De Tal', 'encaminhador')).toBe('ignorado');
    expect(adv.calls).toEqual(['add_pop leila.stiipp@realess.adv.br', 'add_pop fulano.tal@realess.adv.br']);
    expect(com.calls).toEqual([
      'add_forwarder realess@realess.com.br -> maria.batista@realess.com.br',
      'add_forwarder realess@realess.com.br -> leila.stiipp@realess.adv.br',
    ]);
    // Numeração sequencial a partir do maior ramal; P.A Fixa como PA (tipo 2).
    expect(inserted.map((d) => [d.nome, d.numero, d.tipo, d.usuario_autenticacao])).toEqual([
      ['MARIA BATISTA', 1992, 1, 'realess-1992'],
      ['LEILA STIIPP', 1993, 2, 'realess-1993'],
      ['FULANO TAL', 1994, 1, 'realess-1994'],
    ]);
    expect(Object.keys(run.secrets)).toContain('ramal:1993:sip');
    expect(Object.keys(run.secrets)).toContain('email:leila.stiipp@realess.adv.br');
  });

  it('uma falha não interrompe as demais tarefas', async () => {
    const plan = buildOnboardingPlan(parseAdmissionEmail(EMAIL.split('Colaborador: LEILA')[0]));
    const ok = fakeCpanel([], []);
    const run = await executeOnboardingPlan(plan, {
      cpanel: () => ok.client,
      tarifando: {
        listRamais: async () => {
          throw new Error('TARIFANDO_ERROR: fora do ar');
        },
        insertRamal: async () => ({ ramalId: '1' }),
      },
    });
    expect(run.outcomes.filter((o) => o.task === 'ramal').every((o) => o.status === 'falhou')).toBe(true);
    expect(run.outcomes.filter((o) => o.task === 'email').every((o) => o.status === 'criado')).toBe(true);
  });

  it('Tarifando: pagina por pos_registro_inicial e respeita 429', async () => {
    const urls: string[] = [];
    let first = true;
    const http: HttpFetch = async (url) => {
      urls.push(url);
      if (first) {
        first = false;
        return { status: 429, ok: false, headers: { get: () => '0' }, text: async () => '{}' };
      }
      const offset = Number(new URL(url).searchParams.get('pos_registro_inicial'));
      const dados =
        offset === 0
          ? [
              { ramal_id: 1, numero: 1900 },
              { ramal_id: 2, numero: 1901 },
            ]
          : [{ ramal_id: 3, numero: 1902 }];
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ http_response_code: 200, qtd_total_resultados: 3, dados }),
      };
    };
    const client = tarifandoClient({ baseUrl: 'https://t', usuario: 'u', token: 't' }, http, async () => {});
    expect((await client.listRamais()).map((r) => r.numero)).toEqual([1900, 1901, 1902]);
    expect(urls).toEqual([
      'https://t/listar_ramais?pos_registro_inicial=0',
      'https://t/listar_ramais?pos_registro_inicial=0',
      'https://t/listar_ramais?pos_registro_inicial=2',
    ]);
  });

  it('Tarifando sem ramal_id na resposta: confirma o ramal criado pelo número', async () => {
    const plan = buildOnboardingPlan(parseAdmissionEmail(EMAIL.split('Colaborador: MARIA')[0]));
    const ramais: TarifandoRamal[] = [
      {
        ramal_id: '1',
        nome: 'Outra Pessoa',
        numero: '1991',
        tipo: '1',
        usuario_autenticacao: 'realess-1991',
      },
    ];
    const clients: ProvisioningClients = {
      cpanel: () => fakeCpanel(['luana.correia@realess.adv.br'], []).client,
      tarifando: {
        listRamais: async () => [...ramais],
        insertRamal: async (dados) => {
          ramais.push({
            ramal_id: '5081',
            nome: String(dados.nome),
            numero: String(dados.numero),
            tipo: '1',
          });
          return { ramalId: '' };
        },
      },
    };
    const run = await executeOnboardingPlan(plan, clients);
    expect(run.outcomes.find((o) => o.task === 'ramal')).toMatchObject({
      status: 'criado',
      detail: 'Ramal 1992 PABX (realess-1992)',
    });
    // Reexecutar não duplica: o ramal agora existe pelo nome.
    const again = await executeOnboardingPlan(plan, clients);
    expect(again.outcomes.find((o) => o.task === 'ramal')?.status).toBe('existente');
    expect(ramais).toHaveLength(2);
  });

  it('cPanel bloqueado pelo anti-bot da hospedagem gera erro claro', async () => {
    const http: HttpFetch = async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '<!DOCTYPE html><title>One moment, please...</title>',
    });
    const client = cpanelClient({ host: 'https://cp', user: 'u', pass: 'p' }, http);
    await expect(client.listEmails()).rejects.toThrow('CPANEL_BLOCKED_BY_HOSTING');
  });
});
