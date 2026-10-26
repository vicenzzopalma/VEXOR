'use client';
import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleMinus,
  AlertCircle,
  ShieldCheck,
  Zap,
  X,
  Terminal,
  Clock3,
  Bell,
  UserCheck,
} from 'lucide-react';
import type { SimulationResult } from '@eimax/workflow-schema';
import type { ExecutionRecord } from '@/lib/api';

export type UnifiedRun =
  | (SimulationResult & { mode?: 'simulation'; workflowName?: string })
  | (ExecutionRecord & { mode?: 'real'; workflowName?: string });

export function RunLog({ run, onClose }: { run: UnifiedRun; onClose: () => void }) {
  const [open, setOpen] = useState<string>();
  const isReal = run.mode === 'real' || 'leadSummary' in run || 'attempt' in run;
  const execution = run as ExecutionRecord;
  const steps = run.steps || [];
  const successSteps = steps.filter((s) => s.status === 'success' || s.status === 'COMPLETED');

  return (
    <section
      className="run-console"
      aria-label={isReal ? 'Resultado da execução real' : 'Resultado da simulação'}
    >
      <div className="console-heading">
        <div>
          {isReal ? <Zap size={16} color="#7c3aed" /> : <Terminal size={16} />}
          <strong>{isReal ? 'Execução Comercial Real' : 'Resultado da Simulação'}</strong>
          <span className="success-pill">{successSteps.length} etapas concluídas</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar resultado">
          <X size={17} />
        </button>
      </div>

      <div className="console-note" style={isReal ? { background: '#f5f0ff', borderColor: '#d8b4fe' } : {}}>
        {isReal ? <Zap size={13} color="#7c3aed" /> : <ShieldCheck size={13} />}
        {isReal
          ? `Execução: ${execution.status === 'SUSPENDED' ? 'Aguardando' : execution.status}. Consulte cada etapa para verificar os efeitos persistidos.`
          : 'Nenhuma ação externa foi enviada. Entradas pessoais protegidas.'}
        <span>
          <Clock3 size={12} />
          {new Date(run.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {isReal &&
        execution.checkpoints?.map((checkpoint) => (
          <div className="info-box" key={checkpoint.id}>
            <Clock3 size={16} />
            <div>
              <strong>
                {checkpoint.status === 'WAITING' ? 'Aguardando' : 'Espera registrada'} ·{' '}
                {steps.find((s) => s.nodeId === checkpoint.nodeId)?.name ?? checkpoint.nodeId}
              </strong>
              <p>Suspensão: {new Date(checkpoint.suspendedAt).toLocaleString('pt-BR')}</p>
              <p>Previsão de continuar: {new Date(checkpoint.resumeAt).toLocaleString('pt-BR')}</p>
              {checkpoint.resumedAt && (
                <p>Retomada: {new Date(checkpoint.resumedAt).toLocaleString('pt-BR')}</p>
              )}
              {checkpoint.recoveryError && (
                <p role="alert">Erro de recuperação: {checkpoint.recoveryError}</p>
              )}
            </div>
          </div>
        ))}
      {isReal && execution.errorCode && <p className="validation-errors">{execution.errorCode}</p>}

      {isReal && execution.leadSummary && (
        <div
          style={{
            margin: '12px 0',
            padding: '12px 16px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <strong>
              Lead: {execution.leadSummary.name} ({execution.leadSummary.company})
            </strong>
            <span className="success-pill">{execution.leadSummary.status}</span>
          </div>
          {execution.leadSummary.assignedTo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#475569',
                fontSize: '12px',
              }}
            >
              <UserCheck size={14} color="#16a34a" />
              <span>
                SDR Atribuído: <strong>{execution.leadSummary.assignedTo}</strong>
              </span>
            </div>
          )}
          {execution.notifications && execution.notifications.length > 0 && (
            <div
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px dashed #e2e8f0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#6b21a8',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <Bell size={13} />
                <span>Registros de notificações ({execution.notifications.length}):</span>
              </div>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px', color: '#334155' }}>
                {execution.notifications.map((n) => (
                  <li key={n.id}>
                    <strong>[{n.channel}]</strong> {n.title} → <em>{n.recipient}</em> ({n.status})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="console-steps">
        {steps.map((step, i) => (
          <div key={step.nodeId || i} className={`log-step log-${step.status}`}>
            <button
              onClick={() => setOpen(open === step.nodeId ? undefined : step.nodeId)}
              aria-expanded={open === step.nodeId}
            >
              <span className="log-number">{String(i + 1).padStart(2, '0')}</span>
              {step.status === 'success' || step.status === 'COMPLETED' ? (
                <Check size={15} />
              ) : step.status === 'skipped' ? (
                <CircleMinus size={15} />
              ) : (
                <AlertCircle size={15} />
              )}
              <strong>{step.name}</strong>
              <span className="log-message">{step.message}</span>
              <small>{step.status === 'skipped' ? 'Ignorado' : `${step.durationMs} ms`}</small>
              {open === step.nodeId ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            {open === step.nodeId && (
              <div className="log-details">
                <div>
                  <strong>Entrada</strong>
                  <pre>{JSON.stringify(step.input, null, 2)}</pre>
                </div>
                <div>
                  <strong>Saída</strong>
                  <pre>{JSON.stringify(step.output, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
