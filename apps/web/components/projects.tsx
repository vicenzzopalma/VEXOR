'use client';
import { SystemOptOut } from './system-opt-out';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Check,
  Copy,
  Folder,
  GitBranch,
  LockKeyhole,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Users,
  Workflow,
  ShieldCheck,
} from 'lucide-react';
import { api, type ProjectRecord, type ProjectWorkflow } from '@/lib/api';
import { Button, Dialog } from './ui';
import { RunList } from './listings';

const date = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const projectIcons = { folder: Folder, workflow: Workflow, users: Users };
function ProjectIcon({ project }: { project: Pick<ProjectRecord, 'color' | 'icon'> }) {
  const Icon = projectIcons[project.icon as keyof typeof projectIcons] ?? Folder;
  return (
    <span className={`project-icon project-color-${project.color ?? 'primary'}`}>
      <Icon size={22} aria-hidden="true" />
    </span>
  );
}
function Failure({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="validation-errors" role="alert">
      <p>{error}</p>
      <Button type="button" onClick={reload}>
        Recarregar dados
      </Button>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="projects-grid" role="status" aria-label="Carregando projetos">
      {[0, 1, 2].map((id) => (
        <div className="project-card project-skeleton" key={id}>
          <div />
          <div />
          <div />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
function useShortcuts(
  search: React.RefObject<HTMLInputElement | null>,
  create: () => void,
  enabled: boolean,
) {
  const latest = useRef(create);
  latest.current = create;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !enabled ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]') ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable || event.target.closest('input,textarea,select,button,summary')))
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        latest.current();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, search]);
}
function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="project-menu">
      <summary className="icon-btn" aria-label={label} title={label}>
        <MoreHorizontal size={18} />
      </summary>
      <div onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>
        {children}
      </div>
    </details>
  );
}
function ProjectForm({
  project,
  saved,
  close,
}: {
  project?: ProjectRecord;
  saved: () => void;
  close: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? 'primary');
  const [icon, setIcon] = useState(project?.icon ?? 'folder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog
      title={project ? 'Editar projeto' : 'Novo projeto'}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form
        className="project-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await api(project ? `/projects/${project.id}` : '/projects', {
              method: project ? 'PATCH' : 'POST',
              body: JSON.stringify({
                name,
                description: description || null,
                color,
                icon,
                ...(project ? { revision: project.revision } : {}),
              }),
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome do projeto
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Atendimento"
          />
        </label>
        <label>
          Descrição <span className="muted">(opcional)</span>
          <textarea
            maxLength={1000}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que sua equipe organiza aqui?"
          />
        </label>
        <div className="project-form-pair">
          <label>
            Cor
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="primary">Violeta</option>
              <option value="success">Verde</option>
              <option value="neutral">Neutra</option>
            </select>
          </label>
          <label>
            Ícone
            <select value={icon} onChange={(e) => setIcon(e.target.value)}>
              <option value="folder">Pasta</option>
              <option value="workflow">Fluxo</option>
              <option value="users">Equipe</option>
            </select>
          </label>
        </div>
        {error && (
          <div role="alert" className="validation-errors">
            {error}
            <Button
              type="button"
              onClick={() => {
                saved();
              }}
            >
              Recarregar lista
            </Button>
          </div>
        )}
        <div className="project-form-actions">
          <Button type="button" disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy || !name.trim()}>
            {busy ? 'Salvando…' : project ? 'Salvar projeto' : 'Criar projeto'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProjectHome() {
  const [projects, setProjects] = useState<ProjectRecord[]>();
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<ProjectRecord | 'new'>();
  const [confirm, setConfirm] = useState<ProjectRecord>();
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<ProjectRecord>();
  const search = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    try {
      const [rows, me] = await Promise.all([api<ProjectRecord[]>('/projects'), api<{ role: string }>('/me')]);
      setProjects(rows);
      setRole(me.role);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const canEdit = role === 'owner' || role === 'editor';
  useShortcuts(search, () => setForm('new'), canEdit);
  const changeArchive = async (project: ProjectRecord, restore = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<ProjectRecord>(`/projects/${project.id}/${restore ? 'restore' : 'archive'}`, {
        method: 'POST',
        body: JSON.stringify({ revision: project.revision }),
      });
      setConfirm(undefined);
      setUndo(restore ? undefined : updated);
      await reload();
      window.dispatchEvent(new Event('vexor:projects-changed'));
    } catch (e) {
      setError((e as Error).message);
      setConfirm(undefined);
    } finally {
      setBusy(false);
    }
  };
  const visible = (projects ?? [])
    .filter(
      (p) =>
        Boolean(p.archivedAt) === archived &&
        `${p.name} ${p.description ?? ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(query.toLocaleLowerCase('pt-BR')),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
    );
  return (
    <main className="listing-page projects-page">
      <div className="listing-heading">
        <div>
          <h1>Projetos</h1>
          <p>Organize seus fluxos por equipe, operação ou objetivo.</p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={() => setForm('new')}>
            <Plus size={16} />
            Novo projeto<kbd>N</kbd>
          </Button>
        )}
      </div>
      <div className="projects-toolbar">
        <div className="listing-search">
          <Search size={17} />
          <input
            ref={search}
            aria-label="Buscar projetos"
            placeholder="Buscar projetos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <label className="project-sort">
          Ordenar por
          <select aria-label="Ordenar projetos" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Atividade recente</option>
            <option value="name">Nome</option>
          </select>
        </label>
        <Button aria-pressed={archived} onClick={() => setArchived((v) => !v)}>
          <Archive size={15} />
          {archived ? 'Ver ativos' : 'Arquivados'}
        </Button>
      </div>
      {error && <Failure error={error} reload={reload} />}
      {undo && (
        <div role="status" className="project-notice">
          <Check size={16} />
          Projeto arquivado. Os fluxos e históricos foram preservados.
          <Button onClick={() => changeArchive(undo, true)} disabled={busy}>
            Desfazer
          </Button>
        </div>
      )}
      {!projects && !error ? (
        <Skeleton />
      ) : visible.length ? (
        <div className="projects-grid">
          {visible.map((p) => (
            <article className="project-card" key={p.id}>
              <div className="project-card-top">
                <ProjectIcon project={p} />
                {canEdit && (
                  <Menu label={`Ações do projeto ${p.name}`}>
                    <button onClick={() => setForm(p)}>
                      <Pencil size={15} />
                      Editar projeto
                    </button>
                    {role === 'owner' && (
                      <button
                        disabled={busy}
                        onClick={() => (p.archivedAt ? changeArchive(p, true) : setConfirm(p))}
                      >
                        {p.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        {p.archivedAt ? 'Restaurar projeto' : 'Arquivar projeto'}
                      </button>
                    )}
                  </Menu>
                )}
              </div>
              <Link className="project-card-link" href={`/projetos/${p.id}`}>
                <h2>{p.name}</h2>
                <p>{p.description || 'Fluxos, execuções e acesso às credenciais.'}</p>
                <span className="project-open">
                  Abrir projeto
                  <ArrowRight size={16} />
                </span>
              </Link>
              <footer>
                <span>
                  <GitBranch size={14} />
                  {p.workflowCount} {p.workflowCount === 1 ? 'fluxo' : 'fluxos'} · SAIR ativo
                </span>
                <span>
                  Última atividade<time dateTime={p.lastActivityAt}>{date(p.lastActivityAt)}</time>
                </span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Folder size={34} />
            <h2>
              {query
                ? 'Nenhum projeto encontrado'
                : archived
                  ? 'Nenhum projeto arquivado'
                  : 'Seu primeiro projeto começa aqui'}
            </h2>
            <p>
              {query
                ? 'Tente outro nome ou limpe a busca.'
                : archived
                  ? 'Projetos arquivados ficam aqui e podem ser restaurados.'
                  : 'Crie um projeto para reunir os fluxos da sua operação.'}
            </p>
            {query ? (
              <Button onClick={() => setQuery('')}>Limpar busca</Button>
            ) : (
              canEdit &&
              !archived && (
                <Button variant="primary" onClick={() => setForm('new')}>
                  Criar projeto
                </Button>
              )
            )}
          </div>
        )
      )}
      {form && (
        <ProjectForm
          project={form === 'new' ? undefined : form}
          close={() => setForm(undefined)}
          saved={() => {
            setForm(undefined);
            void reload();
            window.dispatchEvent(new Event('vexor:projects-changed'));
          }}
        />
      )}
      {confirm && (
        <Dialog
          title="Arquivar projeto?"
          onClose={() => {
            if (!busy) setConfirm(undefined);
          }}
        >
          <p>
            “{confirm.name}” sairá da lista de projetos ativos. Você poderá restaurá-lo. Os fluxos, versões e
            históricos serão preservados; execuções e conexões não são interrompidas.
          </p>
          <div className="project-form-actions">
            <Button disabled={busy} onClick={() => setConfirm(undefined)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => changeArchive(confirm)}>
              Arquivar projeto
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

type Action =
  | { kind: 'create' }
  | { kind: 'rename' | 'move' | 'duplicate' | 'archive'; workflow: ProjectWorkflow };
export function ProjectWorkspace({ id, initialTab = 'fluxos' }: { id: string; initialTab?: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectRecord>();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [flows, setFlows] = useState<ProjectWorkflow[]>([]);
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action>();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ id: string; revision: number }>();
  const [showArchived, setShowArchived] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const tab = ['fluxos', 'execucoes', 'credenciais', 'descadastro'].includes(initialTab)
    ? initialTab
    : 'fluxos';
  const reload = useCallback(async () => {
    try {
      const [p, rows, options, me] = await Promise.all([
        api<ProjectRecord>(`/projects/${id}`),
        api<ProjectWorkflow[]>(`/projects/${id}/workflows`),
        api<ProjectRecord[]>('/projects'),
        api<{ role: string }>('/me'),
      ]);
      setProject(p);
      setFlows(rows);
      setProjects(options);
      setRole(me.role);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const canEdit = (role === 'owner' || role === 'editor') && !project?.archivedAt;
  const begin = (value: Action) => {
    setAction(value);
    setName(
      value.kind === 'create'
        ? ''
        : value.kind === 'duplicate'
          ? `${value.workflow.name} (cópia)`
          : value.workflow.name,
    );
    setTarget(projects.find((p) => p.id !== id && !p.archivedAt)?.id ?? '');
  };
  useShortcuts(search, () => begin({ kind: 'create' }), canEdit && tab === 'fluxos');
  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError('');
    try {
      if (action.kind === 'create') {
        const row = await api<{ id: string }>(`/projects/${id}/workflows`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        router.push(`/editor/${row.id}`);
      } else {
        const row = await api<{ id: string; revision: number }>(
          `/workflows/${action.workflow.id}/${action.kind === 'rename' ? 'name' : action.kind === 'archive' ? 'archive-revision' : action.kind}`,
          {
            method: action.kind === 'rename' ? 'PATCH' : 'POST',
            body: JSON.stringify({
              revision: action.workflow.revision,
              ...(action.kind === 'rename' || action.kind === 'duplicate' ? { name } : {}),
              ...(action.kind === 'move' ? { projectId: target } : {}),
            }),
          },
        );
        if (action.kind === 'archive') setUndo(row);
        await reload();
      }
      setAction(undefined);
      window.dispatchEvent(new Event('vexor:projects-changed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (workflow: { id: string; revision: number }) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/workflows/${workflow.id}/restore-revision`, {
        method: 'POST',
        body: JSON.stringify({ revision: workflow.revision }),
      });
      setUndo(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const visible = flows.filter(
    (f) =>
      Boolean(f.archivedAt) === showArchived &&
      f.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  // Fluxo do sistema (SAIR): abre em tela cheia, como o editor.
  if (tab === 'descadastro') return <SystemOptOut projectId={id} />;
  const showSystem =
    !showArchived && (!query || 'descadastro automatico sair'.includes(query.toLocaleLowerCase('pt-BR')));
  return (
    <main className="listing-page projects-page">
      <nav aria-label="Breadcrumb" className="project-breadcrumb">
        <Link href="/">Projetos</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{project?.name ?? 'Carregando projeto…'}</span>
      </nav>
      {!project && !error ? (
        <Skeleton />
      ) : (
        project && (
          <>
            <div className="listing-heading">
              <div className="project-title">
                <ProjectIcon project={project} />
                <div>
                  <h1>{project.name}</h1>
                  <p>{project.description || 'Organize os fluxos desta operação.'}</p>
                </div>
              </div>
              {canEdit && (
                <Button variant="primary" onClick={() => begin({ kind: 'create' })}>
                  <Plus size={16} />
                  Novo fluxo<kbd>N</kbd>
                </Button>
              )}
            </div>
            {project.archivedAt && (
              <div className="project-notice" role="status">
                <Archive size={17} />
                Projeto arquivado. Consulte os fluxos e históricos ou restaure-o na lista de projetos.
              </div>
            )}
            <nav className="project-tabs" aria-label="Seções do projeto">
              {[
                ['fluxos', 'Fluxos'],
                ['execucoes', 'Execuções'],
                ['credenciais', 'Credenciais'],
              ].map(([key, title]) => (
                <Link
                  aria-current={tab === key ? 'page' : undefined}
                  href={`/projetos/${id}?tab=${key}`}
                  key={key}
                >
                  {title}
                </Link>
              ))}
            </nav>
            {tab === 'fluxos' && (
              <>
                <div className="projects-toolbar">
                  <div className="listing-search">
                    <Search size={16} />
                    <input
                      ref={search}
                      aria-label="Buscar fluxos"
                      placeholder="Buscar fluxos neste projeto"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>/</kbd>
                  </div>
                  <Button onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
                    <Archive size={15} />
                    {showArchived ? 'Ver ativos' : 'Arquivados'}
                  </Button>
                  <span className="muted">
                    {visible.length} {visible.length === 1 ? 'fluxo' : 'fluxos'}
                  </span>
                </div>
                {showSystem && (
                  <div className="project-flows project-flows-system">
                    <article className="project-flow project-flow-system">
                      <div className="project-flow-name">
                        <ShieldCheck size={19} aria-hidden="true" />
                        <div>
                          <Link href={`/projetos/${id}?tab=descadastro`}>Descadastro automático (SAIR)</Link>
                          <span>
                            Fluxo do sistema · mensagem recebida → classificar → Esfera → confirmação ao devedor
                          </span>
                        </div>
                      </div>
                      <span className="project-status project-status-published">
                        <LockKeyhole size={11} aria-hidden="true" /> Sistema
                      </span>
                      <div className="project-flow-actions">
                        <span className="flow-active" title="Ativo enquanto o worker do VEXOR estiver rodando">
                          Ativo
                        </span>
                        <Link className="btn" href={`/projetos/${id}?tab=descadastro`}>
                          Abrir
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </article>
                  </div>
                )}
                {undo && (
                  <div role="status" className="project-notice">
                    <Check size={16} />
                    Fluxo arquivado.
                    <Button disabled={busy} onClick={() => restore(undo)}>
                      Desfazer
                    </Button>
                  </div>
                )}
                {visible.length ? (
                  <div className="project-flows">
                    {visible.map((f) => (
                      <article className="project-flow" key={f.id}>
                        <div className="project-flow-name">
                          <Workflow size={19} aria-hidden="true" />
                          <div>
                            <Link href={`/editor/${f.id}`}>{f.name}</Link>
                            <span>
                              {f.nodeCount} blocos · Última edição {date(f.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`project-status ${f.archivedAt ? '' : f.versions ? 'project-status-published' : ''}`}
                        >
                          {f.archivedAt ? 'Arquivado' : f.versions ? 'Publicado' : 'Rascunho'}
                        </span>
                        <div className="project-flow-actions">
                          <Link className="btn" href={`/editor/${f.id}`}>
                            Abrir
                            <ArrowRight size={14} />
                          </Link>
                          {canEdit &&
                            (f.archivedAt ? (
                              role === 'owner' && (
                                <Button disabled={busy} onClick={() => restore(f)}>
                                  Restaurar
                                </Button>
                              )
                            ) : (
                              <Menu label={`Ações do fluxo ${f.name}`}>
                                <button onClick={() => begin({ kind: 'rename', workflow: f })}>
                                  <Pencil size={15} />
                                  Renomear
                                </button>
                                <button onClick={() => begin({ kind: 'duplicate', workflow: f })}>
                                  <Copy size={15} />
                                  Duplicar
                                </button>
                                <button onClick={() => begin({ kind: 'move', workflow: f })}>
                                  <MoveRight size={15} />
                                  Mover para outro projeto
                                </button>
                                {role === 'owner' && (
                                  <button onClick={() => begin({ kind: 'archive', workflow: f })}>
                                    <Archive size={15} />
                                    Arquivar fluxo
                                  </button>
                                )}
                              </Menu>
                            ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Workflow size={32} />
                    <h2>
                      {query
                        ? 'Nenhum fluxo encontrado'
                        : showArchived
                          ? 'Nenhum fluxo arquivado'
                          : 'Crie o primeiro fluxo deste projeto'}
                    </h2>
                    <p>
                      {query
                        ? 'Tente outro termo ou limpe a busca.'
                        : showArchived
                          ? 'Fluxos arquivados podem ser restaurados.'
                          : 'Comece pelo modelo de qualificação e personalize no editor.'}
                    </p>
                    {query ? (
                      <Button onClick={() => setQuery('')}>Limpar busca</Button>
                    ) : (
                      canEdit &&
                      !showArchived && (
                        <Button variant="primary" onClick={() => begin({ kind: 'create' })}>
                          Criar fluxo
                        </Button>
                      )
                    )}
                  </div>
                )}
              </>
            )}
            {tab === 'execucoes' && <RunList projectId={id} />}
            {tab === 'credenciais' && (
              <section className="project-credentials">
                <Folder size={30} />
                <h2>Credenciais da organização</h2>
                <p>
                  As contas de integração são compartilhadas entre os projetos da sua organização. A
                  associação de cada conta é definida nos blocos do fluxo; não existe credencial exclusiva por
                  projeto nesta versão.
                </p>
                <Link href="/integracoes" className="btn btn-primary">
                  Gerenciar integrações
                  <ArrowRight size={15} />
                </Link>
                <Link href="/integracoes/whatsapp" className="btn">
                  Contas de WhatsApp
                </Link>
              </section>
            )}
          </>
        )
      )}
      {error && (
        <Failure
          error={error}
          reload={() => {
            setAction(undefined);
            void reload();
          }}
        />
      )}
      {action && (
        <Dialog
          title={
            {
              create: 'Novo fluxo',
              rename: 'Renomear fluxo',
              move: 'Mover fluxo',
              duplicate: 'Duplicar fluxo',
              archive: 'Arquivar fluxo?',
            }[action.kind]
          }
          onClose={() => {
            if (!busy) setAction(undefined);
          }}
        >
          <form
            className="project-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {['create', 'rename', 'duplicate'].includes(action.kind) && (
              <label>
                Nome do fluxo
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Qualificação de leads"
                />
              </label>
            )}
            {action.kind === 'move' && (
              <>
                <p>
                  O fluxo, suas versões e execuções serão mantidos. A integração de WhatsApp não será
                  alterada.
                </p>
                <label>
                  Projeto de destino
                  <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Selecione um projeto</option>
                    {projects
                      .filter((p) => p.id !== id && !p.archivedAt)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                {!target && <p className="muted">Crie outro projeto ativo para mover este fluxo.</p>}
              </>
            )}
            {action.kind === 'duplicate' && (
              <p className="muted">
                Uma cópia em rascunho será criada neste projeto. O histórico da origem será preservado.
              </p>
            )}
            {action.kind === 'archive' && (
              <p>
                “{action.workflow.name}” sairá da lista de fluxos ativos. Versões e históricos serão
                preservados. Você poderá desfazer.
              </p>
            )}
            {error && (
              <Failure
                error={error}
                reload={() => {
                  setAction(undefined);
                  void reload();
                }}
              />
            )}
            <div className="project-form-actions">
              <Button type="button" disabled={busy} onClick={() => setAction(undefined)}>
                Cancelar
              </Button>
              <Button
                variant={action.kind === 'archive' ? 'danger' : 'primary'}
                disabled={
                  busy || (action.kind === 'move' ? !target : action.kind !== 'archive' && !name.trim())
                }
              >
                {busy
                  ? 'Salvando…'
                  : {
                      create: 'Criar fluxo',
                      rename: 'Salvar nome',
                      move: 'Mover fluxo',
                      duplicate: 'Criar cópia',
                      archive: 'Arquivar fluxo',
                    }[action.kind]}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </main>
  );
}
