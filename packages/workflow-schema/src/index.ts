
import { z } from 'zod';

export const blockTypes = [
  'lead.created',
  'condition',
  'email.send',
  'sdr.assign',
  'wait',
  'tag.add',
  'manager.notify',
  'webhook.received',
] as const;
export type BlockType = (typeof blockTypes)[number];
export const catalog: Record<
  BlockType,
  { name: string; description: string; category: string; color: string; defaults: Record<string, unknown> }
> = {
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
export const configSchemas: Record<BlockType, z.ZodTypeAny> = {
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
    })
    .strict(),
  'sdr.assign': z.object({ team: shortText }).strict(),
  wait: z.object({ minutes: z.number().int().min(1).max(43200) }).strict(),
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

export function validateWorkflow(flow: Workflow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(flow.nodes.map((n) => n.id));
  if (ids.size !== flow.nodes.length) issues.push({ message: 'Há identificadores de blocos duplicados.' });
  if (new Set(flow.edges.map((e) => e.id)).size !== flow.edges.length)
    issues.push({ message: 'Há identificadores de conexões duplicados.' });
  const triggers = flow.nodes.filter((n) => ['lead.created', 'webhook.received'].includes(n.type));
  if (triggers.length !== 1) issues.push({ message: 'O processo precisa de exatamente um gatilho.' });
  for (const node of flow.nodes) {
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
    email: z.string().email(),
    company: shortText,
    budget: z.number().min(0).max(1e12),
    score: z.number().min(0).max(100),
    source: shortText,
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
      make('trigger', 'lead.created', 250, 40),
      make('qualify', 'condition', 250, 220, 'Qualificar oportunidade'),
      make('assign', 'sdr.assign', 65, 430),
      make('nurture', 'email.send', 440, 430, 'Iniciar relacionamento'),
      make('tag', 'tag.add', 65, 620),
      make('notify', 'manager.notify', 65, 810),
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
