import { z } from 'zod';
import { isAllowedVariable, stepVariables, templateParts } from './variables';
export * from './variables';

export const blockTypes = [
  'lead.created',
  'condition',
  'email.send',
  'sdr.assign',
  'wait',
  'tag.add',
  'manager.notify',
  'webhook.received',
  'whatsapp.message.received',
  'whatsapp.conversation.started',
  'whatsapp.text.send',
  'whatsapp.template.send',
  'whatsapp.sdr.notify',
  'whatsapp.lead.update',
] as const;
export type BlockType = (typeof blockTypes)[number];
export const catalog: Record<
  BlockType,
  { name: string; description: string; category: string; color: string; defaults: Record<string, unknown> }
> = {
  'whatsapp.lead.update': {
    name: 'Atualizar lead da conversa',
    description: 'Atualize um campo com dados da mensagem',
    category: 'Ações',
    color: 'blue',
    defaults: { field: 'name', value: '{{lead.message}}' },
  },
  'whatsapp.message.received': {
    name: 'Mensagem WhatsApp recebida',
    description: 'Inicie com uma mensagem recebida',
    category: 'Gatilhos',
    color: 'green',
    defaults: { connectionId: '' },
  },
  'whatsapp.conversation.started': {
    name: 'Nova conversa WhatsApp',
    description: 'Requer evento de conversa do provedor',
    category: 'Gatilhos',
    color: 'green',
    defaults: { connectionId: '' },
  },
  'whatsapp.text.send': {
    name: 'Enviar texto WhatsApp',
    description: 'Responda pela conta conectada',
    category: 'Ações',
    color: 'green',
    defaults: { connectionId: '', text: 'Olá {{lead.name}}!' },
  },
  'whatsapp.template.send': {
    name: 'Enviar template WhatsApp',
    description: 'Use um template aprovado pela Meta',
    category: 'Ações',
    color: 'green',
    defaults: { connectionId: '', template: '', language: 'pt_BR' },
  },
  'whatsapp.sdr.notify': {
    name: 'Notificar SDR de mensagem',
    description: 'Disponibilize um aviso ao responsável',
    category: 'Ações',
    color: 'blue',
    defaults: { message: 'Nova mensagem recebida de {{lead.name}}.' },
  },
  'lead.created': {
    name: 'Novo lead recebido',
    description: 'Comece com uma nova oportunidade',
    category: 'Gatilhos',
    color: 'green',
    defaults: { source: 'formulario' },
  },
  'webhook.received': {
    name: 'Receber webhook',
    description: 'Receba um evento autenticado',
    category: 'Gatilhos',
    color: 'green',
    defaults: { credentialRef: '' },
  },
  condition: {
    name: 'Condição SE / SENÃO',
    description: 'Crie caminhos com uma regra',
    category: 'Lógica',
    color: 'amber',
    defaults: { field: 'budget', operator: 'gte', value: 1000 },
  },
  wait: {
    name: 'Esperar',
    description: 'Dê tempo ao seu processo',
    category: 'Lógica',
    color: 'blue',
    defaults: { minutes: 5 },
  },
  'email.send': {
    name: 'Enviar e-mail',
    description: 'Inicie uma boa conversa',
    category: 'Ações',
    color: 'purple',
    defaults: {
      to: 'lead.email',
      subject: 'Vamos conversar?',
      body: 'Olá! Recebemos seu interesse. Podemos conversar?',
    },
  },
  'sdr.assign': {
    name: 'Atribuir SDR',
    description: 'Conecte o lead à pessoa certa',
    category: 'Ações',
    color: 'blue',
    defaults: { team: 'Equipe comercial' },
  },
  'tag.add': {
    name: 'Adicionar etiqueta',
    description: 'Organize suas oportunidades',
    category: 'Ações',
    color: 'pink',
    defaults: { tag: 'Lead qualificado' },
  },
  'manager.notify': {
    name: 'Notificar gestor',
    description: 'Mantenha sua equipe informada',
    category: 'Ações',
    color: 'orange',
    defaults: { message: 'Uma nova oportunidade foi qualificada.' },
  },
};

const shortText = z.string().trim().min(1, 'Preencha este campo.').max(200);
export const waitConfigSchema = z.union([
  z.object({ minutes: z.number().int().min(1).max(43200) }).strict(),
  z
    .object({
      mode: z.literal('duration'),
      amount: z.number().int().min(1).max(31622400),
      unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
      resumeDeadlineMinutes: z.number().int().min(1).max(43200).optional(),
    })
    .strict()
    .refine(
      (c) => c.amount * { seconds: 1, minutes: 60, hours: 3600, days: 86400 }[c.unit] <= 31622400,
      'A espera máxima é de 366 dias.',
    ),
  z
    .object({
      mode: z.literal('until'),
      at: z.string().datetime({ offset: true, message: 'Informe uma data válida com fuso horário.' }),
      resumeDeadlineMinutes: z.number().int().min(1).max(43200).optional(),
    })
    .strict(),
]);

export function waitSchedule(config: Record<string, unknown>, now = new Date()) {
  const c = waitConfigSchema.parse(config);
  const resumeAt = new Date(
    'minutes' in c
      ? now.getTime() + c.minutes * 60000
      : c.mode === 'until'
        ? c.at
        : now.getTime() +
          c.amount * { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 }[c.unit],
  );
  if (!Number.isFinite(resumeAt.getTime()) || resumeAt.getTime() <= now.getTime())
    throw new Error('WAIT_INVALID_DATE');
  return {
    resumeAt,
    expiresAt:
      'resumeDeadlineMinutes' in c && c.resumeDeadlineMinutes
        ? new Date(resumeAt.getTime() + c.resumeDeadlineMinutes * 60000)
        : null,
  };
}
export const configSchemas: Record<BlockType, z.ZodTypeAny> = {
  'whatsapp.lead.update': z
    .object({ field: z.enum(['name', 'company', 'email']), value: z.string().trim().min(1).max(200) })
    .strict(),
  'whatsapp.message.received': z.object({ connectionId: shortText }).strict(),
  'whatsapp.conversation.started': z.object({ connectionId: shortText }).strict(),
  'whatsapp.text.send': z
    .object({ connectionId: shortText, text: z.string().trim().min(1).max(4096) })
    .strict(),
  'whatsapp.template.send': z
    .object({
      connectionId: shortText,
      template: z.string().regex(/^[a-z0-9_]{1,200}$/),
      language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
    })
    .strict(),
  'whatsapp.sdr.notify': z.object({ message: z.string().trim().min(1).max(1000) }).strict(),
  'lead.created': z.object({ source: shortText }).strict(),
  'webhook.received': z
    .object({
      credentialRef: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{3,80}$/, 'Informe a referência da credencial, nunca o segredo.'),
    })
    .strict(),
  condition: z
    .object({
      field: z.enum(['budget', 'score', 'source', 'company', 'email']),
      operator: z.enum(['gte', 'gt', 'lte', 'lt', 'eq', 'contains']),
      value: z.union([z.string().min(1).max(200), z.number().finite()]),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (
        ['gte', 'gt', 'lte', 'lt'].includes(v.operator) &&
        (!['budget', 'score'].includes(v.field) || !Number.isFinite(Number(v.value)))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Use um campo numérico e um valor válido.',
        });
      if (['budget', 'score'].includes(v.field) && !Number.isFinite(Number(v.value)))
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'Informe um número válido.' });
    }),
  'email.send': z
    .object({
      to: z.literal('lead.email'),
      subject: shortText,
      body: z.string().trim().min(1, 'Escreva a mensagem.').max(5000),
      connectionId: shortText.optional(),
    })
    .strict(),
  'sdr.assign': z.object({ team: shortText }).strict(),
  wait: waitConfigSchema,
  'tag.add': z.object({ tag: z.string().trim().min(1).max(60) }).strict(),
  'manager.notify': z.object({ message: z.string().trim().min(1).max(1000) }).strict(),
};

export const nodeSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(blockTypes),
    name: shortText,
    description: z.string().max(500),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    config: z.record(z.unknown()),
  })
  .strict();
export const edgeSchema = z
  .object({
    id: z.string().min(1).max(100),
    source: z.string(),
    target: z.string(),
    branch: z.enum(['true', 'false']).optional(),
  })
  .strict();
export const workflowSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: shortText,
    nodes: z.array(nodeSchema).max(100),
    edges: z.array(edgeSchema).max(200),
  })
  .strict();
export type WorkflowNode = z.infer<typeof nodeSchema>;
export type WorkflowEdge = z.infer<typeof edgeSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type ValidationIssue = { nodeId?: string; message: string };
export const triggerTypes: readonly string[] = [
  'lead.created',
  'webhook.received',
  'whatsapp.message.received',
  'whatsapp.conversation.started',
];

export function validateWorkflow(flow: Workflow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(flow.nodes.map((n) => n.id));
  if (ids.size !== flow.nodes.length) issues.push({ message: 'Há identificadores de blocos duplicados.' });
  if (new Set(flow.edges.map((e) => e.id)).size !== flow.edges.length)
    issues.push({ message: 'Há identificadores de conexões duplicados.' });
  const triggers = flow.nodes.filter((n) => triggerTypes.includes(n.type));
  if (triggers.length !== 1) issues.push({ message: 'O processo precisa de exatamente um gatilho.' });
  for (const node of flow.nodes) {
    for (const value of Object.values(node.config)) {
      if (typeof value !== 'string') continue;
      for (const part of templateParts(value).filter((p) => p.kind === 'variable')) {
        let valid = isAllowedVariable(part.value);
        if (part.value.startsWith('steps.')) {
          const [, sourceId, field] = part.value.split('.');
          const source = flow.nodes.find((n) => n.id === sourceId);
          const ancestors = new Set<string>();
          const visit = (id: string) => {
            for (const edge of flow.edges.filter((e) => e.target === id)) {
              if (!ancestors.has(edge.source)) {
                ancestors.add(edge.source);
                visit(edge.source);
              }
            }
          };
          visit(node.id);
          valid =
            valid &&
            !!source &&
            Object.hasOwn(stepVariables[source.type] ?? {}, field) &&
            ancestors.has(sourceId) &&
            sourceId !== node.id;
        }
        if (!valid)
          issues.push({ nodeId: node.id, message: `${node.name}: variável indisponível (${part.value}).` });
      }
      if (value.replace(/\{\{[^{}]*\}\}/g, '').includes('{{'))
        issues.push({ nodeId: node.id, message: `${node.name}: variável incompleta.` });
    }
    const parsed = configSchemas[node.type].safeParse(node.config);
    if (!parsed.success)
      for (const item of parsed.error.issues)
        issues.push({ nodeId: node.id, message: `${node.name}: ${item.message}` });
    const outgoing = flow.edges.filter((e) => e.source === node.id);
    if (node.type === 'condition') {
      if (
        outgoing.length !== 2 ||
        !outgoing.some((e) => e.branch === 'true') ||
        !outgoing.some((e) => e.branch === 'false')
      )
        issues.push({ nodeId: node.id, message: `${node.name}: conecte os caminhos Sim e Não.` });
    } else if (outgoing.length > 1 || outgoing.some((e) => e.branch))
      issues.push({
        nodeId: node.id,
        message: `${node.name}: use apenas uma conexão de saída, sem condição.`,
      });
    if (triggers.some((t) => t.id === node.id) && flow.edges.some((e) => e.target === node.id))
      issues.push({ nodeId: node.id, message: 'Um gatilho não pode receber conexões.' });
  }
  const signatures = new Set<string>();
  for (const edge of flow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target))
      issues.push({ message: 'Uma conexão aponta para um bloco inexistente.' });
    const key = `${edge.source}:${edge.target}:${edge.branch ?? ''}`;
    if (signatures.has(key)) issues.push({ message: 'Existem conexões repetidas.' });
    signatures.add(key);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  let cycle = false;
  const walk = (id: string) => {
    if (stack.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    flow.edges.filter((e) => e.source === id).forEach((e) => walk(e.target));
    stack.delete(id);
  };
  triggers.forEach((n) => walk(n.id));
  if (flow.nodes.some((n) => !visited.has(n.id)))
    issues.push({ message: 'Conecte todos os blocos ao gatilho inicial.' });
  flow.nodes.forEach((n) => walk(n.id));
  if (cycle) issues.push({ message: 'O processo contém um ciclo. Remova a conexão de retorno.' });
  return issues;
}

export const leadSchema = z
  .object({
    name: shortText,
    email: z.union([z.string().email(), z.literal('')]),
    company: shortText,
    budget: z.number().min(0).max(1e12),
    score: z.number().min(0).max(100),
    source: shortText,
    phone: z.string().trim().max(30).optional(),
    message: z.string().max(10000).optional(),
  })
  .strict();
export type Lead = z.infer<typeof leadSchema>;
export const sampleLead: Lead = {
  name: 'Marina Costa',
  email: 'marina@example.com',
  company: 'Acme Studio',
  budget: 5000,
  score: 85,
  source: 'formulario',
};

export function createSdrTemplate(): Workflow {
  const make = (id: string, type: BlockType, x: number, y: number, name?: string): WorkflowNode => ({
    id,
    type,
    position: { x, y },
    name: name ?? catalog[type].name,
    description: '',
    config: { ...catalog[type].defaults },
  });
  return {
    schemaVersion: 1,
    name: 'Qualificação de leads',
    nodes: [
      // Da esquerda para a direita: entrada à esquerda, saídas à direita (Sim acima, Não abaixo).
      make('trigger', 'lead.created', 40, 180),
      make('qualify', 'condition', 280, 180, 'Qualificar oportunidade'),
      make('assign', 'sdr.assign', 520, 60),
      make('nurture', 'email.send', 520, 300, 'Iniciar relacionamento'),
      make('tag', 'tag.add', 760, 60),
      make('notify', 'manager.notify', 1000, 60),
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'qualify' },
      { id: 'e2', source: 'qualify', target: 'assign', branch: 'true' },
      { id: 'e3', source: 'qualify', target: 'nurture', branch: 'false' },
      { id: 'e4', source: 'assign', target: 'tag' },
      { id: 'e5', source: 'tag', target: 'notify' },
    ],
  };
}

export type StepLog = {
  nodeId: string;
  name: string;
  type: BlockType;
  status: 'success' | 'failed' | 'skipped';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  message: string;
};
export type SimulationResult = {
  id: string;
  createdAt: string;
  workflowName: string;
  status: 'success' | 'failed';
  mode: 'simulation';
  steps: StepLog[];
};
