import {
  configSchemas,
  leadSchema,
  validateWorkflow,
  triggerTypes,
  type Lead,
  type StepLog,
  type Workflow,
  type WorkflowNode,
} from '@eimax/workflow-schema';
import { resolveTemplate } from './variables';
export { resolveTemplate } from './variables';
const actionErrors: Record<string, string> = {
  ASSIGNMENT_CONFIGURATION_REQUIRED: 'Escolha um responsável da organização neste bloco.',
  ASSIGNMENT_MEMBER_UNAVAILABLE: 'O responsável está indisponível. Revise a atribuição.',
  EMAIL_PROVIDER_NOT_CONFIGURED: 'Configuração necessária: nenhum provedor de e-mail está habilitado.',
  WHATSAPP_CONSENT_REQUIRED: 'Confirme o telefone e o consentimento do destinatário antes de enviar.',
  WHATSAPP_TEMPLATE_REQUIRED: 'A janela de atendimento terminou. Use um template aprovado.',
  WAIT_NOT_CONFIGURED: 'Espera durável ainda não disponível para execução real.',
};

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
    case 'whatsapp.message.received':
    case 'whatsapp.conversation.started':
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
    case 'whatsapp.message.received':
    case 'whatsapp.conversation.started':
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
    case 'whatsapp.sdr.notify':
      return {
        output: { simulated: true, notificationPrepared: true },
        message: 'Notificação validada. Nenhum aviso foi enviado.',
      };
    case 'whatsapp.text.send':
    case 'whatsapp.template.send':
      return {
        output: { simulated: true, connectionId: c.connectionId },
        message: 'Mensagem WhatsApp simulada. Nenhum envio realizado.',
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

export interface ProductionEffectHandlers {
  sendWhatsapp?: (params: {
    node: WorkflowNode;
    lead: Lead;
  }) => Promise<{ notificationId: string; status: 'PENDING' }>;
  notifySdr?: (params: { message: string; lead: Lead }) => Promise<{ notificationId: string }>;
  sendEmail?: (params: {
    to: string;
    subject: string;
    body: string;
    lead: Lead;
  }) => Promise<{ messageId?: string; status?: 'PENDING' | 'SENT' }>;
  assignSdr?: (params: { team: string; lead: Lead }) => Promise<{ assignedTo?: string }>;
  wait?: (params: { minutes: number; lead: Lead }) => Promise<{ resumeAt?: string }>;
  addTag?: (params: { tag: string; lead: Lead }) => Promise<{ tags?: string[] }>;
  notifyManager?: (params: {
    message: string;
    lead: Lead;
  }) => Promise<{ delivered?: boolean; notificationId?: string }>;
}

export function createProductionEffects(handlers: ProductionEffectHandlers = {}): EffectAdapter {
  return {
    async execute(node: WorkflowNode, lead: Lead) {
      const c = configSchemas[node.type].parse(node.config);
      switch (node.type) {
        case 'lead.created':
        case 'whatsapp.message.received':
        case 'whatsapp.conversation.started':
        case 'webhook.received':
        case 'condition':
          return interpretControlNode(node, lead);
        case 'whatsapp.text.send':
        case 'whatsapp.template.send': {
          if (!handlers.sendWhatsapp) throw new Error('Canal WhatsApp não configurado.');
          const result = await handlers.sendWhatsapp({ node, lead });
          return { output: result, message: 'Mensagem registrada na fila de envio; aguardando o provedor.' };
        }
        case 'whatsapp.sdr.notify': {
          if (!handlers.notifySdr) throw new Error('Responsável não configurado.');
          const result = await handlers.notifySdr({ message: c.message, lead });
          return { output: result, message: 'Aviso interno disponibilizado ao SDR responsável.' };
        }
        case 'email.send': {
          if (handlers.sendEmail) {
            const res = await handlers.sendEmail({ to: lead.email, subject: c.subject, body: c.body, lead });
            if (!res.messageId) throw new Error('O provedor não confirmou um identificador.');
            return {
              output: {
                sent: res.status === 'SENT',
                status: res.status ?? 'PENDING',
                recipient: '***@***',
                subject: c.subject,
                messageId: res.messageId,
              },
              message: 'E-mail aceito pelo provedor; entrega ainda não confirmada.',
            };
          }
          throw new Error('Provedor de e-mail não configurado.');
        }
        case 'sdr.assign': {
          if (handlers.assignSdr) {
            const res = await handlers.assignSdr({ team: c.team, lead });
            return {
              output: { assigned: true, team: c.team, assignedTo: res?.assignedTo },
              message: `Lead atribuído à equipe ${c.team}.`,
            };
          }
          throw new Error('Distribuição não configurada.');
        }
        case 'wait': {
          if (handlers.wait) {
            const res = await handlers.wait({ minutes: c.minutes, lead });
            return {
              output: { delayed: true, minutes: c.minutes, resumeAt: res?.resumeAt },
              message: `Aguardando ${c.minutes} minuto(s) agendado.`,
            };
          }
          throw new Error('WAIT_NOT_CONFIGURED');
        }
        case 'tag.add': {
          if (handlers.addTag) {
            const res = await handlers.addTag({ tag: c.tag, lead });
            return {
              output: { tagged: true, tag: c.tag, currentTags: res?.tags },
              message: `Etiqueta “${c.tag}” vinculada ao lead.`,
            };
          }
          throw new Error('Adapter de etiquetas não configurado.');
        }
        case 'manager.notify': {
          if (handlers.notifyManager) {
            const res = await handlers.notifyManager({ message: c.message, lead });
            return {
              output: { notified: true, notificationId: res?.notificationId },
              message: 'Notificação interna criada e disponibilizada.',
            };
          }
          throw new Error('Adapter de notificações não configurado.');
        }
      }
    },
  };
}

// The definitive worker calls this interpreter with real effect adapters.
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
  const outputs: Record<string, unknown> = Object.create(null);
  let assignedTo: string | undefined;
  let id: string | undefined = workflow.nodes.find((n) => triggerTypes.includes(n.type))?.id;
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
      const resolvedNode = { ...node, config: { ...node.config } };
      let dynamic = false;
      if (!['condition', 'sdr.assign', ...triggerTypes].includes(node.type)) {
        for (const [key, value] of Object.entries(node.config)) {
          if (typeof value === 'string' && value.includes('{{')) {
            dynamic = true;
            resolvedNode.config[key] = resolveTemplate(value, { ...lead, assignedTo }, outputs).text;
          }
        }
      }
      const { output, message } =
        node.type === 'condition' || triggerTypes.includes(node.type)
          ? interpretControlNode(node, lead)
          : await effects.execute(resolvedNode, lead);
      outputs[node.id] = structuredClone(output);
      if (node.type === 'sdr.assign' && typeof output.assignedTo === 'string') assignedTo = output.assignedTo;
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
        output: dynamic ? { resolved: true, details: '[conteúdo dinâmico oculto]' } : output,
        message: dynamic ? 'Etapa executada com variáveis; conteúdo protegido no histórico.' : message,
        durationMs: Math.max(1, Math.round(performance.now() - start)),
      });
      id = workflow.edges.find(
        (e) => e.source === node.id && (node.type !== 'condition' || e.branch === nextBranch),
      )?.target;
    } catch (error) {
      const code =
        error instanceof Error && Object.hasOwn(actionErrors, error.message) ? error.message : undefined;
      steps.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        status: 'failed',
        input: safeInput,
        output: code ? { errorCode: code } : {},
        message: code ? actionErrors[code] : 'A configuração deste bloco não pôde ser executada.',
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

export async function executeWorkflow(
  workflow: Workflow,
  lead: Lead,
  effects?: EffectAdapter,
): Promise<{ status: 'success' | 'failed'; steps: StepLog[] }> {
  const adapter = effects ?? createProductionEffects();
  const steps = await interpretWorkflow(workflow, lead, adapter);
  const status = steps.some((s) => s.status === 'failed') ? 'failed' : 'success';
  return { status, steps };
}
