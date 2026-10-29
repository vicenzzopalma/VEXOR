'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, RefreshCw, ServerCog, XCircle } from 'lucide-react';
import type { OnboardingPlan } from '@eimax/workflow-schema';
import { Button, Loading } from '@/components/ui';
import { api } from '@/lib/api';

type Outcome = { itemId: string; nome: string; task: string; status: string; detail: string };
type Request = {
  id: string;
  title: string;
  status: string;
  plan: OnboardingPlan;
  answers: Record<string, string>;
  result: { outcomes: Outcome[] } | null;
  revision: number;
  errorCode: string | null;
  hasSecrets: boolean;
  createdAt: string;
  decidedAt: string | null;
  finishedAt: string | null;
};

const statusLabel: Record<string, string> = {
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado · na fila do worker',
  PROCESSING: 'Executando',
  COMPLETED: 'Concluído',
  PARTIAL: 'Concluído com falhas',
  FAILED: 'Falhou',
  REJECTED: 'Rejeitado',
};
const outcomeColor: Record<string, string> = {
  criado: '#047857',
  existente: '#1d4ed8',
  ignorado: '#6b7280',
  falhou: '#b91c1c',
};

export default function ProvisioningPage() {
  const [rows, setRows] = useState<Request[]>();
  const [selected, setSelected] = useState<Request>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (keepId?: string) => {
    try {
      const list = await api<Request[]>('/provisioning');
      setRows(list);
      const id = keepId ?? list[0]?.id;
      setSelected(list.find((r) => r.id === id));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected || !['APPROVED', 'PROCESSING'].includes(selected.status)) return;
    const timer = setInterval(() => void load(selected.id), 3000);
    return () => clearInterval(timer);
  }, [selected, load]);

  async function decide(decision: 'approve' | 'reject' | 'retry') {
    if (!selected) return;
    if (decision === 'approve' && !window.confirm('Aprovar e executar e-mails, encaminhadores e ramais?'))
      return;
    setBusy(true);
    setError('');
    try {
      const row = await api<Request>(`/provisioning/${selected.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ revision: selected.revision, decision, answers }),
      });
      setAnswers({});
      await load(row.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!selected) return;
    try {
      const res = await api<{ secrets: Record<string, string> }>(`/provisioning/${selected.id}/secrets`, {
        method: 'POST',
        body: '{}',
      });
      setSecrets(res.secrets);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!rows && !error) return <Loading />;
  const plan = selected?.plan;

  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">TI · Admissões</div>
          <h1>Provisionamento</h1>
          <p>
            Planos gerados pelo fluxo de admissão. Nada é criado no cPanel ou no Tarifando antes da sua
            aprovação.
          </p>
        </div>
        <Button onClick={() => void load(selected?.id)}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>
      {error && (
        <div className="info-box" role="alert" style={{ color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!rows?.length ? (
        <p>Nenhuma solicitação ainda. Execute o fluxo “Admissão de colaboradores (TI)”.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 20 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  className={`btn ${row.id === selected?.id ? 'btn-primary' : ''}`}
                  style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => {
                    setSelected(row);
                    setSecrets(undefined);
                    setAnswers({});
                  }}
                >
                  <ServerCog size={14} />
                  <span>
                    {row.title}
                    <br />
                    <small>
                      {statusLabel[row.status] ?? row.status} ·{' '}
                      {new Date(row.createdAt).toLocaleString('pt-BR')}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && plan && (
            <section style={{ display: 'grid', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{selected.title}</h2>
                <p style={{ margin: '4px 0' }}>
                  <strong>{statusLabel[selected.status] ?? selected.status}</strong>
                  {selected.errorCode ? ` · ${selected.errorCode}` : ''}
                </p>
              </div>
              {plan.warnings.length > 0 && (
                <div className="info-box">
                  {plan.warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              )}
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th>Colaborador</th>
                    <th>Setor</th>
                    <th>E-mail</th>
                    <th>Encaminhador</th>
                    <th>Ramal</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <tr key={item.id} style={{ borderTop: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                      <td>
                        <strong>{item.nome}</strong>
                        <br />
                        <small>
                          {item.cargo} · {item.horario} · CPF final {item.cpfFinal}
                        </small>
                      </td>
                      <td>{item.setor?.label ?? <em>{item.setorInformado} (sem regra)</em>}</td>
                      <td>{item.email || '—'}</td>
                      <td>{item.forward ? `${item.forward.from} → ${item.forward.to}` : 'Não se aplica'}</td>
                      <td>
                        {item.ramal.tipo === 2 ? 'PA' : 'PABX'} · {item.ramal.nome}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected.status === 'PENDING_APPROVAL' && plan.questions.length > 0 && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <h3 style={{ margin: 0 }}>Perguntas para aprovar</h3>
                  {plan.questions.map((q) => (
                    <label key={q.id} className="field">
                      {q.prompt}
                      <select
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      >
                        <option value="">Escolha…</option>
                        {q.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {selected.status === 'PENDING_APPROVAL' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="primary" disabled={busy} onClick={() => void decide('approve')}>
                    <CheckCircle2 size={14} /> Aprovar e executar
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => void decide('reject')}>
                    <XCircle size={14} /> Rejeitar
                  </Button>
                </div>
              )}
              {['PARTIAL', 'FAILED'].includes(selected.status) && (
                <div>
                  <Button disabled={busy} onClick={() => void decide('retry')}>
                    <RefreshCw size={14} /> Reprocessar (só o que faltou)
                  </Button>
                </div>
              )}
              {selected.result && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <h3 style={{ margin: 0 }}>Resultado</h3>
                  {selected.result.outcomes.map((o) => (
                    <div key={`${o.itemId}-${o.task}`}>
                      <strong style={{ color: outcomeColor[o.status] }}>{o.status}</strong> · {o.nome} ·{' '}
                      {o.task}: {o.detail}
                    </div>
                  ))}
                </div>
              )}
              {selected.hasSecrets && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {!secrets ? (
                    <div>
                      <Button onClick={() => void reveal()}>
                        <KeyRound size={14} /> Mostrar senhas geradas (somente owner)
                      </Button>
                    </div>
                  ) : (
                    Object.entries(secrets).map(([key, value]) => (
                      <div key={key}>
                        <code>{key}</code>: <code>{value}</code>
                      </div>
                    ))
                  )}
                </div>
              )}
              {plan.items.some((i) => i.manual.length) && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <h3 style={{ margin: 0 }}>Pendências manuais</h3>
                  {plan.items.map((item) => (
                    <div key={item.id}>
                      <strong>{item.nome}:</strong> {item.manual.join(' · ')}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
