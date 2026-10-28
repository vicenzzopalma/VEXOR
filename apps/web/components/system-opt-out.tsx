'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleSlash,
  LockKeyhole,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Send,
  Split,
  UserCheck,
  UserX,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui';

type OptOutEvent = {
  id: string;
  phone: string;
  excerpt: string;
  classification: string;
  status: string;
  receivedAt: string;
  updatedAt: string;
  errorCode: string | null;
  confirmation: { status: string; sentAt: string | null; updatedAt: string | null; errorCode: string | null };
};
type State = {
  project: { id: string; name: string };
  scope: string;
  received: number;
  statuses: { status: string; _count: number }[];
  confirmations: { status: string; _count: number }[];
  events: OptOutEvent[];
  connections: { id: string; name: string; enabled: boolean; state: string; quarantinedAt: string | null }[];
  activatedAt: string | null;
  phrases: string[];
  typos: string[];
  typoRule: string;
  confirmationText: string;
  confirmationEnabled: boolean;
  allowlist: string[];
  esferaEndpoint: string | null;
};

const labels: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  DELIVERED: 'Registrado no Esfera',
  FAILED: 'Falhou',
  SENT: 'Enviada',
  HELD: 'Retida',
  REVIEW: 'Revisão humana',
  DISMISSED: 'Descartado',
  NOT_APPLICABLE: 'Não aplicável',
  OPT_OUT: 'Descadastro',
  AMBIGUOUS: 'Revisão humana',
};
const tone = (status: string) =>
  ['DELIVERED', 'SENT', 'OPT_OUT'].includes(status)
    ? 'ok'
    : ['FAILED'].includes(status)
      ? 'bad'
      : ['PENDING', 'PROCESSING', 'HELD', 'REVIEW', 'AMBIGUOUS'].includes(status)
        ? 'warn'
        : '';
const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : '—');
const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;

// ---------- Nó no estilo do editor (caixa quadrada, ícone, nome embaixo, saídas nomeadas) ----------
type StepData = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: string;
  trigger?: boolean;
  terminal?: boolean;
  outputs?: { id: string; label: string }[];
  badge?: 'ok' | 'warn';
  badgeText?: string;
};
type StepNode = Node<StepData, 'step'>;

function Step({ data, selected }: NodeProps<StepNode>) {
  const Icon = data.icon;
  const outs = data.outputs ?? [];
  const at = (i: number) => `${((i + 1) / (outs.length + 1)) * 100}%`;
  return (
    <div
      className={`n8n-node${data.trigger ? ' is-trigger' : ''}${selected ? ' is-selected' : ''}`}
      style={{ '--tone': data.tone } as CSSProperties}
      title={data.badgeText}
    >
      {!data.trigger && <Handle type="target" position={Position.Left} className="n8n-handle-in" />}
      {data.trigger && <Zap className="n8n-trigger-bolt" size={15} aria-hidden="true" />}
      <Icon size={40} strokeWidth={1.6} aria-hidden="true" />
      {data.badge && (
        <span className={`n8n-node-badge ${data.badge}`} aria-label={data.badgeText}>
          {data.badge === 'ok' ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={11} strokeWidth={2.6} />}
        </span>
      )}
      {outs.length
        ? outs.map((o, i) => (
            <Handle
              key={o.id}
              id={o.id}
              type="source"
              position={Position.Right}
              className="n8n-handle-out"
              style={{ top: at(i) }}
            />
          ))
        : !data.terminal && <Handle type="source" position={Position.Right} className="n8n-handle-out" />}
      {outs.map((o, i) => (
        <span key={`${o.id}-label`} className="n8n-out-label" style={{ top: at(i) }}>
          {o.label}
        </span>
      ))}
      <div className="n8n-node-label">
        <strong>{data.title}</strong>
        {data.subtitle && <small>{data.subtitle}</small>}
      </div>
    </div>
  );
}
const nodeTypes = { step: Step };

function edge(id: string, source: string, target: string, count: number | null, sourceHandle?: string, text?: string): Edge {
  const live = (count ?? 0) > 0;
  const color = live ? '#2a9a79' : '#b9b5c6';
  return {
    id,
    source,
    target,
    sourceHandle,
    type: 'default',
    label: text ?? (count === null ? undefined : plural(count)),
    style: { stroke: color, strokeWidth: 2 },
    labelStyle: { fill: live ? '#1f7a5f' : '#7d7890', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: '#ffffff' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
  };
}

export function SystemOptOut({ projectId }: { projectId: string }) {
  const [data, setData] = useState<State>();
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'editor' | 'runs'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'runs'
      ? 'runs'
      : 'editor',
  );
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('viewer');
  const flow = useRef<ReactFlowInstance<StepNode, Edge> | null>(null);
  // Reajusta o canvas quando a janela muda de tamanho (como no editor).
  useEffect(() => {
    const refit = () => flow.current?.fitView({ padding: 0.22 });
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, []);
  const load = useCallback(async () => {
    try {
      setData(await api<State>(`/projects/${projectId}/system-opt-out`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
    void api<{ role: string }>('/me')
      .then((me) => setRole(me.role))
      .catch(() => {});
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const resolve = async (event: OptOutEvent, decision: 'CONFIRM' | 'DISMISS') => {
    setBusy(true);
    try {
      await api(`/opt-outs/${event.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision, expectedUpdatedAt: event.updatedAt }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <section aria-busy={!error} className="n8n-flow n8n-flow-loading">
        <p>{error || 'Carregando o fluxo de descadastro…'}</p>
        {error && <Button onClick={load}>Tentar novamente</Button>}
      </section>
    );

  // Contagens reais (banco do VEXOR), sem métricas simuladas.
  const st = Object.fromEntries(data.statuses.map((s) => [s.status, s._count])) as Record<string, number>;
  const cf = Object.fromEntries(data.confirmations.map((s) => [s.status, s._count])) as Record<string, number>;
  const review = st.REVIEW ?? 0;
  const dismissed = st.DISMISSED ?? 0;
  const allEvents = Object.values(st).reduce((a, b) => a + b, 0);
  const optOut = allEvents - review - dismissed;
  const delivered = st.DELIVERED ?? 0;
  const esferaFailed = st.FAILED ?? 0;
  const sent = cf.SENT ?? 0;
  const confProblems = (cf.FAILED ?? 0) + (cf.HELD ?? 0);
  const other = Math.max(0, data.received - allEvents);
  const connections = data.connections.map((c) => c.name).join(', ') || 'sem conexão';

  const steps: Record<string, StepData> = {
    in: {
      title: 'Mensagem recebida',
      subtitle: `WhatsApp · ${connections}`,
      icon: MessageCircle,
      tone: '#25a35a',
      trigger: true,
      badge: data.received ? 'ok' : undefined,
      badgeText: `${data.received} mensagens recebidas`,
    },
    classify: {
      title: 'Classificar SAIR',
      subtitle: `${data.phrases.length} frases + erros de digitação`,
      icon: Split,
      tone: '#7352d6',
      outputs: [
        { id: 'optout', label: 'Descadastro' },
        { id: 'review', label: 'Revisão' },
        { id: 'other', label: 'Outras' },
      ],
    },
    optout: {
      title: 'Descadastrar',
      subtitle: 'Revoga o consentimento',
      icon: UserX,
      tone: '#d45d74',
      badge: optOut ? 'ok' : undefined,
      badgeText: `${optOut} descadastros`,
    },
    review: {
      title: 'Revisão humana',
      subtitle: review ? `${review} aguardando decisão` : 'Nada aguardando',
      icon: UserCheck,
      tone: '#c98012',
      badge: review ? 'warn' : undefined,
      badgeText: `${review} aguardando revisão`,
    },
    other: {
      title: 'Sem ação',
      subtitle: 'Não é pedido de saída',
      icon: CircleSlash,
      tone: '#8f8a9c',
      terminal: true,
    },
    esfera: {
      title: 'Registrar no Esfera',
      subtitle: 'POST /api/optout/events',
      icon: Webhook,
      tone: '#2f6fdb',
      badge: esferaFailed ? 'warn' : delivered ? 'ok' : undefined,
      badgeText: esferaFailed ? `${esferaFailed} falhas na entrega` : `${delivered} registrados`,
    },
    confirm: {
      title: 'Confirmar ao devedor',
      subtitle: !data.confirmationEnabled
        ? 'Desligada'
        : data.allowlist.length
          ? 'Ligada · números restritos'
          : 'Ligada para todos',
      icon: Send,
      tone: '#25a35a',
      terminal: true,
      badge: confProblems ? 'warn' : sent ? 'ok' : undefined,
      badgeText: confProblems ? `${confProblems} retidas ou com falha` : `${sent} enviadas`,
    },
  };
  const layout: Record<string, [number, number]> = {
    in: [0, 190],
    classify: [290, 190],
    optout: [620, 10],
    review: [620, 190],
    other: [620, 370],
    esfera: [930, 10],
    confirm: [1240, 10],
  };
  const nodes: StepNode[] = Object.entries(steps).map(([id, d]) => ({
    id,
    type: 'step',
    position: { x: layout[id][0], y: layout[id][1] },
    data: d,
    selected: open === id,
    draggable: false,
  }));
  const edges: Edge[] = [
    edge('in-classify', 'in', 'classify', data.received),
    edge('c-optout', 'classify', 'optout', optOut, 'optout'),
    edge('c-review', 'classify', 'review', review, 'review'),
    edge('c-other', 'classify', 'other', other, 'other'),
    edge('optout-esfera', 'optout', 'esfera', delivered),
    edge('review-esfera', 'review', 'esfera', null, undefined, 'se confirmado'),
    edge('esfera-confirm', 'esfera', 'confirm', sent),
  ];

  const optOutEvents = data.events.filter((e) => e.classification === 'OPT_OUT');
  const reviewEvents = data.events.filter((e) => e.status === 'REVIEW');
  const chip = (status: string) => <span className={`n8n-chip ${tone(status)}`}>{labels[status] ?? status}</span>;
  const items = (list: OptOutEvent[], empty: string, extra?: (e: OptOutEvent) => ReactNode) =>
    list.length ? (
      <ol className="n8n-items">
        {list.slice(0, 15).map((e) => (
          <li key={e.id}>
            <div>
              <strong>{e.phone}</strong>
              <time>{when(e.receivedAt)}</time>
            </div>
            <p>“{e.excerpt}”</p>
            {extra?.(e)}
          </li>
        ))}
      </ol>
    ) : (
      <p className="n8n-empty">{empty}</p>
    );
  const param = (label: string, value: ReactNode) => (
    <div className="n8n-param" key={label}>
      <span className="n8n-param-label">{label}</span>
      <div className="n8n-field">{value}</div>
    </div>
  );
  const panes: Record<string, { input: ReactNode; params: ReactNode; output: ReactNode }> = {
    in: {
      input: <p className="n8n-empty">Gatilho: o fluxo começa a cada mensagem individual recebida.</p>,
      params: (
        <>
          {data.connections.map((c) =>
            param(
              `Conexão WhatsApp ${c.name}`,
              <>
                <strong>{c.name}</strong> ·{' '}
                {c.quarantinedAt
                  ? 'Em quarentena'
                  : !c.enabled
                    ? 'Desativada'
                    : c.state === 'CONNECTED'
                      ? 'Conectada'
                      : c.state}
              </>,
            ),
          )}
          {param('Filtro', 'Somente conversas individuais. Grupos e mensagens enviadas por nós são ignorados.')}
          {param('Mensagens recebidas', data.received)}
        </>
      ),
      output: items(data.events, 'Nenhum pedido de saída recebido ainda.'),
    },
    classify: {
      input: items(data.events, 'Nenhuma mensagem para classificar.'),
      params: (
        <>
          {param('Tolerância a erro de digitação', data.typoRule)}
          {param(
            'Frases que descadastram (sem acento, maiúscula ou pontuação)',
            <div className="n8n-chips">
              {data.phrases.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>,
          )}
          {param(
            'Não descadastram',
            '“Chega” e “pare de brincadeira” vão para revisão humana. “Para mim tá bom” e “sai hoje o boleto?” não são pedidos de saída.',
          )}
        </>
      ),
      output: items(data.events, 'Sem saída ainda.', (e) => chip(e.status === 'REVIEW' ? 'REVIEW' : e.classification)),
    },
    optout: {
      input: items(optOutEvents, 'Nenhum descadastro.'),
      params: param(
        'Ação',
        'Registra o pedido e revoga o consentimento em toda a organização. A entrega ao Esfera usa uma fila durável, mesmo sem campanha publicada.',
      ),
      output: items(optOutEvents, 'Nenhum descadastro.', () => chip('OPT_OUT')),
    },
    review: {
      input: items(reviewEvents, 'Nada aguardando revisão.', (e) =>
        role !== 'viewer' ? (
          <div className="n8n-actions-row">
            <Button variant="primary" disabled={busy} onClick={() => resolve(e, 'CONFIRM')}>
              Confirmar descadastro
            </Button>
            <Button disabled={busy} onClick={() => resolve(e, 'DISMISS')}>
              Descartar
            </Button>
          </div>
        ) : null,
      ),
      params: param(
        'Regra',
        'Mensagens com intenção de sair, mas não inequívocas, esperam uma pessoa. Confirmar aplica o mesmo bloqueio e a mesma confirmação ao devedor. Pedidos anteriores à ativação nunca recebem confirmação.',
      ),
      output: items(
        data.events.filter((e) => e.status === 'DISMISSED'),
        'Os confirmados seguem para “Registrar no Esfera”.',
        () => chip('DISMISSED'),
      ),
    },
    other: {
      input: <p className="n8n-empty">{other} mensagens sem pedido de saída.</p>,
      params: param('Ação', 'Nenhuma. A mensagem segue apenas o roteamento normal já configurado.'),
      output: <p className="n8n-empty">Esta etapa encerra o fluxo.</p>,
    },
    esfera: {
      input: items(optOutEvents, 'Nada para registrar.'),
      params: (
        <>
          {param('Método e endereço', <code>POST {data.esferaEndpoint ?? 'link do Esfera não configurado'}</code>)}
          {param('Autenticação', 'Token da empresa, guardado no servidor (nunca aparece na tela).')}
          {param(
            'Entrega',
            'Confirmação obrigatória do Esfera; novas tentativas com espera crescente. Tem prioridade sobre a confirmação ao devedor.',
          )}
        </>
      ),
      output: items(data.events, 'Nada registrado ainda.', (e) => (
        <>
          {chip(e.status)}
          {e.errorCode && <small className="n8n-error">{e.errorCode}</small>}
        </>
      )),
    },
    confirm: {
      input: items(
        data.events.filter((e) => e.status === 'DELIVERED'),
        'Nenhum descadastro registrado no Esfera.',
      ),
      params: (
        <>
          {param(
            'Situação',
            <>
              <strong>{data.confirmationEnabled ? 'Ligada' : 'Desligada'}</strong> ·{' '}
              {data.allowlist.length ? `somente ${data.allowlist.join(', ')}` : 'todos os números'}
            </>,
          )}
          {param('Ativada em', `${when(data.activatedAt)} · pedidos anteriores não recebem`)}
          {param('Texto (aprovado pelo jurídico)', <blockquote className="n8n-quote">{data.confirmationText}</blockquote>)}
          {param(
            'Regras',
            'Uma vez por número, pela mesma conexão que recebeu o SAIR, depois que o Esfera confirmar. Nunca por conexão em quarentena. Envio incerto não é repetido, para evitar mensagem duplicada.',
          )}
        </>
      ),
      output: items(
        data.events.filter((e) => e.confirmation.status !== 'NOT_APPLICABLE'),
        'Nenhuma confirmação desde a ativação.',
        (e) => (
          <>
            {chip(e.confirmation.status)}
            <small className="n8n-meta">{when(e.confirmation.sentAt ?? e.confirmation.updatedAt)}</small>
            {e.confirmation.errorCode && <small className="n8n-error">{e.confirmation.errorCode}</small>}
          </>
        ),
      ),
    },
  };
  const current = open ? steps[open] : undefined;
  const CurrentIcon = current?.icon;

  return (
    <section className="n8n-flow" aria-label="Fluxo do sistema: descadastro (SAIR)">
      <header className="n8n-topbar">
        <nav className="n8n-crumbs" aria-label="Caminho">
          <Link href={`/projetos/${projectId}`}>{data.project.name}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <h1>Descadastro automático (SAIR)</h1>
          <span className="n8n-tag">
            <LockKeyhole size={11} aria-hidden="true" /> Sistema
          </span>
        </nav>
        <div className="n8n-modes" role="tablist" aria-label="Modo de exibição">
          <button role="tab" aria-selected={mode === 'editor'} onClick={() => setMode('editor')}>
            Editor
          </button>
          <button role="tab" aria-selected={mode === 'runs'} onClick={() => setMode('runs')}>
            Execuções <span>{data.events.length}</span>
          </button>
        </div>
        <div className="n8n-top-actions">
          <span className="n8n-active" title="Fluxo do sistema: fica ativo enquanto o worker do VEXOR estiver rodando">
            <span className="n8n-switch" aria-hidden="true" /> Ativo
          </span>
          <Button onClick={load}>
            <RefreshCw size={14} /> Atualizar
          </Button>
        </div>
      </header>
      {error && (
        <div role="alert" className="n8n-alert">
          {error} <Button onClick={load}>Tentar novamente</Button>
        </div>
      )}
      {mode === 'editor' ? (
        <div className="n8n-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            deleteKeyCode={null}
            onNodeClick={(_, node) => setOpen(node.id)}
            onInit={(instance) => {
              flow.current = instance;
              // Enquadra de novo depois do layout final (no celular a barra superior quebra em duas linhas).
              setTimeout(() => instance.fitView({ padding: 0.22 }), 120);
            }}
            minZoom={0.1}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#cbc7d6" />
            <Controls position="bottom-left" orientation="horizontal" showInteractive={false} />
          </ReactFlow>
          <div className="n8n-canvas-hint">
            <MousePointerClick size={14} aria-hidden="true" /> Clique numa etapa para ver a configuração e os dados
            reais · atualiza a cada 5 s
          </div>
        </div>
      ) : (
        <div className="n8n-executions">
          {data.events.length ? (
            <table>
              <thead>
                <tr>
                  <th>Recebido</th>
                  <th>Número</th>
                  <th>Mensagem</th>
                  <th>Esfera</th>
                  <th>Confirmação ao devedor</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.receivedAt)}</td>
                    <td>{e.phone}</td>
                    <td>“{e.excerpt}”</td>
                    <td>
                      {chip(e.status)}
                      {e.errorCode && <small>{e.errorCode}</small>}
                    </td>
                    <td>
                      {chip(e.confirmation.status)}
                      {e.confirmation.sentAt && <small>{when(e.confirmation.sentAt)}</small>}
                      {e.confirmation.errorCode && <small>{e.confirmation.errorCode}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="n8n-empty">Nenhuma execução ainda. Um SAIR recebido aparece aqui depois do processamento.</p>
          )}
        </div>
      )}
      {current && open && CurrentIcon && (
        <div
          className="n8n-ndv-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <div className="n8n-ndv">
            <header className="n8n-ndv-head">
              <button className="n8n-ndv-back" onClick={() => setOpen(null)}>
                <ArrowLeft size={16} /> Voltar ao canvas
              </button>
              <span className="n8n-ndv-icon" style={{ '--tone': current.tone } as CSSProperties}>
                <CurrentIcon size={18} />
              </span>
              <h2>{current.title}</h2>
              <span className="n8n-tag">
                <LockKeyhole size={11} aria-hidden="true" /> Somente leitura
              </span>
              <button className="n8n-ndv-close" aria-label="Fechar" onClick={() => setOpen(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="n8n-ndv-body">
              <section className="n8n-ndv-pane" aria-label="Entrada">
                <h3>Entrada</h3>
                {panes[open].input}
              </section>
              <section className="n8n-ndv-pane n8n-ndv-params" aria-label="Parâmetros">
                <h3>Parâmetros</h3>
                {panes[open].params}
              </section>
              <section className="n8n-ndv-pane" aria-label="Saída">
                <h3>Saída</h3>
                {panes[open].output}
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Cartão do fluxo do SAIR na página de Execuções: as execuções dele também aparecem ali.
export function SystemOptOutRunsCard({ projectId }: { projectId?: string }) {
  const [info, setInfo] = useState<{ id: string; total: number; last: string | null }>();
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id =
          projectId ?? (await api<{ id: string; archivedAt: string | null }[]>('/projects')).find((p) => !p.archivedAt)?.id;
        if (!id) return;
        const state = await api<State>(`/projects/${id}/system-opt-out`);
        if (active) setInfo({ id, total: state.events.length, last: state.events[0]?.receivedAt ?? null });
      } catch {
        /* sem cartão quando a API não responde; a lista principal mostra o erro */
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);
  if (!info) return null;
  return (
    <article className="project-flows project-flows-system">
      <div className="project-flow project-flow-system">
        <div className="project-flow-name">
          <Send size={19} aria-hidden="true" />
          <div>
            <Link href={`/projetos/${info.id}?tab=descadastro&view=runs`}>Descadastro automático (SAIR)</Link>
            <span>
              Fluxo do sistema · {info.total} {info.total === 1 ? 'execução recente' : 'execuções recentes'}
              {info.last ? ` · última em ${when(info.last)}` : ''}
            </span>
          </div>
        </div>
        <span className="project-status project-status-published">
          <LockKeyhole size={11} aria-hidden="true" /> Sistema
        </span>
        <div className="project-flow-actions">
          <span className="flow-active">Ativo</span>
          <Link className="btn" href={`/projetos/${info.id}?tab=descadastro&view=runs`}>
            Ver execuções
          </Link>
        </div>
      </div>
    </article>
  );
}
