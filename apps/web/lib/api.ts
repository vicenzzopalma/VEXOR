import type { Workflow, SimulationResult } from '@eimax/workflow-schema';
export type VersionInfo = { id: string; number: number; createdAt: string };
export type WorkflowRecord = {
  id: string;
  projectId: string;
  project: ProjectRecord;
  draft: Workflow;
  revision: number;
  archivedAt?: string | null;
  updatedAt: string;
  versions: VersionInfo[];
};
export type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workflowCount: number;
  lastActivityAt: string;
};
export type ProjectWorkflow = {
  id: string;
  projectId: string;
  name: string;
  revision: number;
  archivedAt: string | null;
  updatedAt: string;
  nodeCount: number;
  versions: number;
  executions: number;
  simulations: number;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues: Array<{ nodeId?: string; message: string }> = [],
  ) {
    super(message);
  }
}
let session: Promise<unknown> | undefined;
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  session ??= fetch('/api/development/session', {
    method: 'POST',
    headers: { 'x-eimax-client': 'workspace' },
  }).then((r) => {
    if (!r.ok) {
      session = undefined;
      throw new Error('Não foi possível abrir a sessão local. Inicie com npm run dev.');
    }
  });
  await session;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-eimax-client': 'workspace', ...options.headers },
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Suas alterações continuam nesta aba.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      typeof data.message === 'string' ? data.message : 'O servidor não conseguiu concluir a ação.',
      response.status,
      data.issues ?? [],
    );
  return data as T;
}
export type Run = SimulationResult & { workflowId: string };

export type LeadRecord = {
  revision: number;
  phone: string;
  whatsappConsent: boolean;
  id: string;
  workflowId: string;
  eventKey: string;
  name: string;
  email: string;
  company: string;
  budget: number;
  score: number;
  source: string;
  status: string;
  tags: string[];
  assignedMembership: {
    id: string;
    displayName: string;
    role: string;
  } | null;
  executionsCount: number;
  notificationsCount: number;
  createdAt: string;
  updatedAt: string;
  executions?: ExecutionRecord[];
  conversation?: Array<{ id: string; createdAt: string; status: string; errorCode?: string; text: string }>;
  notifications?: Array<{
    id: string;
    channel: string;
    status: string;
    createdAt: string;
    providerMessageId?: string;
    errorCode?: string;
  }>;
};

export type NotificationRecord = {
  id: string;
  organizationId: string;
  leadId?: string;
  executionId?: string;
  channel: string;
  recipient: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  lead?: { id: string; name: string; company: string; status: string };
};

export type ExecutionRecord = {
  versionId?: string;
  checkpoints?: Array<{
    id: string;
    nodeId: string;
    nextNodeId: string | null;
    versionId: string;
    resumeAt: string;
    expiresAt?: string | null;
    status: string;
    suspendedAt: string;
    resumedAt?: string | null;
    consumedAt?: string | null;
    recoveryError?: string | null;
  }>;
  errorCode?: string;
  id: string;
  workflowId: string;
  eventKey: string;
  status: string;
  attempt: number;
  result: any;
  createdAt: string;
  finishedAt?: string;
  stepsCount: number;
  leadSummary?: {
    id: string;
    name: string;
    company: string;
    status: string;
    assignedTo: string | null;
    tags: string[];
  } | null;
  steps: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    name: string;
    status: string;
    input: any;
    output: any;
    durationMs: number;
    message: string;
    createdAt: string;
  }>;
  notifications?: NotificationRecord[];
};
