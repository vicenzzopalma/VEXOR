
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, GitBranch, History, LoaderCircle, Plus, Search, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, type Run } from '@/lib/api';
import { Button, Dialog, Loading } from './ui';
import { RunLog } from './run-log';
type Process = {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: string;
  revision: number;
  versions: number;
  simulations: number;
};
export function ProcessList() {
  const [rows, setRows] = useState<Process[]>();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    api<Process[]>('/workflows')
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  if (!rows && !error) return <Loading />;
  const filtered = rows?.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Seu espaço de criação</div>
          <h1>Meus processos</h1>
          <p>Pequenas conexões. Grandes possibilidades para sua operação.</p>
        </div>
        <Link href="/templates" className="btn btn-primary">
          <Plus size={15} />
          Criar processo
        </Link>
      </div>
      <div className="listing-search">
        <Search size={16} />
        <input
          aria-label="Buscar processos"
          placeholder="Encontre seu processo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && (
        <div className="validation-errors" role="alert">
          {error}
          <Button onClick={() => location.reload()}>Tentar novamente</Button>
        </div>
      )}
      {filtered.length ? (
        <div className="table-overflow">
          <table className="process-table">
            <thead>
              <tr>
                <th>Processo</th>
                <th>Blocos</th>
                <th>Publicações</th>
                <th>Simulações</th>
                <th>Última alteração</th>
                <th>
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/editor/${row.id}`}>
                      <span className="table-icon">
                        <Workflow size={19} />
                      </span>
                      {row.name}
                    </Link>
                  </td>
                  <td>{row.nodeCount}</td>
                  <td>{row.versions ? `v${row.versions}` : 'Rascunho'}</td>
                  <td>{row.simulations}</td>
                  <td>
                    {new Date(row.updatedAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <Link className="btn" href={`/editor/${row.id}`}>
                      Abrir editor <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Search size={30} />
            <h3>Nenhum processo encontrado</h3>
            <p>Experimente outra busca ou comece com um modelo.</p>
          </div>
        )
      )}
    </main>
  );
}
function Preview() {
  return (
    <div className="template-preview" aria-label="Prévia do processo SDR">
      <svg viewBox="0 0 300 180" role="img">
        <title>Um gatilho e uma condição com dois caminhos</title>
        <path
          className="preview-path"
          d="M150 33V58 M150 84V98 Q150 105 140 105H85Q75 105 75 115V127 M150 84V98 Q150 105 160 105H215Q225 105 225 115V127 M75 150V176"
        />
        <rect className="preview-node" x="112" y="10" width="76" height="26" rx="5" />
        <circle cx="123" cy="23" r="4" fill="#88bba4" />
        <rect x="133" y="20" width="42" height="4" rx="2" fill="#ece7f3" />
        <rect className="preview-node" x="109" y="59" width="82" height="27" rx="5" />
        <circle cx="121" cy="72" r="4" fill="#d6bb76" />
        <rect x="131" y="70" width="46" height="4" rx="2" fill="#ece7f3" />
        <rect className="preview-node" x="36" y="125" width="80" height="27" rx="5" />
        <circle cx="48" cy="138" r="4" fill="#8ba5d0" />
        <rect x="58" y="136" width="44" height="4" rx="2" fill="#ece7f3" />
        <rect className="preview-node" x="185" y="125" width="80" height="27" rx="5" />
        <circle cx="197" cy="138" r="4" fill="#b19bd5" />
        <rect x="207" y="136" width="44" height="4" rx="2" fill="#ece7f3" />
      </svg>
    </div>
  );
}
export function TemplateList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('Meu processo SDR');
  const [dialog, setDialog] = useState(false);
  const create = async () => {
    setCreating(true);
    try {
      const row = await api<{ id: string }>('/workflows', {
        method: 'POST',
        body: JSON.stringify({ template: 'sdr', name }),
      });
      router.push(`/editor/${row.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };
  const visible = 'qualificação de leads sdr comercial vendas'.includes(search.toLowerCase());
  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Um começo inteligente</div>
          <h1>Biblioteca de modelos</h1>
          <p>Seu próximo processo não precisa começar do zero.</p>
        </div>
        <Link href="/processos" className="btn">
          Meus processos <ArrowRight size={13} />
        </Link>
      </div>
      <section className="templates-banner">
        <h2>
          Menos tarefas repetitivas.
          <br />
          <span>Mais oportunidades.</span>
        </h2>
        <p>Escolha um modelo, personalize os detalhes e encontre o melhor caminho para cada lead.</p>
        <Workflow aria-hidden="true" />
      </section>
      <div className="listing-search">
        <Search size={16} />
        <input
          aria-label="Buscar modelos"
          placeholder="Buscar por objetivo ou processo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="template-grid">
        {visible && (
          <article className="template-card">
            <Preview />
            <h3>Qualificação de leads</h3>
            <p>Receba uma oportunidade, avalie o orçamento e direcione cada lead para o próximo passo.</p>
            <div className="template-meta">
              <GitBranch size={13} />6 blocos · SDR<span>Pronto para personalizar</span>
            </div>
            <Button variant="primary" onClick={() => setDialog(true)}>
              Usar este modelo <ArrowRight size={14} />
            </Button>
          </article>
        )}
      </div>
      {!visible && (
        <div className="empty-state">
          <Search size={28} />
          <h3>Nenhum modelo encontrado</h3>
          <p>Tente buscar por SDR ou qualificação.</p>
        </div>
      )}
      <p className="template-notice">
        Novos modelos de vendas e atendimento serão adicionados nas próximas fases.
      </p>
      {dialog && (
        <Dialog title="Dê um nome ao seu processo" onClose={() => !creating && setDialog(false)}>
          <p className="muted">
            Uma nova cópia será salva no seu espaço. Todos os blocos podem ser personalizados.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="field" style={{ marginTop: 20 }}>
              Nome do processo
              <input
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {error && (
              <p className="validation-errors" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button type="button" onClick={() => setDialog(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={creating || !name.trim()}>
                {creating ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}Criar e
                personalizar
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </main>
  );
}
export function RunList() {
  const [rows, setRows] = useState<Run[]>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Run>();
  useEffect(() => {
    api<Run[]>('/simulations')
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  if (!rows && !error) return <Loading />;
  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Cada passo, com clareza</div>
          <h1>Histórico de simulações</h1>
          <p>Resultados persistidos no servidor. Nenhuma ação externa foi enviada.</p>
        </div>
        <Link href="/processos" className="btn">
          Ver processos <ArrowRight size={14} />
        </Link>
      </div>
      {error && (
        <div className="validation-errors" role="alert">
          {error}
        </div>
      )}
      {rows?.length ? (
        <div className="runs-list">
          {rows.map((row) => (
            <article className="run-card" key={row.id}>
              <span className="table-icon">
                <History size={18} />
              </span>
              <div>
                <h3>{row.workflowName}</h3>
                <p>
                  {new Date(row.createdAt).toLocaleString('pt-BR')} ·{' '}
                  {row.steps.filter((s) => s.status === 'success').length} etapas concluídas
                </p>
              </div>
              <span className="success-pill">{row.status === 'success' ? 'Concluída' : 'Falha'}</span>
              <Button onClick={() => setSelected(row)}>
                Consultar resultado <ArrowRight size={12} />
              </Button>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Clock3 size={32} />
            <h3>A história do seu processo começa com um teste</h3>
            <p>Abra o editor e simule um lead. O resultado de cada etapa ficará disponível aqui.</p>
            <Link href="/editor/starter-sdr" className="btn btn-primary">
              Abrir editor
            </Link>
          </div>
        )
      )}
      {selected && (
        <Dialog title={`Simulação · ${selected.workflowName}`} wide onClose={() => setSelected(undefined)}>
          <RunLog run={selected} onClose={() => setSelected(undefined)} />
        </Dialog>
      )}
    </main>
  );
}
