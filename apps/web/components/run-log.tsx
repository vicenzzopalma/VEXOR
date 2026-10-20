
'use client';
import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleMinus,
  AlertCircle,
  ShieldCheck,
  X,
  Terminal,
  Clock3,
} from 'lucide-react';
import type { SimulationResult } from '@eimax/workflow-schema';
export function RunLog({ run, onClose }: { run: SimulationResult; onClose: () => void }) {
  const [open, setOpen] = useState<string>();
  return (
    <section className="run-console" aria-label="Resultado da simulação">
      <div className="console-heading">
        <div>
          <Terminal size={16} />
          <strong>Resultado da simulação</strong>
          <span className="success-pill">
            {run.steps.filter((s) => s.status === 'success').length} etapas concluídas
          </span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar resultado">
          <X size={17} />
        </button>
      </div>
      <div className="console-note">
        <ShieldCheck size={13} />
        Nenhuma ação externa foi enviada. Entradas pessoais protegidas.
        <span>
          <Clock3 size={12} />
          {new Date(run.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="console-steps">
        {run.steps.map((step, i) => (
          <div key={step.nodeId} className={`log-step log-${step.status}`}>
            <button
              onClick={() => setOpen(open === step.nodeId ? undefined : step.nodeId)}
              aria-expanded={open === step.nodeId}
            >
              <span className="log-number">{String(i + 1).padStart(2, '0')}</span>
              {step.status === 'success' ? (
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
                  <strong>Entrada segura</strong>
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
