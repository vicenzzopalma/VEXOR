'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useReactFlow,
  reconnectEdge,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useStore,
  type Edge,
  type EdgeProps,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Cloud,
  Download,
  GitBranch,
  GripVertical,
  History,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Rocket,
  Search,
  Share2,
  StepForward,
  Trash2,
  Undo2,
  Workflow,
  X,
} from 'lucide-react';
import {
  catalog,
  blockTypes,
  triggerTypes,
  configSchemas,
  sampleLead,
  leadSchema,
  validateWorkflow,
  type BlockType,
  type Lead,
  type SimulationResult,
  type Workflow as WorkflowModel,
  type WorkflowNode,
} from '@eimax/workflow-schema';
import {
  api,
  ApiError,
  type ActivationError,
  type ActivationState,
  type ExecutionRecord,
  type WorkflowRecord as WorkflowRecordLite,
} from '@/lib/api';
import { Button, Dialog, Loading } from './ui';
import { blockIcons } from './icons';
import { WorkflowBlock, type FlowNode, type NodeRunState } from './workflow-node';
import { Inspector } from './inspector';
import { useEditorState } from './editor-state';
import { RunLog } from './run-log';
import { NodeDetailBody, detailShortcut, stepStatusLabel } from './node-data-view';
import { ActivationErrorBanner, ActivationSwitch } from './workflow-activation';
import { WorkflowRuns } from './workflow-runs';

/** Resultado de simulação; com `targetNodeId`, foi um "Testar até este bloco". */
type SimRun = SimulationResult & { targetNodeId?: string; reachedTarget?: boolean };

const nodeTypes = { workflow: WorkflowBlock };
/** Tamanho do bloco no canvas e espaço horizontal entre colunas (rótulos de ligação e de saída cabem no vão). */
const NODE_SIZE = 100;
const NODE_GAP = 140;
const NODE_STEP = NODE_SIZE + NODE_GAP;
const itemsLabel = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;

type LinkData = {
  label: string;
  live: boolean;
  count: number;
  editable: boolean;
  hovered: boolean;
  onHover: (edgeId?: string) => void;
  onInsert: (edgeId: string) => void;
  onDelete: (edgeId: string) => void;
};
type LinkEdge = Edge<LinkData, 'link'>;

/** Ligação com seta, contagem de itens percorridos e ações de inserir e excluir ao passar o mouse ou selecionar. */
function LinkEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<LinkEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const live = !!data?.live;
  const tools = !!data?.editable && (data.hovered || !!selected);
  // Rótulo e botões mantêm o tamanho na tela quando o canvas está afastado (zoom < 100%).
  const zoom = useStore((store) => store.transform[2]);
  const scale = zoom > 0 && zoom < 1 ? 1 / zoom : 1;
  const count = live ? (data?.count ?? 0) : 0;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`vx-edge-path${live ? ' is-live' : ''}`}
        interactionWidth={25}
      />
      <path
        className={`vx-edge-arrow${live ? ' is-live' : ''}${selected ? ' is-selected' : ''}`}
        d={`M ${targetX - 10} ${targetY - 5.5} L ${targetX - 1} ${targetY} L ${targetX - 10} ${targetY + 5.5} Z`}
      />
      {(tools || count > 0) && data && (
        <EdgeLabelRenderer>
          <div
            className="vx-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(${scale})`,
            }}
            onMouseEnter={() => data.onHover(id)}
            onMouseLeave={() => data.onHover(undefined)}
          >
            {count > 0 && (
              <span className="vx-edge-count" data-testid={`edge-count-${id}`}>
                {itemsLabel(count)}
              </span>
            )}
            {tools && (
              <span className="vx-edge-tools" role="group" aria-label={`Ações da ${data.label}`}>
                <button
                  type="button"
                  aria-label={`Inserir bloco na ${data.label}`}
                  title="Inserir bloco aqui"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onInsert(id);
                  }}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={`Excluir ${data.label}`}
                  title="Excluir ligação"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onDelete(id);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { link: LinkEdgeView };

/** Desce a partir de `start` até achar um lugar sem outro bloco por perto. */
function freeSpot(nodes: WorkflowNode[], start: { x: number; y: number }) {
  const spot = { ...start };
  const taken = () =>
    nodes.some(
      (n) =>
        Math.abs(n.position.x - spot.x) < NODE_SIZE + 40 && Math.abs(n.position.y - spot.y) < NODE_SIZE + 50,
    );
  for (let tries = 0; taken() && tries < 50; tries++) spot.y += NODE_SIZE + 70;
  return spot;
}
/** Celular, toque ou tela estreita: enquadrar com zoom legível em vez de mostrar o fluxo inteiro minúsculo. */
const isCompact = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 700px)').matches;
/** Devolve o foco ao bloco indicado ou à área do canvas depois de uma ação que remove o elemento focado. */
const focusCanvas = (nodeId?: string) =>
  setTimeout(() => {
    const target = nodeId
      ? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)
      : document.querySelector<HTMLElement>('.canvas-area');
    target?.focus({ preventScroll: true });
  }, 60);

/** Seletor rápido de blocos para inserir entre dois blocos ligados. */
function InsertPicker({
  sourceName,
  targetName,
  onPick,
  onClose,
}: {
  sourceName: string;
  targetName: string;
  onPick: (type: BlockType) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const items = blockTypes.filter(
    (t) =>
      !triggerTypes.includes(t) &&
      `${catalog[t].name} ${catalog[t].description}`
        .toLocaleLowerCase('pt-BR')
        .includes(term.toLocaleLowerCase('pt-BR')),
  );
  return (
    <Dialog title="Inserir bloco na ligação" onClose={onClose}>
      <p className="muted">
        O novo bloco entra entre “{sourceName}” e “{targetName}”, e as ligações são refeitas.
      </p>
      <div className="search-input">
        <Search size={15} />
        <input
          aria-label="Buscar bloco para inserir"
          placeholder="Buscar blocos…"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <div className="vx-insert-list">
        {items.map((type) => {
          const meta = catalog[type];
          const Icon = blockIcons[type];
          return (
            <button
              key={type}
              type="button"
              className="library-block"
              aria-label={`Inserir ${meta.name}`}
              onClick={() => onPick(type)}
            >
              <span className={`block-icon color-${meta.color}`}>
                <Icon size={18} />
              </span>
              <span>
                <strong>{meta.name}</strong>
                <small>{meta.description}</small>
              </span>
            </button>
          );
        })}
        {!items.length && <p className="empty-search">Nenhum bloco encontrado para “{term}”.</p>}
      </div>
    </Dialog>
  );
}
const saveLabels = {
  saved: 'Tudo salvo',
  dirty: 'Alterações pendentes',
  saving: 'Salvando…',
  error: 'Tentar salvar',
  conflict: 'Conflito de edição',
};
const uid = () => crypto.randomUUID();
export function Editor({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <EditorWorkspace key={id} id={id} />
    </ReactFlowProvider>
  );
}
function EditorWorkspace({ id }: { id: string }) {
  const state = useEditorState(id);
  const { flow, change } = state;
  const rf = useReactFlow<FlowNode>();
  const router = useRouter();
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);
  const [selected, setSelected] = useState<string[]>(['qualify']);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [library, setLibrary] = useState(false);
  const [inspector, setInspector] = useState(true);
  const [detailNodeId, setDetailNodeId] = useState<string>();
  const [detailSource, setDetailSource] = useState('');
  const [modal, setModal] = useState<'simulate' | 'publish' | 'versions' | 'help' | undefined>();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [lead, setLead] = useState<Lead>({ ...sampleLead });
  const [run, setRun] = useState<SimRun>();
  // Abas Editor | Execuções; a URL reflete a aba (?view=runs).
  const searchParams = useSearchParams();
  const urlView = searchParams.get('view') === 'runs' ? 'runs' : 'editor';
  const [view, setViewState] = useState<'editor' | 'runs'>(urlView);
  // Voltar/avançar do navegador ou um link com ?view=runs também trocam a aba.
  useEffect(() => setViewState(urlView), [urlView]);
  const setView = useCallback((next: 'editor' | 'runs') => {
    setViewState(next);
    const url = new URL(window.location.href);
    if (next === 'runs') url.searchParams.set('view', 'runs');
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  // Execução escolhida na aba Execuções (pode não estar entre as 50 mais recentes do canvas).
  const [pickedRun, setPickedRun] = useState<ExecutionRecord>();
  const [activating, setActivating] = useState(false);
  const [hiddenActivationError, setHiddenActivationError] = useState('');
  const [testingNode, setTestingNode] = useState<string>();
  const [testNote, setTestNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string }>();
  // Os blocos memorizados chamam sempre a versão atual (lead e detalhe abertos podem ter mudado).
  const testUntilRef = useRef<(nodeId: string) => Promise<void>>(async () => {});
  // O aviso do teste parcial pertence ao bloco aberto no detalhe.
  useEffect(() => setTestNote(undefined), [detailNodeId]);
  const [showRun, setShowRun] = useState(false);
  const [realRuns, setRealRuns] = useState<ExecutionRecord[]>([]);
  const [realRunId, setRealRunId] = useState<string>();
  const [realRunError, setRealRunError] = useState('');
  const [realRunsLoaded, setRealRunsLoaded] = useState(false);
  const realRunsSignature = useRef('');
  // Origem padrão do detalhe aberto antes da primeira resposta da lista de execuções.
  const pendingDetailSource = useRef(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<ExecutionRecord[]>(`/workflows/${id}/executions`)
        .then((rows) => {
          if (active) {
            // A lista é consultada a cada 2 s; só troca a referência quando algo mudou de fato, para o
            // detalhe do bloco não refazer serialização, tabela e esquema sem necessidade.
            const signature = JSON.stringify(
              rows.map((r) => [
                r.id,
                r.status,
                r.attempt,
                r.stepsCount,
                r.steps?.length,
                r.finishedAt,
                r.errorCode,
                r.checkpoints?.map((c) => c.status),
              ]),
            );
            if (signature !== realRunsSignature.current) {
              realRunsSignature.current = signature;
              setRealRuns(rows);
            }
            setRealRunError('');
            setRealRunsLoaded(true);
          }
        })
        .catch((error) => {
          if (active) {
            setRealRunError(error.message);
            setRealRunsLoaded(true);
          }
        });
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  const [execution, setExecution] = useState<Record<string, string>>({});
  // A simulação desta sessão pinta o canvas até o usuário limpar ou escolher uma execução real.
  const [simPainted, setSimPainted] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<string>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hover = useCallback((edgeId?: string) => {
    clearTimeout(hoverTimer.current);
    if (edgeId) setHoverEdge(edgeId);
    else hoverTimer.current = setTimeout(() => setHoverEdge(undefined), 500);
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const [insertEdge, setInsertEdge] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const [hand, setHand] = useState(false);
  const [showTip, setShowTip] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem('eimax_hide_tip') === 'true') setShowTip(false);
    } catch {}
  }, []);
  const dismissTip = () => {
    setShowTip(false);
    try {
      localStorage.setItem('eimax_hide_tip', 'true');
    } catch {}
  };
  const [snapshot, setSnapshot] = useState<{ number: number; snapshot: WorkflowModel }>();
  const playback = useRef(0);
  const readOnly = state.role === 'viewer' || state.archived;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(
    () => () => {
      playback.current++;
    },
    [],
  );
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (
        !anchor ||
        anchor.origin !== location.origin ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self') ||
        state.saveStatus === 'saved'
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const destination = `${anchor.pathname}${anchor.search}${anchor.hash}`;
      state
        .save()
        .then(() => router.push(destination))
        .catch((error) => {
          state.setError(error.message);
          // A failed save (conflict, validation, network) must never trap the user in the editor.
          if (
            window.confirm(
              `Não foi possível salvar: ${error.message}\n\nSair mesmo assim e descartar as alterações não salvas?`,
            )
          )
            router.push(destination);
        });
    };
    document.addEventListener('click', navigate, true);
    return () => document.removeEventListener('click', navigate, true);
  }, [state.saveStatus, state.save, state.setError, router]);
  const issues = useMemo(() => (flow ? validateWorkflow(flow) : []), [flow]);
  const activeNode = flow?.nodes.find((n) => n.id === selected[0]);
  const detailNode = flow?.nodes.find((n) => n.id === detailNodeId);
  const findReal = (runId?: string) =>
    runId ? (realRuns.find((r) => r.id === runId) ?? (pickedRun?.id === runId ? pickedRun : undefined)) : undefined;
  const detailRun = detailSource === 'simulation' ? run : findReal(detailSource);
  const shownReal = findReal(realRunId);
  /**
   * Estado de cada bloco e ramo tomado por cada condição, vindos da execução real escolhida
   * (prioridade) ou da simulação desta sessão. Sem execução escolhida, o canvas fica neutro.
   */
  // Versão publicada usada pela execução real: blocos que não existiam nela não são "não percorridos".
  const runVersion = shownReal?.versionId
    ? state.versions.find((v) => v.id === shownReal.versionId)
    : undefined;
  const [versionNodes, setVersionNodes] = useState<{ number: number; ids: string[] }>();
  useEffect(() => {
    if (!runVersion) return;
    let active = true;
    api<{ number: number; snapshot: WorkflowModel }>(`/workflows/${id}/versions/${runVersion.number}`)
      .then((row) => {
        if (active) setVersionNodes({ number: row.number, ids: row.snapshot.nodes.map((n) => n.id) });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, runVersion]);
  const versionNote = !shownReal?.versionId
    ? ''
    : !runVersion
      ? ' · versão desconhecida'
      : runVersion.id === state.versions[0]?.id
        ? ` · versão ${runVersion.number}`
        : ` · versão ${runVersion.number}, anterior à mais recente`;
  const canvasRun = useMemo(() => {
    const states: Record<string, NodeRunState> = {};
    const branches: Record<string, string> = {};
    if (shownReal) {
      const waitingNode =
        shownReal.status === 'SUSPENDED'
          ? (shownReal.checkpoints?.at(-1)?.nodeId ??
            shownReal.steps.filter((s) => s.nodeType === 'wait').at(-1)?.nodeId)
          : undefined;
      for (const step of shownReal.steps) {
        const status = String(step.status).toLowerCase();
        const state: NodeRunState | undefined =
          step.nodeId === waitingNode
            ? 'waiting'
            : status === 'success' || status === 'completed'
              ? 'success'
              : status === 'failed'
                ? 'failed'
                : status === 'skipped'
                  ? 'skipped'
                  : status === 'running'
                    ? 'running'
                    : undefined;
        if (state) states[step.nodeId] = state;
        if (typeof step.output?.branch === 'string') branches[step.nodeId] = step.output.branch;
      }
      // Execução encerrada: blocos sem etapa registrada não foram percorridos, desde que existissem
      // na versão executada (sem a lista dessa versão, nenhum bloco é marcado por suposição).
      const existed = !shownReal.versionId
        ? () => true
        : runVersion && versionNodes?.number === runVersion.number
          ? (nodeId: string) => versionNodes.ids.includes(nodeId)
          : () => false;
      if (['COMPLETED', 'FAILED'].includes(shownReal.status))
        flow?.nodes.forEach((n) => existed(n.id) && (states[n.id] ??= 'skipped'));
      return { source: 'real' as const, states, branches };
    }
    if (simPainted && run) {
      Object.entries(execution).forEach(([nodeId, status]) => (states[nodeId] = status as NodeRunState));
      run.steps.forEach((step) => {
        if (typeof step.output?.branch === 'string') branches[step.nodeId] = step.output.branch;
      });
      return { source: 'simulation' as const, states, branches };
    }
    return undefined;
  }, [shownReal, simPainted, run, execution, flow, runVersion, versionNodes]);
  const clearCanvasRun = () => {
    playback.current++;
    setRealRunId(undefined);
    setSimPainted(false);
    setExecution({});
  };
  const openNode = useCallback(
    (nodeId: string) => {
      setSelected([nodeId]);
      setSelectedEdges([]);
      setInspector(true);
      setDetailNodeId(nodeId);
      setDetailSource(realRunId ?? (run ? 'simulation' : (realRuns[0]?.id ?? '')));
      pendingDetailSource.current = !realRunId && !run && !realRunsLoaded;
    },
    [run, realRuns, realRunId, realRunsLoaded],
  );
  useEffect(() => {
    if (!realRunsLoaded || !pendingDetailSource.current) return;
    pendingDetailSource.current = false;
    setDetailSource((current) => current || (realRuns[0]?.id ?? ''));
  }, [realRunsLoaded, realRuns]);
  const removeItems = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      change((f) => ({
        ...f,
        nodes: f.nodes.filter((n) => !nodeIds.includes(n.id)),
        edges: f.edges.filter(
          (e) => !nodeIds.includes(e.source) && !nodeIds.includes(e.target) && !edgeIds.includes(e.id),
        ),
      }));
      setSelected((previous) => previous.filter((id) => !nodeIds.includes(id)));
      setSelectedEdges((previous) => previous.filter((id) => !edgeIds.includes(id)));
    },
    [change],
  );
  const remove = useCallback(
    () => removeItems(selected, selectedEdges),
    [removeItems, selected, selectedEdges],
  );
  const duplicateNodes = useCallback(
    (ids: string[]) => {
      if (!flow || !ids.length) return;
      const map = new Map(ids.map((n) => [n, uid()]));
      const originals = flow.nodes.filter((n) => ids.includes(n.id));
      // Uma cópia vai para o próximo lugar livre à direita; um grupo vai inteiro para a direita do grupo.
      const groupShift =
        Math.max(...originals.map((n) => n.position.x)) -
        Math.min(...originals.map((n) => n.position.x)) +
        NODE_STEP;
      const copies = originals.map((n) => ({
        ...structuredClone(n),
        id: map.get(n.id)!,
        name: `${n.name} (cópia)`,
        position:
          originals.length === 1
            ? freeSpot(flow.nodes, { x: n.position.x + NODE_STEP, y: n.position.y })
            : { x: n.position.x + groupShift, y: n.position.y },
      }));
      change((f) => ({
        ...f,
        nodes: [...f.nodes, ...copies],
        edges: [
          ...f.edges,
          ...f.edges
            .filter((e) => map.has(e.source) && map.has(e.target))
            .map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! })),
        ],
      }));
      setSelected(copies.map((n) => n.id));
      setSelectedEdges([]);
    },
    [flow, change],
  );
  const duplicate = useCallback(() => duplicateNodes(selected), [duplicateNodes, selected]);
  const deleteEdge = useCallback(
    (edgeId: string) => {
      removeItems([], [edgeId]);
      setHoverEdge(undefined);
      focusCanvas();
      setToast('Ligação excluída. Você pode desfazer esta ação.');
    },
    [removeItems],
  );
  const nodes: FlowNode[] = useMemo(
    () =>
      (flow?.nodes ?? []).map((block) => ({
        id: block.id,
        type: 'workflow',
        position: block.position,
        measured: dimensions[block.id],
        data: {
          block,
          execution: canvasRun?.states[block.id],
          invalid: !configSchemas[block.type].safeParse(block.config).success,
          readOnly,
          testing: testingNode === block.id,
          onTestUntil: () => void testUntilRef.current(block.id),
          onOpen: () => openNode(block.id),
          onDuplicate: () => duplicateNodes([block.id]),
          onDelete: () => {
            removeItems([block.id], []);
            focusCanvas();
          },
        },
        selected: selected.includes(block.id),
      })),
    [flow, selected, canvasRun, dimensions, openNode, readOnly, duplicateNodes, removeItems, testingNode],
  );
  const edges: LinkEdge[] = useMemo(() => {
    const names = new Map((flow?.nodes ?? []).map((n) => [n.id, n]));
    // Uma ligação conta como percorrida quando a origem concluiu, o destino foi alcançado e,
    // numa condição, o ramo registrado na saída é o desta ligação. Cada execução leva um lead (1 item).
    const traversed = (e: { source: string; target: string; branch?: string }) => {
      if (!canvasRun) return false;
      if (canvasRun.states[e.source] !== 'success') return false;
      if (!['success', 'failed', 'waiting', 'running'].includes(canvasRun.states[e.target] ?? ''))
        return false;
      const taken = canvasRun.branches[e.source];
      if (names.get(e.source)?.type === 'condition' && taken !== undefined) return e.branch === taken;
      return true;
    };
    return (flow?.edges ?? []).map((e) => {
      const label = `ligação de ${names.get(e.source)?.name ?? 'origem'} para ${names.get(e.target)?.name ?? 'destino'}`;
      const live = traversed(e);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.branch ?? null,
        type: 'link' as const,
        ariaLabel: label.charAt(0).toUpperCase() + label.slice(1),
        selected: selectedEdges.includes(e.id),
        reconnectable: !readOnly,
        data: {
          label,
          live,
          count: live ? 1 : 0,
          editable: !readOnly,
          hovered: hoverEdge === e.id,
          onHover: hover,
          onInsert: setInsertEdge,
          onDelete: deleteEdge,
        },
      };
    });
  }, [flow, selectedEdges, readOnly, canvasRun, hoverEdge, hover, deleteEdge]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        modal ||
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        readOnly ||
        (e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'd', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'z') {
          if (e.shiftKey) state.redo();
          else state.undo();
        }
        if (e.key.toLowerCase() === 'y') state.redo();
        if (e.key.toLowerCase() === 'd') duplicate();
        if (e.key.toLowerCase() === 's')
          state
            .save()
            .then(() => setToast('Alterações salvas no servidor.'))
            .catch(() => {});
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      }
      if (e.key === 'Escape') {
        setSelected([]);
        setSelectedEdges([]);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [modal, readOnly, state.undo, state.redo, state.save, duplicate, remove]);
  const validConnection = useCallback(
    (connection: Connection | Edge, excludeId?: string) => {
      if (!flow || !connection.source || !connection.target || connection.source === connection.target)
        return false;
      const target = flow.nodes.find((n) => n.id === connection.target);
      if (!target || triggerTypes.includes(target.type)) return false;
      const other = flow.edges.filter((e) => e.id !== excludeId);
      if (
        other.some(
          (e) => e.source === connection.source && (e.branch ?? null) === (connection.sourceHandle ?? null),
        )
      )
        return false;
      const visited = new Set<string>();
      const reaches = (id: string): boolean => {
        if (id === connection.source) return true;
        if (visited.has(id)) return false;
        visited.add(id);
        return other.filter((e) => e.source === id).some((e) => reaches(e.target));
      };
      return !reaches(connection.target);
    },
    [flow],
  );
  const connect = (c: Connection) => {
    if (!validConnection(c)) {
      setToast('Conexão inválida. Verifique as saídas e evite ciclos.');
      return;
    }
    change((f) => ({
      ...f,
      edges: [
        ...f.edges,
        {
          id: uid(),
          source: c.source,
          target: c.target,
          ...(c.sourceHandle ? { branch: c.sourceHandle as 'true' | 'false' } : {}),
        },
      ],
    }));
  };
  const reconnect = (old: Edge, connection: Connection) => {
    if (!validConnection(connection, old.id)) {
      setToast('Não foi possível reconectar: a saída já está ocupada ou criaria um ciclo.');
      return;
    }
    const next = reconnectEdge(old, connection, edges, { shouldReplaceId: false });
    change((f) => ({
      ...f,
      edges: next.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { branch: e.sourceHandle as 'true' | 'false' } : {}),
      })),
    }));
  };
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const sizes = changes.filter((c) => c.type === 'dimensions');
    if (sizes.length)
      setDimensions((previous) => {
        const next = { ...previous };
        let changed = false;
        sizes.forEach((c) => {
          if (
            c.dimensions &&
            (next[c.id]?.width !== c.dimensions.width || next[c.id]?.height !== c.dimensions.height)
          ) {
            next[c.id] = c.dimensions;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    const selections = changes.filter((c) => c.type === 'select');
    if (selections.length)
      setSelected((previous) => {
        const next = new Set(previous);
        selections.forEach((c) => (c.selected ? next.add(c.id) : next.delete(c.id)));
        return [...next];
      });
    const positions = changes.filter((c) => c.type === 'position');
    if (positions.length)
      change(
        (f) => ({
          ...f,
          nodes: f.nodes.map((n) => {
            const c = positions.find((c) => c.id === n.id);
            return c?.position ? { ...n, position: c.position } : n;
          }),
        }),
        false,
      );
  };
  const addBlock = (type: BlockType, position?: { x: number; y: number }) => {
    if (readOnly || !flow) return;
    if (flow.nodes.length >= 100) {
      setToast('O limite desta fase é de 100 blocos por processo.');
      return;
    }
    const bounds = document.querySelector('.canvas-area')?.getBoundingClientRect();
    const spot = position ? undefined : nextFreeSpot();
    const p =
      position ??
      spot ??
      rf.screenToFlowPosition({
        x: (bounds?.left ?? 350) + (bounds?.width ?? 700) / 2,
        y: (bounds?.top ?? 150) + (bounds?.height ?? 600) / 2,
      });
    if (spot)
      setTimeout(
        () =>
          rf.setCenter(spot.x + NODE_SIZE / 2, spot.y + NODE_SIZE / 2, { zoom: rf.getZoom(), duration: 200 }),
        30,
      );
    const block: WorkflowNode = {
      id: uid(),
      type,
      name: catalog[type].name,
      description: '',
      config: { ...catalog[type].defaults },
      position: p,
    };
    change((f) => ({ ...f, nodes: [...f.nodes, block] }));
    setSelected([block.id]);
    setInspector(true);
    setLibrary(false);
    setToast('Bloco adicionado. Conecte-o ao seu processo.');
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/eimax-block') as BlockType;
    if (blockTypes.includes(type)) addBlock(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };
  /** Próxima posição livre à direita do bloco selecionado ou, sem seleção, do bloco mais à direita. */
  function nextFreeSpot() {
    if (!flow?.nodes.length) return undefined;
    const anchor =
      flow.nodes.find((n) => n.id === selected.at(-1)) ??
      flow.nodes.reduce((a, b) => (b.position.x > a.position.x ? b : a));
    return freeSpot(flow.nodes, { x: anchor.position.x + NODE_STEP, y: anchor.position.y });
  }
  /** Enquadramento: fluxo inteiro no desktop; no celular, começa pelo gatilho com zoom mínimo legível. */
  /**
   * Enquadramento: fluxo inteiro no desktop; no celular/toque, zoom mínimo legível (60%) com o
   * gatilho encostado à esquerda; o restante se alcança arrastando o canvas.
   */
  function frame(duration = 0) {
    if (!flow?.nodes.length || !isCompact()) {
      void rf.fitView({ padding: 0.18, maxZoom: 0.95, duration });
      return;
    }
    const start = flow.nodes.find((n) => triggerTypes.includes(n.type)) ?? flow.nodes[0];
    const area = document.querySelector('.canvas-area')?.getBoundingClientRect();
    const width = area?.width ?? 330;
    const height = area?.height ?? 600;
    const zoom = Math.min(0.95, Math.max(0.6, width / (NODE_STEP * 2.6)));
    // Rascunho antigo, mais alto que largo (vertical): começa pelo topo, senão os blocos seguintes
    // ficam sob os controles de zoom; o fluxo horizontal fica centralizado na altura.
    const xs = flow.nodes.map((n) => n.position.x);
    const ys = flow.nodes.map((n) => n.position.y);
    const tall = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
    void rf.setViewport(
      {
        x: 36 - start.position.x * zoom,
        y: tall ? 64 - start.position.y * zoom : height / 2 - (start.position.y + NODE_SIZE / 2) * zoom,
        zoom,
      },
      { duration },
    );
  }
  /** Insere um bloco no meio de uma ligação: origem → novo → destino, abrindo espaço só se faltar. */
  const insertOnEdge = (edgeId: string, type: BlockType) => {
    setInsertEdge(undefined);
    if (readOnly || !flow) return;
    const edge = flow.edges.find((e) => e.id === edgeId);
    const source = flow.nodes.find((n) => n.id === edge?.source);
    const target = flow.nodes.find((n) => n.id === edge?.target);
    if (!edge || !source || !target) {
      setToast('Esta ligação não existe mais.');
      return;
    }
    if (flow.nodes.length >= 100) {
      setToast('O limite desta fase é de 100 blocos por processo.');
      return;
    }
    const position = { x: source.position.x + NODE_STEP, y: target.position.y };
    const shift = position.x + NODE_STEP - target.position.x;
    const pushed = new Set<string>();
    if (shift > 0) {
      const queue = [target.id];
      while (queue.length) {
        const current = queue.shift()!;
        if (pushed.has(current) || current === source.id) continue;
        pushed.add(current);
        flow.edges.filter((e) => e.source === current).forEach((e) => queue.push(e.target));
      }
    }
    const block: WorkflowNode = {
      id: uid(),
      type,
      name: catalog[type].name,
      description: '',
      config: { ...catalog[type].defaults },
      position,
    };
    change((f) => ({
      ...f,
      nodes: [
        ...f.nodes.map((n) =>
          pushed.has(n.id) ? { ...n, position: { x: n.position.x + shift, y: n.position.y } } : n,
        ),
        block,
      ],
      edges: [
        ...f.edges.filter((e) => e.id !== edge.id),
        { id: uid(), source: source.id, target: block.id, ...(edge.branch ? { branch: edge.branch } : {}) },
        {
          id: uid(),
          source: block.id,
          target: target.id,
          ...(type === 'condition' ? { branch: 'true' as const } : {}),
        },
      ],
    }));
    setSelected([block.id]);
    setSelectedEdges([]);
    setHoverEdge(undefined);
    setInspector(true);
    focusCanvas(block.id);
    setToast(
      `${catalog[type].name} inserido entre “${source.name}” e “${target.name}”.` +
        (type === 'condition' ? ' O destino ficou no ramo “Sim”; ligue o ramo “Não” para publicar.' : ''),
    );
  };
  /** Organiza da esquerda para a direita; com mais de um bloco selecionado, organiza só a seleção. */
  const autoLayout = () => {
    if (!flow || readOnly) return;
    // Só conta blocos que ainda existem (desfazer pode deixar ids de cópias removidas na seleção).
    const chosen = selected.filter((nodeId) => flow.nodes.some((n) => n.id === nodeId));
    const only = chosen.length > 1 ? new Set(chosen) : undefined;
    const targets = flow.nodes.filter((n) => !only || only.has(n.id));
    if (!targets.length) return;
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: NODE_GAP });
    // Altura inclui o nome abaixo do bloco; o ramo Sim entra antes do Não para ficar acima.
    targets.forEach((n) => graph.setNode(n.id, { width: NODE_SIZE, height: NODE_SIZE + 50 }));
    [...flow.edges]
      .sort((a, b) => (a.branch === 'false' ? 1 : 0) - (b.branch === 'false' ? 1 : 0))
      .filter((e) => !only || (only.has(e.source) && only.has(e.target)))
      .forEach((e) => graph.setEdge(e.source, e.target));
    dagre.layout(graph);
    const laid = targets.map((n) => {
      const p = graph.node(n.id);
      return { id: n.id, x: p.x - NODE_SIZE / 2, y: p.y - (NODE_SIZE + 50) / 2 };
    });
    // Mantém o canto superior esquerdo original do conjunto organizado.
    const originX = Math.min(...targets.map((n) => n.position.x));
    const originY = Math.min(...targets.map((n) => n.position.y));
    const minX = Math.min(...laid.map((p) => p.x));
    const minY = Math.min(...laid.map((p) => p.y));
    const next = new Map(
      laid.map((p) => [p.id, { x: Math.round(p.x - minX + originX), y: Math.round(p.y - minY + originY) }]),
    );
    change((f) => ({
      ...f,
      nodes: f.nodes.map((n) => (next.has(n.id) ? { ...n, position: next.get(n.id)! } : n)),
    }));
    setTimeout(() => frame(200), 30);
    setToast(
      only
        ? 'Seleção organizada da esquerda para a direita. Você pode desfazer esta ação.'
        : 'Blocos organizados da esquerda para a direita. Você pode desfazer esta ação.',
    );
  };
  const simulate = async () => {
    const parsed = leadSchema.safeParse(lead);
    if (!parsed.success) {
      state.setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    state.setError('');
    try {
      const revision = await state.save();
      const result = await api<SimulationResult>(`/workflows/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ revision, lead: parsed.data }),
      });
      setRun(result);
      setShowRun(false);
      setExecution({});
      setRealRunId(undefined);
      setSimPainted(true);
      setModal(undefined);
      const token = ++playback.current;
      for (const step of result.steps.filter((s) => s.status !== 'skipped')) {
        if (playback.current !== token) return;
        setExecution((p) => ({ ...p, [step.nodeId]: 'running' }));
        await new Promise((resolve) => setTimeout(resolve, 380));
        if (playback.current !== token) return;
        setExecution((p) => ({ ...p, [step.nodeId]: step.status }));
      }
      setExecution(Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status])));
      setShowRun(true);
      setToast('Simulação concluída e registrada no servidor.');
    } catch (error) {
      state.setError(
        error instanceof ApiError && error.issues.length
          ? error.issues.map((i) => i.message).join(' ')
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    state.setError('');
    try {
      const revision = await state.save();
      const version = await api<{ id: string; number: number; createdAt: string }>(
        `/workflows/${id}/publish`,
        { method: 'POST', body: JSON.stringify({ revision }) },
      );
      state.setVersions([version, ...state.versions.filter((v) => v.number !== version.number)]);
      setModal(undefined);
      setToast(
        state.activation.active
          ? `Versão ${version.number} publicada. O fluxo está ativo: os próximos eventos usam esta versão.`
          : `Versão ${version.number} publicada. O fluxo continua inativo; ative-o para receber eventos.`,
      );
    } catch (error) {
      state.setError(
        error instanceof ApiError && error.issues.length
          ? error.issues.map((i) => i.message).join(' ')
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  /** Abas com teclado: setas alternam, Home vai para Editor e End para Execuções. */
  const tabKeys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next =
      event.key === 'Home'
        ? 'editor'
        : event.key === 'End'
          ? 'runs'
          : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
            ? view === 'editor'
              ? 'runs'
              : 'editor'
            : undefined;
    if (!next) return;
    event.preventDefault();
    setView(next);
    document.getElementById(next === 'runs' ? 'editor-tab-runs' : 'editor-tab-editor')?.focus();
  };
  /** Testar até este bloco: simulação no servidor só até o bloco, com o lead de exemplo, sem efeitos externos. */
  const testUntil = async (nodeId: string) => {
    if (readOnly || testingNode) return;
    const target = flow?.nodes.find((n) => n.id === nodeId);
    const parsed = leadSchema.safeParse(lead);
    if (!parsed.success || !target) {
      setTestNote({ kind: 'error', text: parsed.success ? 'Bloco não encontrado.' : parsed.error.issues[0].message });
      return;
    }
    playback.current++;
    setTestingNode(nodeId);
    setTestNote(undefined);
    state.setError('');
    try {
      const revision = await state.save();
      const result = await api<SimRun>(`/workflows/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ revision, lead: parsed.data, targetNodeId: nodeId }),
      });
      setRun(result);
      setRealRunId(undefined);
      setExecution(Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status])));
      setSimPainted(true);
      setShowRun(false);
      if (detailNodeId) {
        pendingDetailSource.current = false;
        setDetailSource('simulation');
      }
      const failed = result.steps.find((s) => s.status === 'failed');
      const note = failed
        ? { kind: 'error' as const, text: `O teste parou com falha em “${failed.name}”: ${failed.message}` }
        : result.reachedTarget
          ? {
              kind: 'ok' as const,
              text: `Teste até “${target.name}” concluído com o lead de exemplo. Nada foi enviado.`,
            }
          : {
              kind: 'warn' as const,
              text: `O lead de exemplo seguiu outro caminho e não chegou a “${target.name}”. Ajuste o lead em Testar e tente de novo.`,
            };
      setTestNote(note);
      setToast(note.text);
    } catch (error) {
      const text =
        error instanceof ApiError && error.issues.length
          ? `${error.message} ${error.issues.map((i) => i.message).join(' ')}`
          : (error as Error).message;
      setTestNote({ kind: 'error', text });
      if (!detailNodeId) state.setError(text);
    } finally {
      setTestingNode(undefined);
    }
  };
  testUntilRef.current = testUntil;
  const published = state.versions.length > 0;
  const live = state.activation.active && published;
  const canToggle = !readOnly && state.activation.revision !== undefined;
  const activationDisabledReason = readOnly
    ? state.archived
      ? 'Fluxo arquivado: restaure antes de ativar.'
      : 'Somente proprietário ou editor pode ativar ou desativar.'
    : !published
      ? 'Publique uma versão para ativar este fluxo.'
      : undefined;
  /** Liga ou desliga o fluxo; um erro de ativação fica salvo no fluxo e aparece no cabeçalho. */
  const setActive = async (next: boolean) => {
    if (!canToggle || activating) return;
    setActivating(true);
    state.setError('');
    try {
      // Revisão própria do interruptor: o rascunho continua salvando com a revisão dele.
      const result = await api<ActivationState>(`/workflows/${id}/${next ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        body: JSON.stringify({ activationRevision: state.activation.revision }),
      });
      state.setActivation({
        active: result.active,
        error: result.activationError,
        revision: result.activationRevision,
      });
      setHiddenActivationError('');
      setToast(
        result.active
          ? `Fluxo ativo: a versão ${result.activeVersion?.number ?? ''} recebe eventos.`
          : 'Fluxo inativo: nenhum gatilho cria execuções até você ativá-lo de novo.',
      );
    } catch (error) {
      const saved = error instanceof ApiError ? (error.body.activationError as ActivationError | undefined) : undefined;
      const latest = error instanceof ApiError ? (error.body.workflow as ActivationState | undefined) : undefined;
      if (saved) {
        state.setActivation({ active: false, error: saved, revision: latest?.activationRevision });
        setHiddenActivationError('');
      } else {
        state.setError((error as Error).message);
        // Conflito: outra aba mudou o interruptor; atualiza o estado sem tocar no rascunho.
        if (error instanceof ApiError && error.status === 409)
          await api<WorkflowRecordLite>(`/workflows/${id}`)
            .then((row) =>
              state.setActivation({
                active: row.active ?? true,
                error: row.activationError ?? null,
                revision: row.activationRevision,
              }),
            )
            .catch(() => {});
      }
    } finally {
      setActivating(false);
    }
  };
  const activationError = state.activation.error;
  const activationErrorNode = activationError?.nodeId
    ? flow?.nodes.find((n) => n.id === activationError.nodeId)
    : undefined;
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vexor-rascunho.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  if (state.loading) return <Loading />;
  if (!flow)
    return (
      <div className="error-screen">
        <Workflow size={36} />
        <h1>Não foi possível abrir este processo</h1>
        <p>{state.error}</p>
        <Button onClick={() => location.reload()}>Tentar novamente</Button>
        <Link href="/processos">Voltar aos processos</Link>
      </div>
    );
  return (
    <main className="editor-page">
      <div className="editor-toolbar">
        <div className="process-heading">
          <Link
            href={state.project ? `/projetos/${state.project.id}` : '/'}
            className="back-button"
            aria-label="Voltar ao projeto"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <nav className="breadcrumb editor-breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Projetos</Link>
              <span>/</span>
              <Link href={state.project ? `/projetos/${state.project.id}` : '/'}>
                {state.project?.name ?? 'Projeto'}
              </Link>
              <span>/</span>
              <span aria-current="page">{flow.name}</span>
            </nav>
            <div className="process-title">
              <input
                aria-label="Nome do processo"
                value={flow.name}
                maxLength={200}
                disabled={readOnly}
                onChange={(e) => change((f) => ({ ...f, name: e.target.value }))}
              />
              <span className="draft-badge">{state.archived ? 'Arquivado' : 'Rascunho'}</span>
            </div>
          </div>
        </div>
        <div className="vx-modes editor-modes" role="tablist" aria-label="Modo de exibição">
          <button
            type="button"
            role="tab"
            id="editor-tab-editor"
            aria-controls="editor-panel"
            aria-selected={view === 'editor'}
            tabIndex={view === 'editor' ? 0 : -1}
            onClick={() => setView('editor')}
            onKeyDown={tabKeys}
          >
            Editor
          </button>
          <button
            type="button"
            role="tab"
            id="editor-tab-runs"
            aria-controls="editor-panel"
            aria-selected={view === 'runs'}
            tabIndex={view === 'runs' ? 0 : -1}
            onClick={() => setView('runs')}
            onKeyDown={tabKeys}
          >
            Execuções
          </button>
        </div>
        {state.activation.revision !== undefined && (
        <div className="editor-activation">
          <ActivationSwitch
            on={live}
            busy={activating}
            disabledReason={activationDisabledReason}
            onToggle={() => void setActive(!live)}
          />
        </div>
        )}
        <div className="editor-actions">
          <button
            className={`save-indicator save-${state.saveStatus}`}
            data-testid="save-status"
            data-status={state.saveStatus}
            aria-label={`Salvamento: ${saveLabels[state.saveStatus]}`}
            disabled={readOnly || state.saveStatus === 'saving'}
            title="Salvar alterações agora · Ctrl S"
            onClick={() => state.save().catch(() => {})}
          >
            {state.saveStatus === 'saving' ? (
              <LoaderCircle size={14} className="spin" />
            ) : state.saveStatus === 'saved' ? (
              <Cloud size={15} />
            ) : (
              <Cloud size={15} />
            )}
            <span>
              {
                {
                  saved: 'Tudo salvo',
                  dirty: 'Alterações pendentes',
                  saving: 'Salvando…',
                  error: 'Tentar salvar',
                  conflict: 'Conflito de edição',
                }[state.saveStatus]
              }
            </span>
          </button>
          <div className="action-divider" />
          <button
            className="icon-btn"
            aria-label="Desfazer"
            title="Desfazer · Ctrl Z"
            disabled={!state.history.undo || readOnly}
            onClick={state.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-btn"
            aria-label="Refazer"
            title="Refazer · Ctrl Shift Z"
            disabled={!state.history.redo || readOnly}
            onClick={state.redo}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="icon-btn history-btn"
            title="Histórico de versões"
            aria-label="Histórico de versões"
            onClick={() => {
              setSnapshot(undefined);
              setModal('versions');
            }}
          >
            <History size={18} />
          </button>
          <div className="action-divider" />
          <Button
            className="share-button"
            disabled
            title="Compartilhamento estará disponível com o gerenciamento de equipe."
          >
            <Share2 size={14} />
            Compartilhar
          </Button>
          <Button
            onClick={() => {
              state.setError('');
              setModal('simulate');
            }}
            disabled={busy || readOnly}
          >
            <Play size={14} />
            Testar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              state.setError('');
              setModal('publish');
            }}
            disabled={busy || state.role !== 'owner'}
            title={
              state.role !== 'owner'
                ? 'Somente o proprietário pode publicar.'
                : 'Publica uma versão imutável; se o fluxo estiver ativo, ela passa a receber eventos'
            }
          >
            <Rocket size={14} />
            Publicar
          </Button>
        </div>
      </div>
      {state.error && !modal && (
        <div className="editor-error" role="alert">
          <span>{state.error}</span>
          {state.saveStatus === 'conflict' ? (
            <Button onClick={exportDraft}>
              <Download size={14} />
              Exportar rascunho
            </Button>
          ) : (
            <button className="icon-btn" onClick={() => state.setError('')} aria-label="Fechar aviso">
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {activationError && !live && hiddenActivationError !== activationError.at && (
        <ActivationErrorBanner
          error={activationError}
          nodeName={activationErrorNode?.name}
          busy={activating}
          canRetry={canToggle && published}
          onRetry={() => void setActive(true)}
          onShowNode={
            activationErrorNode
              ? () => {
                  setView('editor');
                  setSelected([activationErrorNode.id]);
                  setSelectedEdges([]);
                  setInspector(true);
                  focusCanvas(activationErrorNode.id);
                }
              : undefined
          }
          onDismiss={() => setHiddenActivationError(activationError.at)}
        />
      )}
      {view === 'runs' ? (
        <div className="editor-runs" id="editor-panel" role="tabpanel" aria-labelledby="editor-tab-runs">
          <WorkflowRuns
            workflowId={id}
            versions={state.versions}
            selectedId={realRunId}
            onPick={(row) => {
              playback.current++;
              setPickedRun(row);
              setRealRunId(row.id);
              setSimPainted(false);
              setShowRun(false);
              setView('editor');
            }}
          />
        </div>
      ) : (
      <div
        id="editor-panel"
        role="tabpanel"
        aria-labelledby="editor-tab-editor"
        className={`editor-workspace ${library ? 'library-open' : ''} ${inspector ? 'inspector-open' : ''}`}
      >
        <aside className="block-library" aria-label="Biblioteca de blocos">
          <div className="library-tabs">
            <span className="active">Blocos</span>
            <Link href="/templates">
              Modelos <ArrowUpRight size={12} />
            </Link>
            <button
              className="icon-btn mobile-close"
              aria-label="Fechar biblioteca"
              onClick={() => setLibrary(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="library-intro">
            <h2>Construa seu processo</h2>
            <p>Uma boa ideia começa com um bloco.</p>
          </div>
          <div className="search-input">
            <Search size={15} />
            <input
              aria-label="Buscar blocos"
              placeholder="Buscar blocos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌕</kbd>
          </div>
          <div className="block-filters">
            {['Todos', 'Gatilhos', 'Ações', 'Lógica'].map((c) => (
              <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="blocks-scroll">
            {['Gatilhos', 'Lógica', 'Ações'].map((cat) => {
              const items = blockTypes.filter(
                (t) =>
                  catalog[t].category === cat &&
                  (category === 'Todos' || cat === category) &&
                  `${catalog[t].name} ${catalog[t].description}`
                    .toLocaleLowerCase('pt-BR')
                    .includes(query.toLocaleLowerCase('pt-BR')),
              );
              return items.length ? (
                <section className="block-category" key={cat}>
                  <h3>
                    {cat}
                    <span>{items.length}</span>
                    <ChevronDown size={12} />
                  </h3>
                  {items.map((type) => {
                    const meta = catalog[type];
                    const Icon = blockIcons[type];
                    return (
                      <button
                        key={type}
                        className="library-block"
                        draggable={!readOnly}
                        disabled={readOnly}
                        onClick={() => addBlock(type)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/eimax-block', type);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        aria-label={`Adicionar ${meta.name}`}
                      >
                        <span className={`block-icon color-${meta.color}`}>
                          <Icon size={18} />
                        </span>
                        <span>
                          <strong>{meta.name}</strong>
                          <small>{meta.description}</small>
                        </span>
                        <GripVertical size={14} className="grip" />
                      </button>
                    );
                  })}
                </section>
              ) : null;
            })}
            {!blockTypes.some(
              (t) =>
                (category === 'Todos' || catalog[t].category === category) &&
                `${catalog[t].name} ${catalog[t].description}`.toLowerCase().includes(query.toLowerCase()),
            ) && <p className="empty-search">Nenhum bloco encontrado.</p>}
          </div>
          {showTip && (
            <div className="library-tip">
              <button
                type="button"
                className="tip-close"
                aria-label="Fechar dica"
                title="Fechar dica"
                onClick={dismissTip}
              >
                <X size={14} />
              </button>
              <span className="tip-spark">
                <MousePointer2 size={17} />
              </span>
              <strong>Simples como arrastar.</strong>
              <p>
                Leve um bloco até o canvas.
                <br />
                Depois, conecte suas ideias.
              </p>
              <button onClick={() => setModal('help')}>
                Ver como funciona <ArrowUpRight size={12} />
              </button>
            </div>
          )}
        </aside>
        {library && (
          <button className="drawer-scrim" aria-label="Fechar biblioteca" onClick={() => setLibrary(false)} />
        )}
        <div className="canvas-column">
          <div
            className="canvas-area"
            tabIndex={-1}
            onDrop={drop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
          >
            <ReactFlow<FlowNode, LinkEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onEdgeMouseEnter={(_, edge) => hover(edge.id)}
              onEdgeMouseLeave={() => hover(undefined)}
              onNodesChange={onNodesChange}
              onNodeDragStart={() => state.checkpoint()}
              onConnect={connect}
              onReconnect={reconnect}
              onNodeClick={(event, node) => {
                if (!event.shiftKey) {
                  setSelected([node.id]);
                }
                setSelectedEdges([]);
                setInspector(true);
              }}
              onNodeDoubleClick={(_, node) => openNode(node.id)}
              onEdgesChange={(changes) => {
                const selections = changes.filter((c) => c.type === 'select');
                if (selections.length)
                  setSelectedEdges((previous) => {
                    const next = new Set(previous);
                    selections.forEach((c) => (c.selected ? next.add(c.id) : next.delete(c.id)));
                    return [...next];
                  });
                const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
                if (removed.length)
                  change((f) => ({ ...f, edges: f.edges.filter((e) => !removed.includes(e.id)) }));
              }}
              onPaneClick={() => {
                setSelected([]);
                setSelectedEdges([]);
              }}
              onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 0.95 }}
              onInit={() => {
                if (isCompact()) setTimeout(() => frame(), 120);
              }}
              minZoom={0.25}
              maxZoom={1.8}
              deleteKeyCode={null}
              multiSelectionKeyCode="Shift"
              selectionOnDrag={!hand && !touch}
              panOnDrag={hand || touch ? true : [1, 2]}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              edgesReconnectable={!readOnly}
              connectionRadius={24}
              elevateEdgesOnSelect
              aria-label="Editor visual de processos"
              defaultEdgeOptions={{ interactionWidth: 25 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d9d5e5" />
              {canvasRun ? (
                <Panel position="top-left">
                  <div
                    className="vx-run-chip"
                    role="status"
                    data-testid="canvas-run"
                    title={
                      canvasRun.source === 'real'
                        ? `Execução real${versionNote}. Os dados pertencem à versão publicada e podem diferir do rascunho.`
                        : 'Simulação desta sessão, calculada sobre o rascunho no momento do teste.'
                    }
                  >
                    <span className={`vx-run-dot ${canvasRun.source}`} aria-hidden="true" />
                    <span className="vx-run-short">
                      {canvasRun.source === 'simulation' ? 'Simulação' : 'Execução real'}
                    </span>
                    <span className="vx-run-long">
                      {canvasRun.source === 'simulation'
                        ? run?.targetNodeId
                          ? `Exibindo o teste até “${flow.nodes.find((n) => n.id === run.targetNodeId)?.name ?? 'bloco'}”${run.reachedTarget ? '' : ' · bloco não alcançado'}`
                          : 'Exibindo a simulação desta sessão'
                        : `Exibindo a execução real${shownReal?.leadSummary?.name ? ` de ${shownReal.leadSummary.name}` : ''} · ${stepStatusLabel(shownReal?.status ?? '')}${versionNote}`}
                    </span>
                    <button type="button" onClick={clearCanvasRun} aria-label="Limpar execução do canvas">
                      <X size={13} aria-hidden="true" />
                      Limpar
                    </button>
                  </div>
                </Panel>
              ) : (
                <Panel position="top-left" className="canvas-caption">
                  <span className="live-dot" />
                  <strong>Seu próximo grande processo</strong>
                  <span>começa aqui.</span>
                </Panel>
              )}
              <Panel position="top-right">
                <div className="canvas-tools">
                  <button
                    className="icon-btn library-toggle"
                    title="Abrir biblioteca"
                    aria-label="Abrir biblioteca"
                    onClick={() => {
                      setLibrary(true);
                      setInspector(false);
                    }}
                  >
                    <PanelLeftClose size={17} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Organizar da esquerda para a direita (só a seleção, com dois ou mais blocos selecionados)"
                    aria-label="Organizar blocos"
                    onClick={autoLayout}
                    disabled={readOnly}
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Abrir propriedades"
                    aria-label="Abrir propriedades"
                    onClick={() => setInspector(!inspector)}
                  >
                    <PanelRightOpen size={17} />
                  </button>
                </div>
              </Panel>
              <MiniMap
                className="workflow-minimap"
                style={{ width: 124, height: 83 }}
                ariaLabel="Minimapa do processo"
                nodeColor={(n) => (n.selected ? '#b5a3e8' : '#e2dcec')}
                maskColor="rgba(245,244,250,0.6)"
                pannable
                zoomable
                position="bottom-right"
              />
              <Panel position="bottom-left">
                <div className="zoom-controls">
                  <button
                    className={!hand ? 'active' : ''}
                    aria-label="Selecionar elementos"
                    title="Selecionar elementos"
                    onClick={() => setHand(false)}
                  >
                    <MousePointer2 size={16} />
                  </button>
                  <button
                    className={hand ? 'active' : ''}
                    aria-label="Mover canvas"
                    title="Mover canvas"
                    onClick={() => setHand(true)}
                  >
                    <GripVertical size={17} />
                  </button>
                  <span className="control-separator" />
                  <button aria-label="Diminuir zoom" onClick={() => rf.zoomOut({ duration: 180 })}>
                    <Minus size={15} />
                  </button>
                  <span className="zoom-value">{zoom}%</span>
                  <button aria-label="Aumentar zoom" onClick={() => rf.zoomIn({ duration: 180 })}>
                    <Plus size={15} />
                  </button>
                  <span className="control-separator" />
                  <button
                    aria-label="Enquadrar processo"
                    title="Enquadrar processo"
                    onClick={() => frame(200)}
                  >
                    <Maximize size={15} />
                  </button>
                </div>
              </Panel>
              {selectedEdges.length > 0 && !readOnly && (
                <Panel position="bottom-center" className="vx-edge-panel">
                  {selectedEdges.length === 1 && (
                    <Button onClick={() => setInsertEdge(selectedEdges[0])}>
                      <Plus size={14} />
                      Inserir bloco
                    </Button>
                  )}
                  <Button variant="danger" onClick={remove} disabled={readOnly}>
                    <Trash2 size={14} />
                    Excluir conexão
                  </Button>
                </Panel>
              )}
              {flow.nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="empty-canvas">
                    <Workflow size={38} />
                    <h2>Vamos conectar suas ideias?</h2>
                    <p>Adicione um gatilho para começar seu processo.</p>
                    <Button onClick={() => addBlock('lead.created')}>Adicionar primeiro bloco</Button>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
          {!!realRuns.length && (
            <div className="durable-editor-status">
              <strong>Execuções reais</strong>
              {realRuns.slice(0, 3).map((row) => (
                <button
                  className={`btn${realRunId === row.id ? ' is-active' : ''}`}
                  key={row.id}
                  aria-pressed={realRunId === row.id}
                  title={
                    realRunId === row.id
                      ? 'Clique de novo para voltar o canvas ao estado sem execução'
                      : 'Mostrar esta execução no canvas'
                  }
                  onClick={() => (realRunId === row.id ? clearCanvasRun() : setRealRunId(row.id))}
                >
                  {row.status === 'SUSPENDED'
                    ? 'Aguardando'
                    : row.status === 'COMPLETED'
                      ? 'Concluída'
                      : row.status}{' '}
                  · {row.leadSummary?.name}
                  {row.status === 'SUSPENDED' &&
                    row.checkpoints?.at(-1) &&
                    ` · ${new Date(row.checkpoints.at(-1)!.resumeAt).toLocaleString('pt-BR')}`}
                </button>
              ))}
            </div>
          )}
          {realRunError && (
            <p role="status" className="field-helper">
              Histórico real: {realRunError}
            </p>
          )}
          {shownReal && <RunLog run={{ ...shownReal, mode: 'real' }} onClose={clearCanvasRun} />}
          {run && showRun && <RunLog run={run} onClose={() => setShowRun(false)} />}
        </div>
        {inspector && !detailNode && (
          <Inspector
            node={activeNode}
            workflow={flow}
            readOnly={readOnly}
            onClose={() => setInspector(false)}
            onUpdate={(node) =>
              change((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === node.id ? node : n)) }))
            }
            onDelete={remove}
            onDuplicate={duplicate}
          />
        )}
      </div>
      )}
      {detailNode && (
        <Dialog
          title={`Detalhes do bloco: ${detailNode.name}`}
          wide
          onClose={() => setDetailNodeId(undefined)}
        >
          <NodeDetailBody
            workflow={flow}
            node={detailNode}
            steps={detailRun?.steps}
            loading={!realRunsLoaded && !detailRun}
            onNavigate={(nodeId) => {
              setSelected([nodeId]);
              setSelectedEdges([]);
              setDetailNodeId(nodeId);
            }}
            source={
              <div className="flow-detail-source">
                <label htmlFor="flow-detail-source">Dados da etapa</label>
                <select
                  id="flow-detail-source"
                  value={detailSource}
                  onChange={(event) => {
                    pendingDetailSource.current = false;
                    setDetailSource(event.target.value);
                  }}
                >
                  <option value="">Nenhuma execução selecionada</option>
                  {run && (
                    <option value="simulation">
                      {run.targetNodeId ? 'Teste até um bloco' : 'Simulação desta sessão'} ·{' '}
                      {new Date(run.createdAt).toLocaleString('pt-BR')}
                    </option>
                  )}
                  {[...realRuns, ...(pickedRun && !realRuns.some((r) => r.id === pickedRun.id) ? [pickedRun] : [])].map(
                    (item) => (
                      <option key={item.id} value={item.id}>
                        Execução real · {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                        {stepStatusLabel(item.status)}
                      </option>
                    ),
                  )}
                </select>
                {!readOnly && (
                  <div className="flow-detail-test">
                    <Button
                      onClick={() => void testUntil(detailNode.id)}
                      disabled={!!testingNode}
                      title="Roda a simulação só até este bloco, com o lead de exemplo. Nada é enviado."
                    >
                      {testingNode === detailNode.id ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <StepForward size={14} />
                      )}
                      Testar até este bloco
                    </Button>
                    {testNote && (
                      <p role={testNote.kind === 'error' ? 'alert' : 'status'} className={`flow-test-note ${testNote.kind}`}>
                        {testNote.text}
                      </p>
                    )}
                  </div>
                )}
                {detailRun && detailSource === 'simulation' && (
                  <p>
                    {run?.targetNodeId ? 'Teste até um bloco: só o trecho até ele foi percorrido. ' : ''}
                    Os dados refletem o fluxo no momento da simulação e podem diferir das alterações
                    posteriores.
                  </p>
                )}
                {detailRun && detailSource !== 'simulation' && (
                  <p>
                    Os dados pertencem à versão publicada usada na execução e podem diferir do rascunho atual.
                  </p>
                )}
              </div>
            }
            parameters={
              <Inspector
                node={detailNode}
                workflow={flow}
                readOnly={readOnly}
                showClose={false}
                onClose={() => setDetailNodeId(undefined)}
                onUpdate={(node) =>
                  change((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === node.id ? node : n)) }))
                }
                onDelete={() => {
                  remove();
                  setDetailNodeId(undefined);
                }}
                onDuplicate={() => {
                  duplicate();
                  setDetailNodeId(undefined);
                }}
              />
            }
          />
        </Dialog>
      )}
      <footer className="editor-statusbar">
        <span>
          <span className="status-dot green" />
          {flow.nodes.length} blocos <span className="status-separator">·</span> {flow.edges.length} conexões
        </span>
        <button onClick={() => setModal('publish')}>
          <span className={`status-dot ${issues.length ? 'amber' : 'green'}`} />
          {busy && run
            ? 'Reproduzindo o resultado calculado'
            : issues.length
              ? `${issues.length} ajuste${issues.length === 1 ? '' : 's'} para publicar`
              : 'Pronto para simular'}
        </button>
        <div>
          {run && (
            <button onClick={() => setShowRun(!showRun)}>
              <History size={12} />
              Último resultado
            </button>
          )}
          <span className="status-dev">
            Sessão local ·{' '}
            {state.role === 'owner' ? 'Proprietário' : state.role === 'editor' ? 'Editor' : 'Leitor'}
          </span>
          <button aria-label="Ajuda do editor" onClick={() => setModal('help')}>
            <CircleHelp size={14} />
          </button>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {toast}
        </div>
      )}
      {modal === 'simulate' && (
        <Dialog title="Vamos testar seu processo?" onClose={() => !busy && setModal(undefined)}>
          <div className="modal-intro-icon">
            <Play size={23} />
          </div>
          <p className="muted">
            Use um lead de exemplo para descobrir qual caminho ele seguirá. Nenhum e-mail, notificação ou
            atribuição real será enviado.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              simulate();
            }}
          >
            <div className="form-grid">
              {[
                { key: 'name', label: 'Nome do lead', type: 'text' },
                { key: 'email', label: 'E-mail do lead', type: 'email' },
                { key: 'company', label: 'Empresa', type: 'text' },
                { key: 'source', label: 'Origem', type: 'text' },
                { key: 'budget', label: 'Orçamento (R$)', type: 'number' },
                { key: 'score', label: 'Pontuação (0–100)', type: 'number' },
              ].map((item) => (
                <label className="field" key={item.key}>
                  {item.label}
                  <input
                    required
                    type={item.type}
                    min={0}
                    max={item.key === 'score' ? 100 : item.key === 'budget' ? 1e12 : undefined}
                    value={lead[item.key as keyof Lead]}
                    onChange={(e) =>
                      setLead((l) => ({
                        ...l,
                        [item.key]: item.type === 'number' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            {state.error && (
              <div className="validation-errors" role="alert">
                {state.error}
              </div>
            )}
            <div className="dialog-actions">
              <Button type="button" variant="ghost" onClick={() => setLead({ ...sampleLead })}>
                Restaurar exemplo
              </Button>
              <Button variant="primary" disabled={busy || issues.length > 0}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}Simular processo
              </Button>
            </div>
            {issues.length > 0 && (
              <div className="validation-errors">
                {issues.map((i, n) => (
                  <p key={n}>{i.message}</p>
                ))}
              </div>
            )}
          </form>
        </Dialog>
      )}
      {modal === 'publish' && (
        <Dialog title="Uma versão pronta para o próximo passo" onClose={() => !busy && setModal(undefined)}>
          <div className="modal-intro-icon">
            <Rocket size={25} />
          </div>
          <p className="muted">
            Publicar cria uma cópia imutável do processo. Seu rascunho continua editável.
          </p>
          <div className="info-box">
            <BookOpen size={18} />
            <div>
              <strong>Publicar e executar são etapas diferentes.</strong>
              <p>
                {state.activation.active ? 'O fluxo está ativo. ' : 'O fluxo está inativo. '}
                {state.activation.active
                  ? 'Depois de publicar, os próximos eventos (lead pela API, webhook, mensagem de WhatsApp) usam esta versão. Para pausar, desligue o interruptor “Ativo”.'
                  : 'A versão fica guardada, mas nenhum gatilho cria execuções até você ligar o interruptor “Ativo”.'}{' '}
                Use Testar para simular sem efeitos externos.
              </p>
            </div>
          </div>
          {issues.length > 0 ? (
            <div className="validation-errors">
              <strong>Antes de publicar, revise:</strong>
              {issues.map((i, n) => (
                <button
                  key={n}
                  onClick={() => {
                    if (i.nodeId) {
                      setSelected([i.nodeId]);
                      setInspector(true);
                    }
                    setModal(undefined);
                  }}
                >
                  {i.message}
                </button>
              ))}
            </div>
          ) : (
            <p className="publish-valid">
              <Check size={16} />
              {flow.nodes.length} blocos validados e conectados
            </p>
          )}
          {state.error && (
            <div className="validation-errors" role="alert">
              {state.error}
            </div>
          )}
          <div className="dialog-actions">
            <Button onClick={() => setModal(undefined)} disabled={busy}>
              Continuar editando
            </Button>
            <Button
              variant="primary"
              onClick={publish}
              disabled={busy || issues.length > 0 || state.role !== 'owner'}
            >
              {busy ? <LoaderCircle className="spin" size={15} /> : <Rocket size={15} />}Publicar versão
            </Button>
          </div>
        </Dialog>
      )}
      {modal === 'versions' && (
        <Dialog title="Histórico de versões" wide onClose={() => setModal(undefined)}>
          <p className="muted">
            Cada publicação guarda o processo exatamente como estava. O rascunho permanece independente.
          </p>
          {state.versions.length === 0 ? (
            <div className="empty-state">
              <History size={30} />
              <h3>Sua primeira versão começa aqui</h3>
              <p>Publique seu processo para registrar um ponto na história.</p>
            </div>
          ) : (
            <div className="versions-list">
              {state.versions.map((v) => (
                <button
                  key={v.id}
                  className={snapshot?.number === v.number ? 'active' : ''}
                  onClick={() =>
                    api<{ number: number; snapshot: WorkflowModel }>(`/workflows/${id}/versions/${v.number}`)
                      .then(setSnapshot)
                      .catch((e) => state.setError(e.message))
                  }
                >
                  <span className="version-circle">
                    <GitBranch size={17} />
                  </span>
                  <span>
                    <strong>Versão {v.number}</strong>
                    <small>{new Date(v.createdAt).toLocaleString('pt-BR')}</small>
                  </span>
                  <span className="immutable-badge">Imutável</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          )}
          {snapshot && (
            <div className="snapshot-view">
              <h3>
                Versão {snapshot.number} · {snapshot.snapshot.name}
              </h3>
              <p>
                {snapshot.snapshot.nodes.length} blocos e {snapshot.snapshot.edges.length} conexões
              </p>
              {snapshot.snapshot.nodes.map((n) => (
                <div key={n.id}>
                  <strong>{n.name}</strong>
                  <code>{JSON.stringify(n.config)}</code>
                </div>
              ))}
            </div>
          )}
          {state.error && <p className="danger-text">{state.error}</p>}
        </Dialog>
      )}
      {insertEdge &&
        (() => {
          const edge = flow.edges.find((e) => e.id === insertEdge);
          return (
            <InsertPicker
              sourceName={flow.nodes.find((n) => n.id === edge?.source)?.name ?? 'origem'}
              targetName={flow.nodes.find((n) => n.id === edge?.target)?.name ?? 'destino'}
              onPick={(type) => insertOnEdge(insertEdge, type)}
              onClose={() => setInsertEdge(undefined)}
            />
          );
        })()}
      {modal === 'help' && (
        <Dialog title="Da ideia ao processo, sem complicar" onClose={() => setModal(undefined)}>
          <ol className="help-steps">
            <li>
              <strong>Adicione seus blocos</strong>
              <p>Arraste da biblioteca ou clique para adicionar ao canvas.</p>
            </li>
            <li>
              <strong>Conecte os próximos passos</strong>
              <p>
                Arraste da saída à direita de um bloco até a entrada à esquerda de outro. Passe o mouse sobre
                uma ligação (ou toque nela) para inserir um bloco no meio ou excluí-la; arraste sua ponta para
                reconectar.
              </p>
            </li>
            <li>
              <strong>Personalize e teste</strong>
              <p>
                Use as propriedades para configurar, simule com um lead e consulte cada etapa no resultado.
              </p>
            </li>
          </ol>
          <div className="info-box">
            Shift + arrastar seleciona vários blocos. Ctrl D duplica. Delete exclui. Ctrl Z desfaz. As
            alterações são salvas automaticamente no servidor. No detalhe do bloco (duplo clique), as teclas{' '}
            {detailShortcut} vão para o bloco anterior e o próximo, fora dos campos de texto; arraste um campo
            da Entrada até um parâmetro de texto para inserir a variável. “Testar até este bloco” (na barra do
            bloco e no detalhe) simula só o trecho até ele, sem enviar nada. O interruptor “Ativo” liga ou desliga
            todos os gatilhos do fluxo; a aba Execuções lista as execuções reais e mostra a escolhida no canvas.
          </div>
        </Dialog>
      )}
    </main>
  );
}
