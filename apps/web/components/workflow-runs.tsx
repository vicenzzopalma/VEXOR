'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, RefreshCw, Zap } from 'lucide-react';
import { api, ApiError, type ExecutionRecord, type VersionInfo } from '@/lib/api';
import { Button } from './ui';

const PAGE_SIZE = 20;
const statusLabels: Record<string, string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Em andamento',
  SUSPENDED: 'Aguardando',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
};
/** Códigos de erro conhecidos em pt-BR; desconhecidos aparecem como "erro registrado". */
const errorLabels: Record<string, string> = {
  WORKFLOW_INACTIVE: 'fluxo inativo',
  WAIT_EXPIRED: 'espera vencida',
  WAIT_INVALID_DATE: 'data da espera inválida',
  WHATSAPP_CONSENT_REQUIRED: 'sem consentimento de WhatsApp',
  WHATSAPP_TEMPLATE_REQUIRED: 'janela de atendimento encerrada',
  WHATSAPP_CONNECTION_UNAVAILABLE: 'conta de WhatsApp indisponível',
  EMAIL_PROVIDER_NOT_CONFIGURED: 'e-mail não configurado',
  EMAIL_CONNECTION_UNAVAILABLE: 'conta de e-mail indisponível',
  ASSIGNMENT_MEMBER_UNAVAILABLE: 'responsável indisponível',
  ASSIGNMENT_CONFIGURATION_REQUIRED: 'responsável não escolhido',
  ACTION_FAILED: 'falha num bloco',
  ATTEMPTS_EXHAUSTED: 'tentativas esgotadas',
  LEASE_EXPIRED: 'processamento interrompido',
};
export const errorLabel = (code: string) => errorLabels[code] ?? 'erro registrado';
const localMidnight = (date: string, followingDay = false) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + (followingDay ? 1 : 0)).toISOString();
};
const duration = (ms?: number | null) =>
  typeof ms !== 'number' ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/**
 * Aba Execuções do fluxo: busca paginada no servidor (GET /executions/search com o filtro do fluxo),
 * com estado e período no fuso do navegador. Escolher uma execução volta ao Editor com ela no canvas.
 */
export function WorkflowRuns({
  workflowId,
  versions,
  selectedId,
  onPick,
}: {
  workflowId: string;
  versions: VersionInfo[];
  selectedId?: string;
  onPick: (row: ExecutionRecord) => void;
}) {
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ExecutionRecord[]>();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [reload, setReload] = useState(0);
  const invalidDates = Boolean(fromDate && toDate && fromDate > toDate);
  const filtered = Boolean(status || fromDate || toDate);

  useEffect(() => {
    if (invalidDates) return;
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), workflowId });
    if (status) params.set('status', status);
    if (fromDate) params.set('from', localMidnight(fromDate));
    if (toDate) params.set('until', localMidnight(toDate, true));
    api<{ items: ExecutionRecord[]; total: number }>(`/executions/search?${params}`)
      .then((result) => {
        if (!active) return;
        setLegacy(false);
        setRows(result.items);
        setTotal(result.total);
        // Página que deixou de existir (execuções removidas por outro filtro): volta para a última.
        if (page > 1 && !result.items.length && result.total > 0) setPage(Math.ceil(result.total / PAGE_SIZE));
      })
      .catch(async (e) => {
        if (!active) return;
        // API em execução sem a consulta nova: mostra as 50 mais recentes deste fluxo, sem filtros.
        if (e instanceof ApiError && e.status === 404 && !filtered && page === 1) {
          try {
            const recent = await api<ExecutionRecord[]>(`/workflows/${workflowId}/executions`);
            if (!active) return;
            setLegacy(true);
            setRows(recent);
            setTotal(recent.length);
            return;
          } catch (fallback) {
            if (active) setError((fallback as Error).message);
            return;
          }
        }
        setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workflowId, status, fromDate, toDate, page, invalidDates, filtered, reload]);

  const change = useCallback((setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);
  const versionLabel = (id?: string) => {
    const found = versions.find((v) => v.id === id);
    return found ? `versão ${found.number}` : id ? 'versão anterior' : '';
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="vx-flow-runs" aria-labelledby="flow-runs-title">
      <div className="vx-flow-runs-head">
        <div>
          <h2 id="flow-runs-title">Execuções deste fluxo</h2>
          <p>Execuções reais, das mais recentes para as mais antigas. Escolha uma para vê-la no canvas.</p>
        </div>
        <Button onClick={() => setReload((n) => n + 1)} disabled={loading} aria-label="Atualizar execuções">
          {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          Atualizar
        </Button>
      </div>
      <div className="execution-filters" role="group" aria-label="Filtros das execuções do fluxo">
        <label>
          Estado
          <select value={status} disabled={legacy} onChange={(e) => change(setStatus, e.target.value)}>
            <option value="">Todos os estados</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={fromDate}
            disabled={legacy}
            onChange={(e) => change(setFromDate, e.target.value)}
          />
        </label>
        <label>
          Até
          <input type="date" value={toDate} disabled={legacy} onChange={(e) => change(setToDate, e.target.value)} />
        </label>
        <button
          type="button"
          className="btn"
          disabled={legacy || !filtered}
          onClick={() => {
            setStatus('');
            setFromDate('');
            setToDate('');
            setPage(1);
          }}
        >
          Limpar filtros
        </button>
        <p>Datas no fuso deste computador.</p>
        {invalidDates && <p role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
        {legacy && (
          <p role="status">
            A API em execução ainda não oferece filtros e paginação. Reinicie a API para ativá-los; esta lista
            mostra até 50 execuções.
          </p>
        )}
      </div>
      {invalidDates ? null : error ? (
        <div className="validation-errors vx-flow-runs-error" role="alert">
          <span>Não foi possível carregar as execuções: {error}</span>
          <Button onClick={() => setReload((n) => n + 1)}>Tentar novamente</Button>
        </div>
      ) : loading && !rows ? (
        <p role="status" className="vx-flow-runs-status">
          <LoaderCircle size={15} className="spin" aria-hidden="true" /> Carregando execuções…
        </p>
      ) : rows?.length ? (
        <ul className="vx-flow-runs-list" aria-busy={loading || undefined}>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`vx-flow-run${selectedId === row.id ? ' is-selected' : ''}`}
                aria-current={selectedId === row.id || undefined}
                onClick={() => onPick(row)}
              >
                <span className={`vx-run-state state-${row.status.toLowerCase()}`}>
                  {statusLabels[row.status] ?? row.status}
                </span>
                <span className="vx-flow-run-main">
                  <strong>{row.leadSummary?.name ?? 'Lead sem nome'}</strong>
                  <small>
                    {new Date(row.createdAt).toLocaleString('pt-BR')}
                    {row.versionId ? ` · ${versionLabel(row.versionId)}` : ''}
                    {` · ${row.stepsCount ?? row.steps?.length ?? 0} etapas`}
                    {row.durationMs ? ` · ${duration(row.durationMs)}` : ''}
                    {row.errorCode ? ` · ${errorLabel(row.errorCode)}` : ''}
                  </small>
                </span>
                <span className="vx-flow-run-open">
                  Ver no editor <ArrowRight size={13} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <Zap size={30} aria-hidden="true" />
          <h3>{filtered ? 'Nenhuma execução encontrada' : 'Nenhuma execução deste fluxo ainda'}</h3>
          <p>
            {filtered
              ? 'Altere ou limpe os filtros para consultar outros períodos e estados.'
              : 'Com o fluxo ativo e publicado, um lead pela API, um webhook ou uma mensagem de WhatsApp roteada criam execuções aqui.'}
          </p>
        </div>
      )}
      {!legacy && !error && !invalidDates && total > 0 && (
        <nav className="execution-pagination" aria-label="Páginas de execuções do fluxo">
          <span>
            {total} {total === 1 ? 'execução' : 'execuções'} · Página {page} de {pages}
          </span>
          <Button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
            Anterior
          </Button>
          <Button disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>
            Próxima
          </Button>
        </nav>
      )}
    </section>
  );
}
