'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock3,
  GitBranch,
  History,
  LoaderCircle,
  Plus,
  Search,
  Workflow,
  Zap,
  Users,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, type Run, type ExecutionRecord, type LeadRecord } from '@/lib/api';
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
  const [tab, setTab] = useState<'real' | 'simulation'>('real');
  const [realRuns, setRealRuns] = useState<ExecutionRecord[]>();
  const [simRuns, setSimRuns] = useState<Run[]>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<any>();

  useEffect(() => {
    if (tab === 'real') {
      api<ExecutionRecord[]>('/executions')
        .then(setRealRuns)
        .catch((e) => setError(e.message));
    } else {
      api<Run[]>('/simulations')
        .then(setSimRuns)
        .catch((e) => setError(e.message));
    }
  }, [tab]);

  const loading = tab === 'real' ? !realRuns && !error : !simRuns && !error;
  if (loading) return <Loading />;

  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">
            {tab === 'real' ? 'Operação em tempo real' : 'Cada passo, com clareza'}
          </div>
          <h1>{tab === 'real' ? 'Histórico de execuções reais' : 'Histórico de simulações'}</h1>
          <p>
            {tab === 'real'
              ? 'Execuções realizadas pelo motor e persistidas no PostgreSQL com SDR e notificações.'
              : 'Resultados simulados no servidor. Nenhuma ação externa foi enviada.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/leads" className="btn">
            Ver leads <ArrowRight size={14} />
          </Link>
          <Link href="/processos" className="btn">
            Ver processos <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          className={`btn ${tab === 'real' ? 'btn-primary' : ''}`}
          onClick={() => setTab('real')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Zap size={15} />
          Execuções Reais
        </button>
        <button
          className={`btn ${tab === 'simulation' ? 'btn-primary' : ''}`}
          onClick={() => setTab('simulation')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <History size={15} />
          Simulações
        </button>
      </div>

      {error && (
        <div className="validation-errors" role="alert">
          {error}
        </div>
      )}

      {tab === 'real' ? (
        realRuns?.length ? (
          <div className="runs-list">
            {realRuns.map((row) => (
              <article className="run-card" key={row.id}>
                <span className="table-icon" style={{ color: '#7c3aed' }}>
                  <Zap size={18} />
                </span>
                <div>
                  <h3>{row.leadSummary ? `${row.leadSummary.name} (${row.leadSummary.company})` : row.id}</h3>
                  <p>
                    {new Date(row.createdAt).toLocaleString('pt-BR')} ·{' '}
                    {row.steps.filter((s) => s.status === 'success' || s.status === 'COMPLETED').length}{' '}
                    etapas concluídas ·{' '}
                    {row.leadSummary?.assignedTo ? `SDR: ${row.leadSummary.assignedTo}` : 'Sem atribuição'}
                  </p>
                </div>
                <span
                  className="success-pill"
                  style={row.status === 'COMPLETED' ? { background: '#dcfce7', color: '#166534' } : {}}
                >
                  {row.status === 'COMPLETED' ? 'Concluída' : row.status}
                </span>
                <Button onClick={() => setSelected({ ...row, mode: 'real' })}>
                  Consultar resultado <ArrowRight size={12} />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          !error && (
            <div className="empty-state">
              <Zap size={32} />
              <h3>Nenhuma execução real registrada</h3>
              <p>Envie um lead por webhook ou execute um teste real do processo publicado.</p>
            </div>
          )
        )
      ) : simRuns?.length ? (
        <div className="runs-list">
          {simRuns.map((row) => (
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
              <Button onClick={() => setSelected({ ...row, mode: 'simulation' })}>
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
        <Dialog
          title={
            selected.mode === 'real'
              ? `Execução Real · ${selected.leadSummary?.name || selected.id}`
              : `Simulação · ${selected.workflowName}`
          }
          wide
          onClose={() => setSelected(undefined)}
        >
          <RunLog run={selected} onClose={() => setSelected(undefined)} />
        </Dialog>
      )}
    </main>
  );
}

export function LeadList() {
  const [leads, setLeads] = useState<LeadRecord[]>();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [members, setMembers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadRecord>();

  useEffect(() => {
    api<typeof members>('/memberships')
      .then(setMembers)
      .catch((e) => setError(e.message));
    api<{ role: string }>('/me')
      .then((me) => setCanEdit(['owner', 'editor'].includes(me.role)))
      .catch((e) => setError(e.message));
    api<LeadRecord[]>('/leads')
      .then(setLeads)
      .catch((e) => setError(e.message));
  }, []);

  async function openLead(lead: LeadRecord) {
    try {
      setSelectedLead(await api<LeadRecord>(`/leads/${lead.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveLead() {
    if (!selectedLead) return;
    setSaving(true);
    setError('');
    try {
      await api(`/leads/${selectedLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: selectedLead.status,
          tags: selectedLead.tags.filter(Boolean),
          assignedMembershipId: selectedLead.assignedMembership?.id ?? null,
          whatsappConsent: selectedLead.whatsappConsent,
          ...(selectedLead.phone ? { phone: selectedLead.phone } : {}),
        }),
      });
      const detail = await api<LeadRecord>(`/leads/${selectedLead.id}`);
      setSelectedLead(detail);
      setLeads((rows) => rows?.map((row) => (row.id === detail.id ? { ...row, ...detail } : row)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!leads && !error) return <Loading />;

  const filtered =
    leads?.filter((l) => {
      const matchesSearch =
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.company.toLowerCase().includes(search.toLowerCase()) ||
        l.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || l.status === statusFilter;
      const matchesSource = sourceFilter === 'ALL' || l.source === sourceFilter;
      const matchesOwner =
        ownerFilter === 'ALL' ||
        (ownerFilter === 'NONE' ? !l.assignedMembership : l.assignedMembership?.id === ownerFilter);
      return matchesSearch && matchesStatus && matchesSource && matchesOwner;
    }) ?? [];

  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Gestão Comercial Ativa</div>
          <h1>Leads & Oportunidades</h1>
          <p>Leads reais recebidos por webhook ou formulário, classificados e atribuídos a responsáveis.</p>
        </div>
        <Link href="/execucoes" className="btn">
          Ver execuções <ArrowRight size={14} />
        </Link>
      </div>

      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '20px' }}
      >
        <div className="listing-search" style={{ flex: 1, marginBottom: 0 }}>
          <Search size={16} />
          <input
            aria-label="Buscar leads"
            placeholder="Buscar por nome, empresa ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            fontSize: '13px',
            color: '#374151',
          }}
        >
          <option value="ALL">Todos os status</option>
          <option value="QUALIFIED">Qualificados</option>
          <option value="DISQUALIFIED">Desqualificados</option>
          <option value="NEW">Novos</option>
        </select>
        <select
          aria-label="Filtrar por origem"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="ALL">Todas as origens</option>
          {[...new Set(leads?.map((l) => l.source))].map((source) => (
            <option value={source} key={source}>
              {source}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por responsável"
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
        >
          <option value="ALL">Todos os responsáveis</option>
          <option value="NONE">Sem responsável</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="validation-errors" role="alert">
          {error}
        </div>
      )}

      {filtered.length ? (
        <div className="table-overflow">
          <table className="process-table">
            <thead>
              <tr>
                <th>Lead / Empresa</th>
                <th>Contato</th>
                <th>Orçamento</th>
                <th>Status</th>
                <th>SDR Responsável</th>
                <th>Notificações</th>
                <th>Recebido em</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.name}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{lead.company}</div>
                  </td>
                  <td>{lead.email}</td>
                  <td>
                    {lead.source === 'whatsapp' && !lead.budget
                      ? 'Não informado'
                      : `R$ ${lead.budget.toLocaleString('pt-BR')}`}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background:
                          lead.status === 'QUALIFIED'
                            ? '#dcfce7'
                            : lead.status === 'DISQUALIFIED'
                              ? '#fee2e2'
                              : '#fef3c7',
                        color:
                          lead.status === 'QUALIFIED'
                            ? '#166534'
                            : lead.status === 'DISQUALIFIED'
                              ? '#991b1b'
                              : '#92400e',
                      }}
                    >
                      {lead.status === 'QUALIFIED'
                        ? 'Qualificado'
                        : lead.status === 'DISQUALIFIED'
                          ? 'Desqualificado'
                          : lead.status}
                    </span>
                  </td>
                  <td>
                    {lead.assignedMembership ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: '#15803d',
                          fontWeight: 500,
                        }}
                      >
                        <UserCheck size={14} />
                        {lead.assignedMembership.displayName}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Não atribuído</span>
                    )}
                  </td>
                  <td>{lead.notificationsCount} gerada(s)</td>
                  <td>
                    {new Date(lead.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <Button onClick={() => openLead(lead)}>Ver detalhes</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Users size={32} />
            <h3>Nenhum lead comercial registrado</h3>
            <p>Envie um lead por webhook ou execute um teste para vê-lo qualificado aqui.</p>
          </div>
        )
      )}

      {selectedLead && (
        <Dialog title={`Lead · ${selectedLead.name}`} wide onClose={() => setSelectedLead(undefined)}>
          {error && (
            <div className="validation-errors" role="alert">
              {error}
            </div>
          )}
          <div style={{ padding: '8px 0', fontSize: '14px', lineHeight: 1.6 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              <div>
                <p>
                  <strong>Empresa:</strong> {selectedLead.company}
                </p>
                <p>
                  <strong>E-mail:</strong> {selectedLead.email}
                </p>
                <p>
                  <strong>Origem:</strong> {selectedLead.source}
                </p>
              </div>
              <div>
                <p>
                  <strong>Orçamento:</strong> R$ {selectedLead.budget.toLocaleString('pt-BR')}
                </p>
                <p>
                  <strong>Score de Qualificação:</strong> {selectedLead.score} / 100
                </p>
                <p>
                  <strong>SDR Responsável:</strong>{' '}
                  {selectedLead.assignedMembership?.displayName ?? 'Aguardando atribuição'}
                </p>
              </div>
            </div>

            {Array.isArray(selectedLead.tags) && selectedLead.tags.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <strong>Etiquetas:</strong>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {selectedLead.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '2px 8px',
                        background: '#f1f5f9',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#475569',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <fieldset disabled={!canEdit || saving} className="inspector-fields">
              <label className="field">
                Responsável
                <select
                  value={selectedLead.assignedMembership?.id ?? ''}
                  onChange={(e) =>
                    setSelectedLead({
                      ...selectedLead,
                      assignedMembership: e.target.value
                        ? { ...members.find((m) => m.id === e.target.value)!, role: 'editor' }
                        : null,
                    })
                  }
                >
                  <option value="">Sem responsável</option>
                  {members.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Status
                <select
                  value={selectedLead.status}
                  onChange={(e) => setSelectedLead({ ...selectedLead, status: e.target.value })}
                >
                  {['NEW', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'].map((status) => (
                    <option key={status} value={status}>
                      {
                        (
                          {
                            NEW: 'Novo',
                            IN_PROGRESS: 'Em atendimento',
                            QUALIFIED: 'Qualificado',
                            DISQUALIFIED: 'Desqualificado',
                            CONVERTED: 'Convertido',
                          } as Record<string, string>
                        )[status]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Etiquetas (separadas por vírgula)
                <input
                  value={selectedLead.tags.join(', ')}
                  onChange={(e) =>
                    setSelectedLead({ ...selectedLead, tags: e.target.value.split(',').map((t) => t.trim()) })
                  }
                />
              </label>
              <label className="field">
                Telefone WhatsApp
                <input
                  value={selectedLead.phone ?? ''}
                  placeholder="+5511999999999"
                  onChange={(e) => setSelectedLead({ ...selectedLead, phone: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedLead.whatsappConsent ?? false}
                  onChange={(e) => setSelectedLead({ ...selectedLead, whatsappConsent: e.target.checked })}
                />{' '}
                Consentimento do destinatário confirmado para este canal
              </label>
              <Button onClick={saveLead} disabled={!canEdit || saving}>
                Salvar alterações do lead
              </Button>
            </fieldset>
            <h3>Conversa e mensagens</h3>
            {selectedLead.conversation?.length ? (
              selectedLead.conversation.map((event) => (
                <div className="info-box" key={event.id}>
                  <div>
                    <small>
                      {new Date(event.createdAt).toLocaleString('pt-BR')} · Recebida · {event.status}
                    </small>
                    <p>{event.text}</p>
                    {event.errorCode && <p>{event.errorCode}</p>}
                  </div>
                </div>
              ))
            ) : (
              <p className="field-helper">Nenhuma mensagem recebida vinculada.</p>
            )}
            {selectedLead.notifications
              ?.filter((item) => ['WHATSAPP', 'EMAIL'].includes(item.channel))
              .map((item) => (
                <div className="info-box" key={item.id}>
                  {item.channel} · {item.status}
                  {item.providerMessageId ? ` · ID: ${item.providerMessageId}` : ''}
                  {item.errorCode ? ` · ${item.errorCode}` : ''}
                </div>
              ))}
            <h3>Histórico de automações</h3>
            {selectedLead.executions?.length ? (
              selectedLead.executions.map((execution) => (
                <div className="info-box" key={execution.id}>
                  <span>
                    {new Date(execution.createdAt).toLocaleString('pt-BR')} · {execution.status} · tentativa{' '}
                    {execution.attempt}
                    {execution.errorCode ? ` · ${execution.errorCode}` : ''}
                  </span>
                </div>
              ))
            ) : (
              <p className="field-helper">Nenhuma execução vinculada.</p>
            )}

            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <Button variant="primary" onClick={() => setSelectedLead(undefined)}>
                Fechar
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </main>
  );
}
