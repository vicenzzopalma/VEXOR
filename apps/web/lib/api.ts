
import type { Workflow, SimulationResult } from '@eimax/workflow-schema';
export type VersionInfo = { id: string; number: number; createdAt: string };
export type WorkflowRecord = {
  id: string;
  draft: Workflow;
  revision: number;
  updatedAt: string;
  versions: VersionInfo[];
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
