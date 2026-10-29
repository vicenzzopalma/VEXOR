'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Workflow,
  PanelsTopLeft,
  LayoutTemplate,
  History,
  CircleHelp,
  ArrowUpRight,
  Users,
  Plug,
  Folder,
  ArrowRight,
  ServerCog,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from './ui';
import { api, type ProjectRecord, type WorkflowRecord } from '@/lib/api';
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [help, setHelp] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProject, setCurrentProject] = useState('');
  const [projectError, setProjectError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await api<ProjectRecord[]>('/projects');
        const workflowId = path.startsWith('/editor/') ? path.split('/')[2] : '';
        const current = workflowId
          ? (await api<WorkflowRecord>(`/workflows/${workflowId}`)).projectId
          : path.startsWith('/projetos/')
            ? path.split('/')[2]
            : '';
        if (active) {
          setProjects(rows);
          setCurrentProject(current);
          setProjectError('');
        }
      } catch (e) {
        if (active) setProjectError((e as Error).message);
      }
    };
    void load();
    window.addEventListener('vexor:projects-changed', load);
    return () => {
      active = false;
      window.removeEventListener('vexor:projects-changed', load);
    };
  }, [path]);
  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Navegação principal">
        <Link className="brand-symbol" href="/" aria-label="VEXOR, abrir projetos">
          <Workflow size={24} strokeWidth={2.4} />
        </Link>
        <div className="rail-items">
          <button
            className="rail-link project-switcher"
            title="Trocar projeto"
            aria-label="Trocar projeto"
            onClick={() => setSwitcher(true)}
          >
            <Folder size={21} />
            <span>Trocar projeto</span>
          </button>
          {[
            { href: '/', icon: PanelsTopLeft, label: 'Projetos' },
            ...(currentProject
              ? [{ href: `/projetos/${currentProject}`, icon: Workflow, label: 'Fluxos do projeto' }]
              : []),
            { href: '/templates', icon: LayoutTemplate, label: 'Modelos' },
            { href: '/leads', icon: Users, label: 'Leads' },
            { href: '/execucoes', icon: History, label: 'Execuções' },
            { href: '/integracoes', icon: Plug, label: 'Integrações' },
            { href: '/provisionamento', icon: ServerCog, label: 'Provisionamento' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={`rail-link ${(href.startsWith('/editor') ? path.startsWith('/editor') : href === '/integracoes' ? path.startsWith('/integracoes') : path === href) ? 'active' : ''}`}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
        <div className="rail-bottom">
          <button
            className="rail-link"
            title="Ajuda e atalhos"
            aria-label="Ajuda e atalhos"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={21} />
            <span>Ajuda e atalhos</span>
          </button>
          <div className="avatar" title="Sessão local de desenvolvimento">
            EU
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="global-header">
          <div className="brand-word">
            VEXOR<span>studio</span>
          </div>
          <div className="global-divider" />
          <span className="workspace-name">
            {projects.find((p) => p.id === currentProject)?.name ?? 'Meu espaço de trabalho'}
          </span>
          <div className="global-right">
            <span className="local-badge">
              <span />
              Ambiente local
            </span>
            <button className="text-button" onClick={() => setHelp(true)}>
              Central de ajuda <ArrowUpRight size={13} />
            </button>
          </div>
        </header>
        {children}
      </div>
      {switcher && (
        <Dialog title="Trocar projeto" onClose={() => setSwitcher(false)}>
          {projectError && (
            <p role="alert">{projectError} Feche e recarregue a página para tentar novamente.</p>
          )}
          <div className="project-switcher-list">
            {projects
              .filter((p) => !p.archivedAt)
              .map((p) => (
                <Link
                  aria-current={p.id === currentProject ? 'page' : undefined}
                  key={p.id}
                  href={`/projetos/${p.id}`}
                  onClick={() => setSwitcher(false)}
                >
                  <Folder size={17} />
                  <span>{p.name}</span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            <Link href="/" onClick={() => setSwitcher(false)}>
              Ver todos os projetos
            </Link>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="Um processo simples, do seu jeito" onClose={() => setHelp(false)}>
          <p className="muted">
            Arraste um bloco ou clique nele para adicionar. Selecione um bloco para personalizar. Arraste
            entre as alças para conectar.
          </p>
          <div className="shortcut-list">
            <p>
              <span>Desfazer / refazer</span>
              <kbd>Ctrl Z / Ctrl Shift Z</kbd>
            </p>
            <p>
              <span>Duplicar seleção</span>
              <kbd>Ctrl D</kbd>
            </p>
            <p>
              <span>Excluir seleção</span>
              <kbd>Delete</kbd>
            </p>
            <p>
              <span>Selecionar vários</span>
              <kbd>Shift + arrastar</kbd>
            </p>
            <p>
              <span>Salvar agora</span>
              <kbd>Ctrl S</kbd>
            </p>
          </div>
          <div className="info-box">
            Publicar preserva uma versão imutável. Testar simula o caminho no servidor, sem enviar e-mails ou
            notificações. A execução externa será habilitada em uma próxima fase.
          </div>
        </Dialog>
      )}
    </div>
  );
}
