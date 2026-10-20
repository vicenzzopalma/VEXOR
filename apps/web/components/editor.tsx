
'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useReactFlow,
  reconnectEdge,
  type Edge,
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
  Trash2,
  Undo2,
  Workflow,
  X,
} from 'lucide-react';
import {
  catalog,
  blockTypes,
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
import { api, ApiError } from '@/lib/api';
import { Button, Dialog, Loading } from './ui';
import { blockIcons } from './icons';
import { WorkflowBlock, type FlowNode } from './workflow-node';
import { Inspector } from './inspector';
import { useEditorState } from './editor-state';
import { RunLog } from './run-log';

const nodeTypes = { workflow: WorkflowBlock };
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
  const [modal, setModal] = useState<'simulate' | 'publish' | 'versions' | 'help' | undefined>();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [lead, setLead] = useState<Lead>({ ...sampleLead });
  const [run, setRun] = useState<SimulationResult>();
  const [showRun, setShowRun] = useState(false);
  const [execution, setExecution] = useState<Record<string, string>>({});
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
  const readOnly = state.role === 'viewer';
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
        state.saveStatus === 'saved'
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      state
        .save()
        .then(() => router.push(anchor.pathname))
        .catch((error) => state.setError(error.message));
    };
    document.addEventListener('click', navigate, true);
    return () => document.removeEventListener('click', navigate, true);
  }, [state.saveStatus, state.save, state.setError, router]);
  const issues = useMemo(() => (flow ? validateWorkflow(flow) : []), [flow]);
  const activeNode = flow?.nodes.find((n) => n.id === selected[0]);
  const nodes: FlowNode[] = useMemo(
    () =>
      (flow?.nodes ?? []).map((block) => ({
        id: block.id,
        type: 'workflow',
        position: block.position,
        measured: dimensions[block.id],
        data: {
          block,
          execution: execution[block.id],
          invalid: !configSchemas[block.type].safeParse(block.config).success,
        },
        selected: selected.includes(block.id),
      })),
    [flow, selected, execution, dimensions],
  );
  const edges: Edge[] = useMemo(
    () =>
      (flow?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.branch ?? null,
        type: 'default',
        label: e.branch === 'true' ? 'Condição atendida' : e.branch === 'false' ? 'Não atendida' : undefined,
        selected: selectedEdges.includes(e.id),
        reconnectable: !readOnly,
        style: {
          stroke: e.branch === 'false' ? '#ca879b' : e.branch === 'true' ? '#70aa97' : '#b7adc9',
          strokeWidth: 1.7,
        },
        labelStyle: { fill: e.branch === 'false' ? '#b96f85' : '#659782', fontWeight: 500, fontSize: 10 },
        labelBgStyle: { fill: '#f8f9fc' },
        labelBgPadding: [7, 5] as [number, number],
      })),
    [flow, selectedEdges, readOnly],
  );
  const remove = useCallback(() => {
    change((f) => ({
      ...f,
      nodes: f.nodes.filter((n) => !selected.includes(n.id)),
      edges: f.edges.filter(
        (e) => !selected.includes(e.source) && !selected.includes(e.target) && !selectedEdges.includes(e.id),
      ),
    }));
    setSelected([]);
    setSelectedEdges([]);
  }, [change, selected, selectedEdges]);
  const duplicate = useCallback(() => {
    if (!flow || !selected.length) return;
    const map = new Map(selected.map((n) => [n, uid()]));
    const copies = flow.nodes
      .filter((n) => selected.includes(n.id))
      .map((n) => ({
        ...structuredClone(n),
        id: map.get(n.id)!,
        name: `${n.name} (cópia)`,
        position: { x: n.position.x + 40, y: n.position.y + 45 },
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
  }, [flow, selected, change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        modal ||
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
      if (!target || ['lead.created', 'webhook.received'].includes(target.type)) return false;
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
    const p =
      position ??
      rf.screenToFlowPosition({
        x: (bounds?.left ?? 350) + (bounds?.width ?? 700) / 2,
        y: (bounds?.top ?? 150) + (bounds?.height ?? 600) / 2,
      });
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
  const autoLayout = () => {
    if (!flow) return;
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'TB', nodesep: 90, ranksep: 90 });
    flow.nodes.forEach((n) => graph.setNode(n.id, { width: 240, height: 126 }));
    flow.edges.forEach((e) => graph.setEdge(e.source, e.target));
    dagre.layout(graph);
    change((f) => ({
      ...f,
      nodes: f.nodes.map((n) => {
        const p = graph.node(n.id);
        return { ...n, position: { x: p.x - 120, y: p.y - 63 } };
      }),
    }));
    setTimeout(() => rf.fitView({ padding: 0.17, duration: 200 }), 30);
    setToast('Blocos organizados. Você pode desfazer esta ação.');
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
      setToast(`Versão ${version.number} publicada. Nenhuma ação externa foi ativada.`);
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
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eimax-rascunho.json';
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
          <Link href="/processos" className="back-button" aria-label="Voltar aos processos">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="breadcrumb">
              Meus processos <span>/</span> Comercial
            </div>
            <div className="process-title">
              <input
                aria-label="Nome do processo"
                value={flow.name}
                maxLength={200}
                disabled={readOnly}
                onChange={(e) => change((f) => ({ ...f, name: e.target.value }))}
              />
              <span className="draft-badge">Rascunho</span>
            </div>
          </div>
        </div>
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
                : 'Publica uma versão sem ativar ações externas'
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
      <div
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
            onDrop={drop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
          >
            <ReactFlow<FlowNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStart={() => state.checkpoint()}
              onConnect={connect}
              onReconnect={reconnect}
              onNodeClick={(event, node) => {
                if (!event.shiftKey) setSelected([node.id]);
                setSelectedEdges([]);
                setInspector(true);
              }}
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
              <Panel position="top-left" className="canvas-caption">
                <span className="live-dot" />
                <strong>Seu próximo grande processo</strong>
                <span>começa aqui.</span>
              </Panel>
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
                    title="Organizar blocos automaticamente"
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
                    onClick={() => rf.fitView({ padding: 0.18, duration: 200 })}
                  >
                    <Maximize size={15} />
                  </button>
                </div>
              </Panel>
              {selectedEdges.length > 0 && (
                <Panel position="bottom-center">
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
          {run && showRun && <RunLog run={run} onClose={() => setShowRun(false)} />}
        </div>
        {inspector && (
          <Inspector
            node={activeNode}
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
                Nesta entrega, a publicação preserva a versão. Não ativa automações nem dispara ações
                externas. Use Testar para simular um evento.
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
                Arraste de uma alça inferior até a entrada de outro bloco. Selecione uma conexão para
                excluí-la ou arraste sua ponta para reconectar.
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
            alterações são salvas automaticamente no servidor.
          </div>
        </Dialog>
      )}
    </main>
  );
}
