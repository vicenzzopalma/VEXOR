'use client';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Braces,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  GripVertical,
  Link2,
  ListTree,
  LoaderCircle,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { VARIABLE_DRAG_TYPE, BLOCKED_DRAG_TYPE } from './variable-input';
import { leadVariables, stepVariables, type Workflow, type WorkflowNode } from '@eimax/workflow-schema';
import { Button } from './ui';

/** Vistas de dados do detalhe do bloco: tabela, JSON e esquema, com busca, cópia e arraste. */
export type DataView = 'table' | 'json' | 'schema';
export type DataPath = Array<string | number>;
const views: Array<{ id: DataView; label: string; icon: typeof Table2 }> = [
  { id: 'table', label: 'Tabela', icon: Table2 },
  { id: 'json', label: 'JSON', icon: Braces },
  { id: 'schema', label: 'Esquema', icon: ListTree },
];
// Limites próprios do VEXOR: acima deles o painel pergunta antes de desenhar.
export const DATA_SIZE_LIMIT: Record<DataView, number> = {
  table: 1024 * 1024,
  json: 1024 * 1024,
  schema: 3 * 1024 * 1024,
};
export const MAX_TABLE_COLUMNS = 30;
const MAX_DEPTH = 8;
const BLOCKED_REASON =
  'Só campos de primeiro nível da lista de variáveis do editor (dados do lead e resultados conhecidos de blocos anteriores) podem virar variável.';

const storageKey = (side: 'input' | 'output') => `eimax_detail_view_${side}`;
function readView(side: 'input' | 'output'): DataView {
  try {
    const saved = localStorage.getItem(storageKey(side));
    if (saved === 'table' || saved === 'json' || saved === 'schema') return saved;
  } catch {}
  return side === 'input' ? 'schema' : 'table';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null;
export const itemsOf = (data: unknown): unknown[] =>
  data == null ? [] : Array.isArray(data) ? data : [data];
export const pathText = (root: string, path: DataPath) =>
  path.reduce<string>(
    (text, key) =>
      typeof key === 'number'
        ? `${text}[${key}]`
        : /^[A-Za-z_$][\w$]*$/.test(key)
          ? `${text}${text ? '.' : ''}${key}`
          : `${text}[${JSON.stringify(key)}]`,
    root,
  );
const typeLabel = (value: unknown) =>
  value === null
    ? 'nulo'
    : Array.isArray(value)
      ? 'lista'
      : typeof value === 'object'
        ? 'objeto'
        : typeof value === 'number'
          ? 'número'
          : typeof value === 'boolean'
            ? 'booleano'
            : typeof value === 'string'
              ? 'texto'
              : typeof value;
const typeClass = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const summary = (value: unknown) =>
  Array.isArray(value)
    ? `[${value.length} ${value.length === 1 ? 'item' : 'itens'}]`
    : isObject(value)
      ? `{${Object.keys(value).length} ${Object.keys(value).length === 1 ? 'campo' : 'campos'}}`
      : '';
const primitiveText = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
const valueText = (value: unknown) =>
  typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
const matches = (value: unknown, query: string): boolean => {
  if (!query) return true;
  if (isContainer(value))
    return Object.entries(value).some(
      ([key, inner]) => key.toLowerCase().includes(query) || matches(inner, query),
    );
  return primitiveText(value).toLowerCase().includes(query);
};
export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;

async function copyText(text: string, anchor?: Element | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sem permissão de área de transferência (http local, testes): cópia pelo documento. O campo
    // temporário fica dentro do diálogo para o foco preso não tirá-lo da seleção antes da cópia.
    const host = anchor?.closest('[role="dialog"]') ?? document.body;
    const previous = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.tabIndex = -1;
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    host.append(area);
    area.focus();
    area.select();
    let ok = false;
    try {
      ok =
        document.activeElement === area &&
        area.selectionStart === 0 &&
        area.selectionEnd === text.length &&
        document.execCommand('copy');
    } catch {}
    area.remove();
    previous?.focus();
    return ok;
  }
}
export function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'dados'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query); at >= 0; at = lower.indexOf(query, at + query.length)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

type FieldTools = {
  root: string;
  query: string;
  /** Variável (`lead.campo` ou `steps.<id>.campo`) quando o campo pode ser arrastado para um parâmetro. */
  variableFor?: (path: DataPath) => string | undefined;
  draggable: boolean;
  copy: (text: string, what: 'valor' | 'caminho', anchor: Element) => void;
  dragNotice: (message: string) => void;
};

function FieldActions({
  path,
  value,
  tools,
  name,
}: {
  path: DataPath;
  value: unknown;
  tools: FieldTools;
  name: string;
}) {
  return (
    <span className="ndv-field-actions">
      <button
        type="button"
        aria-label={`Copiar valor de ${name}`}
        title="Copiar valor"
        onClick={(event) => tools.copy(valueText(value), 'valor', event.currentTarget)}
      >
        <Copy size={12} />
      </button>
      <button
        type="button"
        aria-label={`Copiar caminho de ${name}`}
        title="Copiar caminho"
        onClick={(event) => tools.copy(pathText(tools.root, path), 'caminho', event.currentTarget)}
      >
        <Link2 size={12} />
      </button>
    </span>
  );
}

/** Nome do campo; na Entrada pode ser arrastado até um parâmetro de texto. */
function FieldKey({ path, label, tools }: { path: DataPath; label: string; tools: FieldTools }) {
  const variable = tools.variableFor?.(path);
  if (!tools.draggable)
    return (
      <span className="ndv-key">
        <Highlight text={label} query={tools.query} />
      </span>
    );
  const start = (event: DragEvent<HTMLSpanElement>) => {
    event.dataTransfer.effectAllowed = 'copy';
    if (variable) {
      // Só o tipo próprio: campos comuns não podem receber o texto da variável sem passar pelo VariableInput.
      event.dataTransfer.setData(VARIABLE_DRAG_TYPE, variable);
      tools.dragNotice(`Solte em um parâmetro de texto para inserir {{${variable}}}.`);
    } else {
      event.dataTransfer.setData(BLOCKED_DRAG_TYPE, pathText(tools.root, path));
      tools.dragNotice(`${pathText(tools.root, path)} não pode ser solto em um parâmetro. ${BLOCKED_REASON}`);
    }
  };
  return (
    <span
      className={`ndv-key draggable ${variable ? '' : 'blocked'}`}
      draggable
      onDragStart={start}
      // A explicação de campo bloqueado continua visível depois de soltar.
      onDragEnd={() => variable && tools.dragNotice('')}
      title={
        variable
          ? `Arraste até um parâmetro de texto para inserir {{${variable}}}`
          : `Este campo não pode ser usado como variável. ${BLOCKED_REASON}`
      }
      data-variable={variable ?? ''}
    >
      <GripVertical size={11} aria-hidden="true" />
      <Highlight text={label} query={tools.query} />
    </span>
  );
}

function JsonNode({
  label,
  value,
  path,
  depth,
  tools,
  collapsed,
  toggle,
}: {
  label?: string;
  value: unknown;
  path: DataPath;
  depth: number;
  tools: FieldTools;
  collapsed: Set<string>;
  toggle: (key: string) => void;
}) {
  const key = pathText('', path);
  const name = label ?? 'raiz';
  const container = isContainer(value);
  const open = container && !collapsed.has(key) && depth < MAX_DEPTH;
  if (tools.query && !matches(value, tools.query) && !(label ?? '').toLowerCase().includes(tools.query))
    return null;
  return (
    <li className="ndv-json-row">
      <div className="ndv-json-line">
        {container ? (
          <button
            type="button"
            className="ndv-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Recolher' : 'Expandir'} ${name}`}
            onClick={() => toggle(key)}
            disabled={depth >= MAX_DEPTH}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="ndv-toggle-space" />
        )}
        {label !== undefined && (
          <>
            {typeof path.at(-1) === 'number' ? (
              <span className="ndv-index">{label}</span>
            ) : (
              <FieldKey path={path} label={label} tools={tools} />
            )}
            <span className="ndv-colon">:</span>
          </>
        )}
        {container ? (
          <span className="ndv-summary">{summary(value)}</span>
        ) : (
          <span className={`ndv-value ndv-type-${typeClass(value)}`}>
            <Highlight text={JSON.stringify(value) ?? 'undefined'} query={tools.query} />
          </span>
        )}
        {path.length > 0 && (
          <FieldActions path={path} value={value} tools={tools} name={pathText(tools.root, path)} />
        )}
      </div>
      {open && (
        <ul>
          {Object.entries(value).map(([childKey, child]) => (
            <JsonNode
              key={childKey}
              label={Array.isArray(value) ? `[${childKey}]` : childKey}
              value={child}
              path={[...path, Array.isArray(value) ? Number(childKey) : childKey]}
              depth={depth + 1}
              tools={tools}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

type SchemaField = {
  key: string;
  path: DataPath;
  types: Set<string>;
  example: unknown;
  children: SchemaField[];
};
/** Junta os campos de todos os itens: tipo(s) encontrados e o primeiro valor de exemplo. */
export function buildSchema(items: unknown[], base: DataPath): SchemaField[] {
  const fields = new Map<string, SchemaField>();
  const nested = new Map<string, unknown[]>();
  for (const item of items) {
    if (!isObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      const field = fields.get(key) ?? {
        key,
        path: [...base, key],
        types: new Set(),
        example: undefined,
        children: [],
      };
      field.types.add(typeLabel(value));
      if (field.example === undefined || field.example === null) field.example = value;
      fields.set(key, field);
      if (!isContainer(value)) continue;
      let list = nested.get(key);
      if (!list) nested.set(key, (list = []));
      if (isObject(value)) list.push(value);
      else for (const entry of value) if (isObject(entry)) list.push(entry);
    }
  }
  for (const field of fields.values()) {
    const children = nested.get(field.key);
    if (children?.length && field.path.length < MAX_DEPTH)
      field.children = buildSchema(children, field.types.has('lista') ? [...field.path, 0] : field.path);
  }
  return [...fields.values()];
}
function schemaMatches(field: SchemaField, query: string): boolean {
  return (
    !query ||
    field.key.toLowerCase().includes(query) ||
    (!isContainer(field.example) && primitiveText(field.example).toLowerCase().includes(query)) ||
    field.children.some((child) => schemaMatches(child, query))
  );
}
function SchemaTree({ fields, tools }: { fields: SchemaField[]; tools: FieldTools }) {
  return (
    <ul className="ndv-schema">
      {fields
        .filter((field) => schemaMatches(field, tools.query))
        .map((field) => (
          <li key={field.key}>
            <div className="ndv-schema-line">
              <FieldKey path={field.path} label={field.key} tools={tools} />
              <span className="ndv-type">{[...field.types].join(' ou ')}</span>
              {!isContainer(field.example) && (
                <span className="ndv-example">
                  <Highlight
                    text={
                      primitiveText(field.example).length > 80
                        ? `${primitiveText(field.example).slice(0, 80)}…`
                        : primitiveText(field.example) || '""'
                    }
                    query={tools.query}
                  />
                </span>
              )}
              <FieldActions
                path={field.path}
                value={field.example}
                tools={tools}
                name={pathText(tools.root, field.path)}
              />
            </div>
            {field.children.length > 0 && <SchemaTree fields={field.children} tools={tools} />}
          </li>
        ))}
    </ul>
  );
}

function TableCell({ value, query }: { value: unknown; query: string }) {
  const [open, setOpen] = useState(false);
  if (!isContainer(value))
    return value === undefined ? (
      <span className="ndv-muted">—</span>
    ) : (
      <Highlight text={primitiveText(value)} query={query} />
    );
  return (
    <>
      <button type="button" className="ndv-cell-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {summary(value)}
      </button>
      {open && (
        <pre>
          <Highlight text={JSON.stringify(value, null, 2)} query={query} />
        </pre>
      )}
    </>
  );
}

export function DataPane({
  side,
  label,
  data,
  root,
  variableFor,
  fileName,
  toolbar,
}: {
  side: 'input' | 'output';
  label: string;
  data: unknown;
  root: string;
  variableFor?: (path: DataPath) => string | undefined;
  fileName: string;
  toolbar?: ReactNode;
}) {
  const searchId = useId();
  const [view, setView] = useState<DataView>(() => readView(side));
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [forced, setForced] = useState<number>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [dragNotice, setDragNotice] = useState('');
  const [showAllColumns, setShowAllColumns] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const choose = (next: DataView) => {
    setView(next);
    try {
      localStorage.setItem(storageKey(side), next);
    } catch {}
  };
  const size = useMemo(() => {
    try {
      return new TextEncoder().encode(JSON.stringify(data) ?? '').length;
    } catch {
      return 0;
    }
  }, [data]);
  const items = useMemo(() => itemsOf(data), [data]);
  // A escolha vale para dados do mesmo tamanho (a lista de execuções é recarregada periodicamente).
  const tooLarge = size > DATA_SIZE_LIMIT[view] && forced !== size;
  // Acima do limite nada é percorrido até o usuário pedir para exibir.
  const shown = useMemo(
    () => (tooLarge ? [] : items.flatMap((item, index) => (matches(item, query) ? [{ item, index }] : []))),
    [items, query, tooLarge],
  );
  const tools: FieldTools = {
    root,
    query,
    variableFor,
    draggable: side === 'input',
    copy: (text, what, anchor) => {
      void copyText(text, anchor).then((ok) => {
        clearTimeout(noticeTimer.current);
        setNotice(ok ? `${what === 'valor' ? 'Valor' : 'Caminho'} copiado.` : 'Não foi possível copiar.');
        noticeTimer.current = setTimeout(() => setNotice(''), 2200);
      });
    },
    dragNotice: setDragNotice,
  };
  const columns = useMemo(() => {
    const keys = new Set<string>();
    if (tooLarge) return [];
    for (const item of items) {
      if (isObject(item)) Object.keys(item).forEach((key) => keys.add(key));
      else keys.add('valor');
    }
    return [...keys];
  }, [items, tooLarge]);
  const visibleColumns = showAllColumns ? columns : columns.slice(0, MAX_TABLE_COLUMNS);
  const schema = useMemo(
    () => (view === 'schema' && !tooLarge ? buildSchema(items, Array.isArray(data) ? [0] : []) : []),
    [view, tooLarge, items, data],
  );
  const count =
    query && !tooLarge
      ? `${shown.length} de ${items.length} ${items.length === 1 ? 'item' : 'itens'}`
      : `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  return (
    <div className="ndv-pane" data-view={view}>
      <div className="ndv-toolbar">
        {toolbar}
        <div className="ndv-views" role="group" aria-label={`Vista da ${label}`}>
          {views.map(({ id, label: name, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => choose(id)}>
              <Icon size={13} />
              {name}
            </button>
          ))}
        </div>
        <div className="ndv-search">
          <Search size={13} aria-hidden="true" />
          <input
            id={searchId}
            aria-label={`Buscar na ${label}`}
            type="search"
            placeholder="Buscar"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Esc limpa a busca antes de fechar o diálogo.
              if (event.key === 'Escape' && draft) {
                event.stopPropagation();
                event.preventDefault();
                setDraft('');
              }
            }}
          />
          {draft && (
            <button type="button" aria-label={`Limpar busca na ${label}`} onClick={() => setDraft('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <span className="ndv-count" aria-live="polite" data-testid={`count-${side}`}>
          {count}
        </span>
      </div>
      <p className="ndv-status" role="status">
        {notice || dragNotice}
      </p>
      {tooLarge ? (
        <div className="ndv-large">
          <p>
            Os dados têm {formatSize(size)}, acima do limite de {formatSize(DATA_SIZE_LIMIT[view])} para a
            vista {views.find((v) => v.id === view)?.label}. Exibir tudo pode deixar o editor lento.
          </p>
          <div>
            <Button type="button" onClick={() => setForced(size)}>
              Exibir mesmo assim
            </Button>
            <Button type="button" onClick={() => downloadJson(data, fileName)}>
              <Download size={13} />
              Baixar JSON
            </Button>
          </div>
        </div>
      ) : query && !shown.length && !(view === 'schema' && schema.some((f) => schemaMatches(f, query))) ? (
        <div className="ndv-empty">
          <p>Nada encontrado para “{draft.trim()}”.</p>
          <Button type="button" onClick={() => setDraft('')}>
            Limpar busca
          </Button>
        </div>
      ) : !items.length || (items.length === 1 && isObject(items[0]) && !Object.keys(items[0]).length) ? (
        <p className="ndv-muted">Esta etapa não registrou campos.</p>
      ) : view === 'table' ? (
        <>
          {columns.length > MAX_TABLE_COLUMNS && (
            <div className="ndv-warning">
              {showAllColumns
                ? `Exibindo todas as ${columns.length} colunas.`
                : `Exibindo ${MAX_TABLE_COLUMNS} de ${columns.length} colunas.`}{' '}
              <button type="button" onClick={() => setShowAllColumns(!showAllColumns)}>
                {showAllColumns ? 'Mostrar menos' : 'Mostrar todas'}
              </button>{' '}
              <button type="button" onClick={() => choose('json')}>
                Abrir em JSON
              </button>
            </div>
          )}
          <div className="ndv-table-wrap">
            <table className="ndv-table" aria-label={`Tabela da ${label}`}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {visibleColumns.map((column) => (
                    <th scope="col" key={column}>
                      <Highlight text={column} query={query} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ item, index }) => {
                  return (
                    <tr key={index}>
                      <td className="ndv-muted">{index + 1}</td>
                      {visibleColumns.map((column) => (
                        <td key={column}>
                          <TableCell
                            value={isObject(item) ? item[column] : column === 'valor' ? item : undefined}
                            query={query}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : view === 'json' ? (
        <ul className="ndv-json" aria-label={`JSON da ${label}`}>
          <JsonNode
            value={data}
            path={[]}
            depth={0}
            tools={tools}
            collapsed={collapsed}
            toggle={(key) =>
              setCollapsed((previous) => {
                const next = new Set(previous);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          />
        </ul>
      ) : (
        <SchemaTree fields={schema} tools={tools} />
      )}
    </div>
  );
}

type DetailStep = {
  nodeId: string;
  status: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  message: string;
};
type InputOption = {
  id: string;
  label: string;
  data: unknown;
  root: string;
  variableFor: (path: DataPath) => string | undefined;
};
const stepState = (status: string) => String(status).toLowerCase();
const hasFields = (data: unknown) =>
  data != null &&
  (!isObject(data) || Object.keys(data).length > 0) &&
  (!Array.isArray(data) || data.length > 0);
// Caixas de seleção e botões de opção não recebem texto: o atalho continua valendo neles.
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest(
    'textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  );
// Teclas sem modificador: Alt + Shift troca o idioma do teclado no Windows e Ctrl + Alt equivale a AltGr.
export const detailShortcut = '[ e ]';
/** Rótulos em pt-BR dos estados de execução e de etapa (também usados pelo editor). */
export const stepStatusLabel = (status: string) =>
  ({
    success: 'Concluída',
    failed: 'Falhou',
    skipped: 'Não executada',
    running: 'Em andamento',
    completed: 'Concluída',
    COMPLETED: 'Concluída',
    FAILED: 'Falhou',
    QUEUED: 'Na fila',
    RUNNING: 'Em andamento',
    SUSPENDED: 'Aguardando',
  })[status] ?? status;
const dragTypes = [VARIABLE_DRAG_TYPE, BLOCKED_DRAG_TYPE];
const isFieldDrag = (event: globalThis.DragEvent) =>
  !!event.dataTransfer && [...event.dataTransfer.types].some((type) => dragTypes.includes(type));
const isVariableTarget = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('.variable-editor input');

/**
 * Corpo do detalhe do bloco: Entrada | Parâmetros | Saída, com navegação para os blocos vizinhos
 * sem fechar o diálogo. No celular as três áreas viram abas.
 */
export function NodeDetailBody({
  workflow,
  node,
  steps,
  loading,
  source,
  parameters,
  onNavigate,
}: {
  workflow: Workflow;
  node: WorkflowNode;
  steps?: DetailStep[];
  loading: boolean;
  source: ReactNode;
  parameters: ReactNode;
  onNavigate: (nodeId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [tab, setTab] = useState<'input' | 'parameters' | 'output'>('parameters');
  const [inputFrom, setInputFrom] = useState('');
  const [shownNode, setShownNode] = useState(node.id);
  if (shownNode !== node.id) {
    setShownNode(node.id);
    setInputFrom('');
  }
  const nameOf = (id: string) => workflow.nodes.find((n) => n.id === id)?.name ?? id;
  const parents = workflow.edges
    .filter((e) => e.target === node.id)
    .map((e) => ({ edge: e.id, id: e.source, label: '' }));
  const children = workflow.edges
    .filter((e) => e.source === node.id)
    .map((e) => ({
      edge: e.id,
      id: e.target,
      label: e.branch === 'true' ? 'Sim' : e.branch === 'false' ? 'Não' : '',
    }));
  // Ancestrais por distância (mais perto primeiro), sem repetição.
  const ancestors: Array<{ id: string; distance: number }> = [];
  for (let level = [node.id], distance = 1; level.length; distance++) {
    const next: string[] = [];
    for (const target of level)
      for (const edge of workflow.edges.filter((e) => e.target === target))
        if (edge.source !== node.id && !ancestors.some((a) => a.id === edge.source)) {
          ancestors.push({ id: edge.source, distance });
          next.push(edge.source);
        }
    level = next;
  }
  const step = steps?.find((s) => s.nodeId === node.id);
  const options: InputOption[] = [];
  if (step && stepState(step.status) !== 'skipped' && step.input != null)
    options.push({
      id: '',
      label: 'Lead recebido por esta etapa',
      data: step.input,
      root: 'lead',
      variableFor: (path) =>
        path.length === 1 && typeof path[0] === 'string' && Object.hasOwn(leadVariables, path[0])
          ? `lead.${path[0]}`
          : undefined,
    });
  for (const ancestor of ancestors) {
    const previous = steps?.find((s) => s.nodeId === ancestor.id);
    const type = workflow.nodes.find((n) => n.id === ancestor.id)?.type ?? '';
    if (!previous || stepState(previous.status) === 'skipped' || !hasFields(previous.output)) continue;
    options.push({
      id: ancestor.id,
      label: `${nameOf(ancestor.id).slice(0, 40)} · saída (${
        ancestor.distance === 1 ? 'anterior direto' : `${ancestor.distance} blocos antes`
      })`,
      data: previous.output,
      root: `steps.${ancestor.id}`,
      variableFor: (path) =>
        path.length === 1 && typeof path[0] === 'string' && Object.hasOwn(stepVariables[type] ?? {}, path[0])
          ? `steps.${ancestor.id}.${path[0]}`
          : undefined,
    });
  }
  const input = options.find((o) => o.id === inputFrom) ?? options[0];
  const go = (nodeId: string) => {
    onNavigate(nodeId);
    // O botão clicado pode sumir no bloco novo; o foco fica no diálogo.
    requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    });
  };
  const goRef = useRef(go);
  goRef.current = go;
  const firstParent = parents[0]?.id;
  const firstChild = children[0]?.id;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const dialog = ref.current?.closest('[role="dialog"]');
      if (
        !dialog ||
        dialog.getAttribute('aria-modal') !== 'true' ||
        !dialog.contains(event.target as Node) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTyping(event.target)
      )
        return;
      const target = event.key === '[' ? firstParent : event.key === ']' ? firstChild : undefined;
      if (!target) return;
      event.preventDefault();
      goRef.current(target);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [firstParent, firstChild]);
  useEffect(() => {
    // Campos da Entrada só podem ser soltos num parâmetro de texto (VariableInput), nunca em campos comuns.
    const over = (event: globalThis.DragEvent) => {
      if (!isFieldDrag(event) || isVariableTarget(event.target)) return;
      event.dataTransfer!.dropEffect = 'none';
    };
    const drop = (event: globalThis.DragEvent) => {
      if (!isFieldDrag(event) || isVariableTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('dragover', over, true);
    window.addEventListener('drop', drop, true);
    return () => {
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('drop', drop, true);
    };
  }, []);
  const empty = loading ? (
    <p className="ndv-loading" role="status">
      <LoaderCircle size={14} className="spin" />
      Carregando os dados da execução…
    </p>
  ) : !steps ? (
    <div className="ndv-empty">
      <p>
        Sem dados para exibir. Clique em <strong>Testar</strong> para simular o fluxo ou escolha uma execução
        em “Dados da etapa”.
      </p>
    </div>
  ) : undefined;
  const status = step ? stepState(step.status) : '';
  const nav = (items: Array<{ edge: string; id: string; label: string }>, direction: 'prev' | 'next') => (
    <nav
      className={`flow-detail-nav ${direction}`}
      aria-label={direction === 'prev' ? 'Blocos anteriores' : 'Próximos blocos'}
    >
      {items.map((item) => {
        const name = `${nameOf(item.id)}${item.label ? ` (${item.label})` : ''}`;
        return (
          <button
            key={item.edge}
            type="button"
            onClick={() => go(item.id)}
            aria-label={`${direction === 'prev' ? 'Ir para o bloco anterior' : 'Ir para o próximo bloco'}: ${name}`}
            title={`${name} · tecla ${direction === 'prev' ? '[' : ']'}`}
          >
            {direction === 'prev' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            <span>{name}</span>
          </button>
        );
      })}
    </nav>
  );
  return (
    <div className="flow-detail" ref={ref} tabIndex={-1}>
      {source}
      <div className="flow-detail-tabs" role="tablist" aria-label="Área exibida">
        {(
          [
            ['input', 'Entrada'],
            ['parameters', 'Parâmetros'],
            ['output', 'Saída'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${baseId}-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const order = ['input', 'parameters', 'output'] as const;
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const next = order[(order.indexOf(id) + step + order.length) % order.length];
              setTab(next);
              document.getElementById(`${baseId}-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flow-detail-body">
        {nav(parents, 'prev')}
        <div className="flow-detail-grid" data-tab={tab}>
          <section id={`${baseId}-input`} className="flow-detail-data" data-area="input" aria-label="Entrada">
            <h3>Entrada</h3>
            {empty ??
              (input ? (
                <DataPane
                  key={`${node.id}:${input.id || 'lead'}`}
                  side="input"
                  label="Entrada"
                  data={input.data}
                  root={input.root}
                  variableFor={input.variableFor}
                  fileName={`${node.name}-entrada`}
                  toolbar={
                    options.length > 1 && (
                      <label className="ndv-source">
                        <span>Dados de</span>
                        <select value={input.id} onChange={(event) => setInputFrom(event.target.value)}>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  }
                />
              ) : (
                <div className="ndv-empty">
                  <p>
                    {status === 'skipped'
                      ? 'Este bloco não foi percorrido nesta execução, e nenhum bloco anterior registrou dados.'
                      : 'Sem entrada registrada para este bloco nesta execução.'}
                  </p>
                </div>
              ))}
          </section>
          <section
            id={`${baseId}-parameters`}
            className="flow-detail-parameters"
            data-area="parameters"
            aria-label="Parâmetros"
          >
            <h3>Parâmetros</h3>
            {parameters}
          </section>
          <section id={`${baseId}-output`} className="flow-detail-data" data-area="output" aria-label="Saída">
            <h3>Saída</h3>
            {empty ??
              (!step ? (
                <div className="ndv-empty">
                  <p>Sem saída registrada para este bloco nesta execução.</p>
                </div>
              ) : status === 'skipped' ? (
                <div className="ndv-empty">
                  <p>Este bloco não foi percorrido nesta execução (pertence a outro caminho).</p>
                </div>
              ) : status === 'failed' ? (
                <div className="ndv-error" role="alert">
                  <strong>A etapa falhou</strong>
                  <p>{step.message || 'A etapa terminou com erro, sem mensagem registrada.'}</p>
                  <details>
                    <summary>Ver detalhe do erro</summary>
                    <dl>
                      {isObject(step.output) && typeof step.output.errorCode === 'string' && (
                        <>
                          <dt>Código</dt>
                          <dd>{step.output.errorCode}</dd>
                        </>
                      )}
                      <dt>Duração</dt>
                      <dd>{step.durationMs} ms</dd>
                    </dl>
                    <pre>{JSON.stringify(step.output ?? {}, null, 2)}</pre>
                  </details>
                </div>
              ) : (
                <>
                  <p className="ndv-step-state">
                    Estado: {stepStatusLabel(status)} · {step.durationMs} ms
                    {step.message ? ` · ${step.message}` : ''}
                  </p>
                  <DataPane
                    key={`${node.id}:output`}
                    side="output"
                    label="Saída"
                    data={step.output ?? {}}
                    root={`steps.${node.id}`}
                    fileName={`${node.name}-saida`}
                  />
                </>
              ))}
          </section>
        </div>
        {nav(children, 'next')}
      </div>
    </div>
  );
}
