import {
  configSchemas,
  leadSchema,
  validateWorkflow,
  triggerTypes,
  waitSchedule,
  stepVariables,
  templateParts,
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
  WAIT_INVALID_DATE: 'A data da espera deve ser válida e estar no futuro.',
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
        output: { simulated: true, ...('minutes' in c ? { minutes: c.minutes } : { configuration: c }) },
        message: 'Espera simulada, sem atraso real.',
      };
    case 'tag.add':
      return { output: { simulated: true, tag: c.tag }, message: `Etiqueta “${c.tag}” simulada.` };
    case 'manager.notify':
    case 'whatsapp.sdr.notify':
      return {
        output: { simulated: true, notificationPrepared: true },
        message: 'Notificação validada. Nenhum aviso foi enviado.',
      };
    case 'whatsapp.lead.update':
      return { output: { simulated: true, field: c.field }, message: 'Atualização do lead simulada.' };
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
  updateConversationLead?: (params: {
    field: string;
    value: string;
    lead: Lead;
  }) => Promise<{ updated: boolean }>;
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
    connectionId?: string;
    nodeId: string;
  }) => Promise<{ messageId?: string; notificationId?: string; status?: 'PENDING' | 'SENT' }>;
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
        case 'whatsapp.lead.update': {
          if (!handlers.updateConversationLead) throw new Error('Adapter de conversa não configurado.');
          if (c.field === 'email' && !leadSchema.shape.email.safeParse(c.value).success)
            throw new Error('INVALID_LEAD_VALUE');
          const result = await handlers.updateConversationLead({ field: c.field, value: c.value, lead });
          if (result.updated) Object.assign(lead, { [c.field]: c.value });
          return {
            output: { updated: result.updated, field: c.field },
            message: result.updated
              ? 'Lead atualizado a partir da conversa.'
              : 'Mensagem antiga preservada; cadastro mais recente mantido.',
          };
        }
        case 'email.send': {
          if (handlers.sendEmail) {
            const res = await handlers.sendEmail({
              to: lead.email,
              subject: c.subject,
              body: c.body,
              lead,
              nodeId: node.id,
              connectionId: c.connectionId,
            });
            if (res.notificationId)
              return {
                output: { notificationId: res.notificationId, status: 'PENDING', queued: true },
                message: 'E-mail enfileirado; aguardando aceitação pelo provedor.',
              };
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
  durable?: { state?: ContinuationState; suspended?: Suspension },
  options: { targetNodeId?: string } = {},
): Promise<StepLog[]> {
  const target = options.targetNodeId;
  if (target && !workflow.nodes.some((n) => n.id === target)) throw new Error('TARGET_NOT_FOUND');
  // Até um bloco: só o trecho entre o gatilho e o bloco escolhido precisa estar válido.
  const scope = target ? ancestorsOf(workflow, target) : undefined;
  const errors = target ? partialIssues(workflow, target) : validateWorkflow(workflow);
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  const lead = leadSchema.parse(durable?.state?.lead ?? rawLead);
  const steps: StepLog[] = [];
  const visited = new Set<string>(durable?.state?.visited ?? []);
  const outputs: Record<string, unknown> = Object.assign(Object.create(null), durable?.state?.outputs ?? {});
  let assignedTo: string | undefined = durable?.state?.assignedTo;
  let id: string | undefined = durable?.state
    ? (durable.state.nextNodeId ?? undefined)
    : workflow.nodes.find((n) => triggerTypes.includes(n.type))?.id;
  const safeInput = {
    company: lead.company,
    budget: lead.budget,
    score: lead.score,
    source: lead.source,
    email: '***@***',
    name: '[oculto]',
  };
  while (id) {
    // O lead seguiu um ramo que não leva ao bloco escolhido: o teste parcial termina aqui.
    if (scope && !scope.has(id)) break;
    if (visited.has(id)) throw new Error('Ciclo detectado.');
    visited.add(id);
    const node = workflow.nodes.find((n) => n.id === id)!;
    const start = performance.now();
    try {
      if (durable && node.type === 'wait') {
        const schedule = waitSchedule(node.config);
        const nextNodeId = workflow.edges.find((e) => e.source === node.id)?.target ?? null;
        const needed = new Set(
          workflow.nodes
            .filter((n) => !visited.has(n.id))
            .flatMap((n) =>
              Object.values(n.config)
                .filter((value): value is string => typeof value === 'string')
                .flatMap((value) =>
                  templateParts(value)
                    .filter((part) => part.kind === 'variable')
                    .map((part) => part.value),
                ),
            ),
        );
        const continuationLead = { ...lead };
        if (!needed.has('lead.message')) delete continuationLead.message;
        if (!needed.has('lead.phone')) delete continuationLead.phone;
        const safeOutputs = Object.fromEntries(
          Object.entries(outputs).map(([key, value]) => {
            const type = workflow.nodes.find((n) => n.id === key)?.type ?? '';
            return [
              key,
              Object.fromEntries(
                Object.entries(value as Record<string, unknown>).filter(
                  ([field]) =>
                    Object.hasOwn(stepVariables[type] ?? {}, field) && needed.has(`steps.${key}.${field}`),
                ),
              ),
            ];
          }),
        );
        durable.suspended = {
          ...schedule,
          nodeId: node.id,
          nextNodeId,
          state: {
            lead: continuationLead,
            outputs: safeOutputs,
            visited: [...visited],
            nextNodeId,
            ...(assignedTo ? { assignedTo } : {}),
          },
        };
        steps.push({
          nodeId: node.id,
          name: node.name,
          type: node.type,
          status: 'success',
          input: {},
          output: { resumeAt: schedule.resumeAt.toISOString() },
          durationMs: 0,
          message: 'Espera persistida; aguardando retomada automática.',
        });
        return steps;
      }
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
      id =
        node.id === target
          ? undefined
          : workflow.edges.find(
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
        message: !scope
          ? 'Este bloco pertence a outro caminho.'
          : scope.has(n.id)
            ? 'Não alcançado: o lead de exemplo seguiu outro caminho antes deste bloco.'
            : 'Fora do trecho testado até o bloco escolhido.',
      }),
    );
  return steps;
}

/** Blocos que levam até `nodeId` (inclui o próprio bloco), seguindo as ligações para trás. */
export function ancestorsOf(workflow: Workflow, nodeId: string): Set<string> {
  const found = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of workflow.edges)
      if (edge.target === current && !found.has(edge.source)) {
        found.add(edge.source);
        queue.push(edge.source);
      }
  }
  return found;
}

/** O bloco é alcançável a partir do gatilho seguindo as ligações. */
export function reachableFromTrigger(workflow: Workflow, nodeId: string): boolean {
  const trigger = workflow.nodes.find((n) => triggerTypes.includes(n.type));
  return !!trigger && ancestorsOf(workflow, nodeId).has(trigger.id);
}

/**
 * Validação do teste parcial: problemas de blocos fora do trecho até o bloco escolhido, blocos soltos
 * e ramos de condição sem ligação não impedem o teste (o percurso termina se o ramo faltar).
 */
export function partialIssues(workflow: Workflow, targetNodeId: string) {
  const scope = ancestorsOf(workflow, targetNodeId);
  return validateWorkflow(workflow).filter((issue) =>
    issue.nodeId
      ? scope.has(issue.nodeId) && issue.code !== 'CONDITION_BRANCHES'
      : issue.code !== 'DISCONNECTED',
  );
}

export function simulateWorkflow(workflow: Workflow, lead: Lead): Promise<StepLog[]> {
  return interpretWorkflow(workflow, lead, simulationEffects);
}

/** Simulação só até um bloco: percorre os ancestrais necessários com o lead e para no bloco escolhido. */
export async function simulateUntil(workflow: Workflow, lead: Lead, targetNodeId: string) {
  const steps = await interpretWorkflow(workflow, lead, simulationEffects, undefined, { targetNodeId });
  return {
    steps,
    reachedTarget: steps.some((s) => s.nodeId === targetNodeId && s.status !== 'skipped'),
  };
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

export interface ContinuationState {
  lead: Lead;
  outputs: Record<string, unknown>;
  visited: string[];
  nextNodeId: string | null;
  assignedTo?: string;
}
export interface Suspension {
  nodeId: string;
  nextNodeId: string | null;
  resumeAt: Date;
  expiresAt: Date | null;
  state: ContinuationState;
}

export async function executeDurableSegment(
  workflow: Workflow,
  lead: Lead,
  effects: EffectAdapter,
  state?: ContinuationState,
) {
  const durable: { state?: ContinuationState; suspended?: Suspension } = { state };
  const steps = await interpretWorkflow(workflow, lead, effects, durable);
  return {
    status: durable.suspended
      ? ('suspended' as const)
      : steps.some((s) => s.status === 'failed')
        ? ('failed' as const)
        : ('success' as const),
    steps,
    suspension: durable.suspended,
  };
}
