
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Workflow, PanelsTopLeft, LayoutTemplate, History, CircleHelp, ArrowUpRight, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Dialog } from './ui';
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [help, setHelp] = useState(false);
  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Navegação principal">
        <Link className="brand-symbol" href="/editor/starter-sdr" aria-label="EIMAX, abrir editor">
          <Workflow size={24} strokeWidth={2.4} />
        </Link>
        <div className="rail-items">
          {[
            { href: '/processos', icon: PanelsTopLeft, label: 'Meus processos' },
            { href: '/editor/starter-sdr', icon: Workflow, label: 'Editor de processos' },
            { href: '/templates', icon: LayoutTemplate, label: 'Modelos' },
            { href: '/leads', icon: Users, label: 'Leads' },
            { href: '/execucoes', icon: History, label: 'Execuções' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={`rail-link ${(href.startsWith('/editor') ? path.startsWith('/editor') : path === href) ? 'active' : ''}`}
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
          </button>
          <div className="avatar" title="Sessão local de desenvolvimento">
            EU
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="global-header">
          <div className="brand-word">
            eimax<span>studio</span>
          </div>
          <div className="global-divider" />
          <span className="workspace-name">Meu espaço de trabalho</span>
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
