import { describe, expect, it, vi } from 'vitest';
import {
  blockTypes,
  catalog,
  configSchemas,
  createSdrTemplate,
  sampleLead,
  validateWorkflow,
  workflowSchema,
  type BlockType,
  type WorkflowNode,
} from '@eimax/workflow-schema';
import {
  createProductionEffects,
  evaluateCondition,
  executeWorkflow,
  interpretWorkflow,
  simulateAction,
  simulateWorkflow,
} from '@eimax/workflow-engine';

describe('Contratos dos blocos do catálogo', () => {
  it.each(blockTypes)('%s valida configuração e produz saída de simulação', (type: BlockType) => {
    const config =
      type === 'webhook.received'
        ? { credentialRef: 'webhook-vendas' }
        : type === 'whatsapp.template.send'
          ? { connectionId: 'connection-fixture', template: 'approved_fixture', language: 'pt_BR' }
          : type.startsWith('whatsapp.') && type !== 'whatsapp.sdr.notify'
            ? { ...catalog[type].defaults, connectionId: 'connection-fixture' }
            : catalog[type].defaults;
    const node: WorkflowNode = {
      id: 'node',
      type,
      name: catalog[type].name,
      description: '',
      position: { x: 0, y: 0 },
      config,
    };
    expect(configSchemas[type].safeParse(config).success).toBe(true);
    expect(simulateAction(node, sampleLead).output).toBeDefined();
    expect(configSchemas[type].safeParse({}).success).toBe(false);
  });
  it('permite rascunho incompleto, mas rejeita sua publicação semântica', () => {
    const flow = createSdrTemplate();
    flow.nodes[1].config = {};
    expect(workflowSchema.safeParse(flow).success).toBe(true);
    expect(validateWorkflow(flow).some((i) => i.nodeId === 'qualify')).toBe(true);
  });
  it('rejeita código arbitrário como condição e campos desconhecidos', () => {
    expect(
      configSchemas.condition.safeParse({ field: '__proto__', operator: 'eval', value: 'process.exit()' })
        .success,
    ).toBe(false);
    expect(
      configSchemas.condition.safeParse({ field: 'company', operator: 'gte', value: 1000 }).success,
    ).toBe(false);
    expect(
      configSchemas.condition.safeParse({ field: 'budget', operator: 'gte', value: 'não é número' }).success,
    ).toBe(false);
  });
});
describe('Grafo e interpretação compartilhada', () => {
  it('template SDR tem um grafo válido', () => expect(validateWorkflow(createSdrTemplate())).toEqual([]));
  it('detecta ciclos, duplicidade, ramificação incompleta e nós desconectados', () => {
    const flow = createSdrTemplate();
    flow.edges.push({ id: 'loop', source: 'notify', target: 'assign' });
    expect(validateWorkflow(flow).some((i) => i.message.includes('ciclo'))).toBe(true);
    flow.edges = flow.edges.filter((e) => e.branch !== 'false');
    expect(validateWorkflow(flow).some((i) => i.message.includes('Sim e Não'))).toBe(true);
    expect(validateWorkflow(flow).some((i) => i.message.includes('todos os blocos'))).toBe(true);
    flow.nodes.push(flow.nodes[0]);
    expect(validateWorkflow(flow).some((i) => i.message.includes('duplicados'))).toBe(true);
  });
  it.each([
    ['gte', 1000, true],
    ['gt', 5000, false],
    ['lte', 5000, true],
    ['lt', 5000, false],
    ['eq', '5000', true],
  ])('comparação %s é determinística', (operator, value, expected) => {
    expect(evaluateCondition({ field: 'budget', operator, value }, sampleLead)).toBe(expected);
  });
  it('compara textos sem diferenciar maiúsculas', () =>
    expect(evaluateCondition({ field: 'company', operator: 'contains', value: 'STUDIO' }, sampleLead)).toBe(
      true,
    ));
  it('executa somente o ramo verdadeiro com um adapter injetado', async () => {
    const execute = vi.fn(async (node: WorkflowNode) => ({
      output: { adapter: 'test', type: node.type },
      message: 'Efeito de teste.',
    }));
    const steps = await interpretWorkflow(createSdrTemplate(), sampleLead, { execute });
    expect(execute.mock.calls.map((c) => c[0].id)).toEqual(['assign', 'tag', 'notify']);
    expect(steps.find((s) => s.nodeId === 'nurture')?.status).toBe('skipped');
    expect(steps.find((s) => s.nodeId === 'qualify')?.output.branch).toBe('true');
  });
  it('simulação usa o mesmo interpretador e segue o ramo falso', async () => {
    const steps = await simulateWorkflow(createSdrTemplate(), { ...sampleLead, budget: 100 });
    expect(steps.filter((s) => s.status === 'success').map((s) => s.nodeId)).toEqual([
      'trigger',
      'qualify',
      'nurture',
    ]);
    expect(steps.find((s) => s.nodeId === 'assign')?.status).toBe('skipped');
    expect(steps.find((s) => s.nodeId === 'nurture')?.output.simulated).toBe(true);
  });
  it('uma falha de efeito interrompe o caminho e não marca sucessores como sucesso', async () => {
    const steps = await interpretWorkflow(createSdrTemplate(), sampleLead, {
      execute: async () => {
        throw new Error('token=secret-do-not-log');
      },
    });
    expect(steps.find((s) => s.nodeId === 'assign')?.status).toBe('failed');
    expect(steps.find((s) => s.nodeId === 'tag')?.status).toBe('skipped');
    expect(JSON.stringify(steps)).not.toContain('secret-do-not-log');
  });
  it('redige dados pessoais até na saída de condição de e-mail', async () => {
    const flow = createSdrTemplate();
    flow.nodes[1].config = { field: 'email', operator: 'eq', value: sampleLead.email };
    const logs = JSON.stringify(await simulateWorkflow(flow, sampleLead));
    expect(logs).not.toContain(sampleLead.email);
    expect(logs).not.toContain(sampleLead.name);
  });
  it('esperar não bloqueia o relógio na simulação', () => {
    const result = simulateAction(
      {
        id: 'wait',
        type: 'wait',
        name: 'Esperar',
        description: '',
        position: { x: 0, y: 0 },
        config: { minutes: 43200 },
      },
      sampleLead,
    );
    expect(result.output).toEqual({ simulated: true, minutes: 43200 });
  });
  it('executa workflow com effect adapters de produção e captura handlers', async () => {
    const emailsSent: any[] = [];
    const sdrsAssigned: any[] = [];
    const tagsAdded: any[] = [];
    const managerNotified: any[] = [];

    const effects = createProductionEffects({
      sendEmail: async (params) => {
        emailsSent.push(params);
        return { messageId: 'msg-123' };
      },
      assignSdr: async (params) => {
        sdrsAssigned.push(params);
        return { assignedTo: 'sdr-pedro' };
      },
      addTag: async (params) => {
        tagsAdded.push(params);
        return { tags: [params.tag] };
      },
      notifyManager: async (params) => {
        managerNotified.push(params);
        return { delivered: true };
      },
    });

    const execution = await executeWorkflow(createSdrTemplate(), sampleLead, effects);
    expect(execution.status).toBe('success');
    expect(sdrsAssigned.length).toBe(1);
    expect(sdrsAssigned[0].team).toBe('Equipe comercial');
    expect(tagsAdded.length).toBe(1);
    expect(tagsAdded[0].tag).toBe('Lead qualificado');
    expect(managerNotified.length).toBe(1);
    expect(emailsSent.length).toBe(0);
  });
});
