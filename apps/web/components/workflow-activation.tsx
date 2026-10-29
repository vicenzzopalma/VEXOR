'use client';
import { useId } from 'react';
import { AlertTriangle, LoaderCircle, RotateCw, SquareMousePointer, X } from 'lucide-react';
import type { ActivationError } from '@/lib/api';

/**
 * Interruptor "Ativo" de um fluxo comum. Ligado: a versão publicada mais recente recebe eventos.
 * Desligado: nenhum gatilho (API, webhook, WhatsApp) cria execução.
 */
export function ActivationSwitch({
  on,
  busy,
  disabledReason,
  onToggle,
  compact = false,
  label = 'Ativo',
}: {
  on: boolean;
  busy?: boolean;
  /** Quando preenchido, o interruptor fica desabilitado e o motivo aparece na dica. */
  disabledReason?: string;
  onToggle: () => void;
  compact?: boolean;
  label?: string;
}) {
  const reasonId = useId();
  const blocked = busy || !!disabledReason;
  const title =
    disabledReason ??
    (on
      ? 'Ativo: a versão publicada recebe eventos. Clique para desativar.'
      : 'Inativo: nenhum gatilho cria execuções. Clique para ativar com a versão publicada atual.');
  // aria-disabled (e não disabled) mantém o interruptor no Tab, para o leitor de tela ouvir o motivo.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      aria-disabled={blocked || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      className={`vx-activation${on ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}
      title={title}
      onClick={() => {
        if (!blocked) onToggle();
      }}
    >
      <span className="vx-activation-track" aria-hidden="true">
        <span className="vx-activation-thumb">{busy && <LoaderCircle size={9} className="spin" />}</span>
      </span>
      <span className="vx-activation-text" aria-hidden="true">
        {on ? 'Ativo' : 'Inativo'}
      </span>
      {disabledReason && (
        <span id={reasonId} className="vx-sr-only">
          {disabledReason}
        </span>
      )}
    </button>
  );
}

/** Erro de ativação salvo no fluxo, com a ação sugerida e atalhos para resolver. */
export function ActivationErrorBanner({
  error,
  nodeName,
  busy,
  canRetry,
  onRetry,
  onShowNode,
  onDismiss,
}: {
  error: ActivationError;
  nodeName?: string;
  busy?: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onShowNode?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="vx-activation-error" role="alert" data-testid="activation-error" data-code={error.code}>
      <AlertTriangle size={17} aria-hidden="true" />
      <div>
        <strong>Não foi possível ativar este fluxo</strong>
        <p>{error.message}</p>
        <p>
          <span className="vx-activation-hint">O que fazer:</span> {error.action}
        </p>
        <small>
          Registrado em {new Date(error.at).toLocaleString('pt-BR')} · o fluxo continua inativo e não recebe
          eventos.
        </small>
      </div>
      <div className="vx-activation-error-actions">
        {onShowNode && (
          <button type="button" className="btn" onClick={onShowNode}>
            <SquareMousePointer size={14} aria-hidden="true" />
            {nodeName ? `Ver “${nodeName}”` : 'Ver bloco'}
          </button>
        )}
        {canRetry && (
          <button type="button" className="btn" onClick={onRetry} disabled={busy}>
            {busy ? (
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
            ) : (
              <RotateCw size={14} aria-hidden="true" />
            )}
            Tentar ativar de novo
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Ocultar aviso de ativação" onClick={onDismiss}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
