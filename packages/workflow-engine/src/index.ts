
import {
  configSchemas,
  leadSchema,
  validateWorkflow,
  type Lead,
  type StepLog,
  type Workflow,
  type WorkflowNode,
} from '@eimax/workflow-schema';

export function evaluateCondition(config: Record<string, unknown>, lead: Lead): boolean {
  const value = lead[config.field as keyof Lead];
  const expected = config.value;
  switch (config.operator) {
    case 'gte':
      return Number(value) >= Number(expected);
    case 'gt':
      return Number(value) > Number(expected);
    case 'lte':
      return Number(value) <= Number(expected);
    case 'lt':
      return Number(value) < Number(expected);
    case 'eq':
      return typeof value === 'number'
        ? value === Number(expected)
        : String(value).toLowerCase() === String(expected).toLowerCase();
    case 'contains':
      return String(value).toLowerCase().includes(String(expected).toLowerCase());
    default:
      throw new Error('Operador inválido.');
  }
}

export function interpretControlNode(
  node: WorkflowNode,
  lead: Lead,
): { output: Record<string, unknown>; message: string } {
  const c = configSchemas[node.type].parse(node.config);
  switch (node.type) {
    case 'lead.created':
      return { output: { accepted: true, source: lead.source }, message: 'Evento de lead recebido.' };
    case 'webhook.received':
      return {
        output: { accepted: true, authentication: 'ingress-responsibility' },
        message: 'Evento de webhook recebido. A autenticação pertence à camada de entrada.',
      };
    case 'condition': {
      const matched = evaluateCondition(c, lead);
      return {
        output: {
          matched,
          branch: String(matched),
          field: c.field,
          value: lead[c.field as keyof Lead],
          expected: c.value,
        },
        message: matched
          ? 'Regra atendida. Seguindo o caminho Sim.'
          : 'Regra não atendida. Seguindo o caminho Não.',
      };
    }
    default:
      throw new Error('O bloco requer um adapter de efeito.');
  }
}

// Simulation has no network or credentials capability. Never reuse it as a delivery worker.
export function simulateAction(
  node: WorkflowNode,
  lead: Lead,
): { output: Record<string, unknown>; message: string } {
  const c = configSchemas[node.type].parse(node.config);
  switch (node.type) {
    case 'lead.created':
    case 'webhook.received':
    case 'condition':
      return interpretControlNode(node, lead);
    case 'email.send':
      return {
        output: { simulated: true, recipient: '***@***', subject: c.subject },
        message: 'E-mail validado. Nenhuma mensagem foi enviada.',
      };
    case 'sdr.assign':
      return { output: { simulated: true, team: c.team }, message: `Atribuição simulada para ${c.team}.` };
    case 'wait':
      return {
        output: { simulated: true, minutes: c.minutes },
        message: `Espera de ${c.minutes} minuto(s) simulada, sem atraso real.`,
      };
    case 'tag.add':
      return { output: { simulated: true, tag: c.tag }, message: `Etiqueta “${c.tag}” simulada.` };
    case 'manager.notify':
      return {
        output: { simulated: true, notificationPrepared: true },
        message: 'Notificação validada. Nenhum aviso foi enviado.',
      };
  }
}

export interface EffectAdapter {
  execute(node: WorkflowNode, lead: Lead): Promise<{ output: Record<string, unknown>; message: string }>;
}
export const simulationEffects: EffectAdapter = {
  async execute(node, lead) {
    return simulateAction(node, lead);
  },
};

// The definitive worker will call this interpreter with real effect adapters.
// Branch decisions and traversal live here, independently of effects and UI.
export async function interpretWorkflow(
  workflow: Workflow,
  rawLead: Lead,
  effects: EffectAdapter,
): Promise<StepLog[]> {
  const errors = validateWorkflow(workflow);
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  const lead = leadSchema.parse(rawLead);
  const steps: StepLog[] = [];
  const visited = new Set<string>();
  let id: string | undefined = workflow.nodes.find((n) =>
    ['lead.created', 'webhook.received'].includes(n.type),
  )?.id;
  const safeInput = {
    company: lead.company,
    budget: lead.budget,
    score: lead.score,
    source: lead.source,
    email: '***@***',
    name: '[oculto]',
  };
  while (id) {
    if (visited.has(id)) throw new Error('Ciclo detectado.');
    visited.add(id);
    const node = workflow.nodes.find((n) => n.id === id)!;
    const start = performance.now();
    try {
      const { output, message } =
        node.type === 'condition' || node.type === 'lead.created' || node.type === 'webhook.received'
          ? interpretControlNode(node, lead)
          : await effects.execute(node, lead);
      const nextBranch = output.branch;
      if (node.type === 'condition' && node.config.field === 'email') {
        output.value = '***@***';
        output.expected = '[oculto]';
      }
      steps.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        status: 'success',
        input: safeInput,
        output,
        message,
        durationMs: Math.max(1, Math.round(performance.now() - start)),
      });
      id = workflow.edges.find(
        (e) => e.source === node.id && (node.type !== 'condition' || e.branch === nextBranch),
      )?.target;
    } catch {
      steps.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        status: 'failed',
        input: safeInput,
        output: {},
        message: 'A configuração deste bloco não pôde ser simulada.',
        durationMs: Math.max(1, Math.round(performance.now() - start)),
      });
      break;
    }
  }
  workflow.nodes
    .filter((n) => !visited.has(n.id))
    .forEach((n) =>
      steps.push({
        nodeId: n.id,
        name: n.name,
        type: n.type,
        status: 'skipped',
        input: {},
        output: {},
        durationMs: 0,
        message: 'Este bloco pertence a outro caminho.',
      }),
    );
  return steps;
}
export function simulateWorkflow(workflow: Workflow, lead: Lead): Promise<StepLog[]> {
  return interpretWorkflow(workflow, lead, simulationEffects);
}
