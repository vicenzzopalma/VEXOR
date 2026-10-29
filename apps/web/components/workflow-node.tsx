'use client';
import { useEffect, useRef, useState } from 'react';
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  Minus,
  PanelRightOpen,
  StepForward,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { catalog, triggerTypes, type WorkflowNode } from '@eimax/workflow-schema';
import { blockIcons } from './icons';

/** Estado visual de um bloco no canvas, vindo da simulação desta sessão ou de uma execução real escolhida. */
export type NodeRunState = 'running' | 'success' | 'failed' | 'waiting' | 'skipped';
export type FlowNode = Node<
  {
    block: WorkflowNode;
    execution?: NodeRunState;
    invalid?: boolean;
    readOnly?: boolean;
    onOpen?: () => void;
    /** Testar até este bloco: simulação parcial com o lead de exemplo (sem efeitos externos). */
    onTestUntil?: () => void;
    testing?: boolean;
    onDuplicate?: () => void;
    onDelete?: () => void;
  },
  'workflow'
>;

const stateText: Record<NodeRunState | 'invalid', string> = {
  running: 'Executando',
  success: 'Concluído',
  failed: 'Falhou',
  waiting: 'Aguardando a espera terminar',
  skipped: 'Não percorrido nesta execução',
  invalid: 'Configuração incompleta',
};

/** Um único selo por bloco, por prioridade: executando, falha, inválido, espera, sucesso, não percorrido. */
function badgeFor(execution: NodeRunState | undefined, invalid: boolean) {
  if (execution === 'running') return 'running' as const;
  if (execution === 'failed') return 'failed' as const;
  if (invalid) return 'invalid' as const;
  return execution;
}

export function WorkflowBlock({ data, selected }: NodeProps<FlowNode>) {
  const node = data.block;
  const meta = catalog[node.type];
  const Icon = blockIcons[node.type];
  const trigger = triggerTypes.includes(node.type);
  const c = node.config;
  const summary = node.type.startsWith('whatsapp.')
    ? trigger
      ? 'Evento autenticado da conta'
      : 'Conta e consentimento obrigatórios'
    : node.type === 'condition'
      ? `${({ budget: 'Orçamento', score: 'Pontuação', source: 'Origem', company: 'Empresa', email: 'E-mail' } as Record<string, string>)[String(c.field)] ?? 'Campo'} ${({ gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', contains: 'contém' } as Record<string, string>)[String(c.operator)] ?? ''} ${c.value ?? '…'}`
      : node.type === 'sdr.assign'
        ? String(c.team).startsWith('membership:')
          ? 'Responsável selecionado'
          : 'Selecione um responsável'
        : node.type === 'tag.add'
          ? String(c.tag || 'Defina uma etiqueta')
          : node.type === 'wait'
            ? c.mode === 'until'
              ? `Até ${String(c.at || 'defina uma data')}`
              : `${c.amount ?? c.minutes ?? '?'} ${{ seconds: 'segundos', minutes: 'minutos', hours: 'horas', days: 'dias' }[String(c.unit ?? 'minutes')] ?? 'minutos'}`
            : node.type === 'email.send'
              ? String(c.subject || 'Escreva um assunto')
              : node.type === 'manager.notify'
                ? 'Notificação para o gestor'
                : node.type === 'webhook.received'
                  ? 'Entrada autenticada · fase 2'
                  : node.type === 'ti.onboarding.plan'
                    ? 'Plano de TI com aprovação humana'
                    : 'Quando um lead chegar';
  const badge = badgeFor(data.execution, !!data.invalid);
  // A barra fica num portal fora do zoom do canvas (tamanho fixo na tela); aparece ao passar o mouse,
  // focar ou selecionar, com uma pequena tolerância para o ponteiro chegar até ela.
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = () => {
    clearTimeout(timer.current);
    setActive(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), 400);
  };
  const keep = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
  const outputs =
    node.type === 'condition'
      ? [
          { id: 'true', label: 'Sim', top: '30%' },
          { id: 'false', label: 'Não', top: '70%' },
        ]
      : [];
  return (
    <div
      className={`vx-node flow-node ${trigger ? 'is-trigger' : ''} ${selected ? 'is-selected' : ''} ${data.invalid ? 'is-invalid' : ''} execution-${data.execution ?? 'idle'} ${data.execution ? `vx-state-${data.execution}` : ''}`}
      data-testid={`block-${node.id}`}
      data-state={data.execution ?? (data.invalid ? 'invalid' : 'idle')}
      {...keep}
    >
      <NodeToolbar
        isVisible={selected || active}
        position={Position.Top}
        offset={10}
        className="vx-node-toolbar nodrag nopan"
        role="toolbar"
        aria-label={`Ações de ${node.name}`}
        {...keep}
      >
        <button
          type="button"
          aria-label={`Detalhes de ${node.name}`}
          title="Abrir detalhes"
          onClick={(event) => {
            event.stopPropagation();
            data.onOpen?.();
          }}
        >
          <PanelRightOpen size={14} aria-hidden="true" />
        </button>
        {!data.readOnly && (
          <>
            <button
              type="button"
              aria-label={`Testar até ${node.name}`}
              title="Testar até este bloco (simulação, nada é enviado)"
              disabled={data.testing}
              onClick={(event) => {
                event.stopPropagation();
                data.onTestUntil?.();
              }}
            >
              {data.testing ? (
                <LoaderCircle size={14} className="spin" aria-hidden="true" />
              ) : (
                <StepForward size={14} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              aria-label={`Duplicar ${node.name}`}
              title="Duplicar"
              onClick={(event) => {
                event.stopPropagation();
                data.onDuplicate?.();
              }}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="danger"
              aria-label={`Excluir ${node.name}`}
              title="Excluir"
              onClick={(event) => {
                event.stopPropagation();
                data.onDelete?.();
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </NodeToolbar>
      {!trigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="vx-handle-in"
          aria-label={`Entrada de ${node.name}`}
        />
      )}
      {trigger && <Zap className="vx-trigger-bolt" size={15} aria-hidden="true" />}
      <button
        type="button"
        className="flow-node-open"
        aria-label={`Abrir detalhes de ${node.name}`}
        onClick={(event) => {
          event.stopPropagation();
          data.onOpen?.();
        }}
      >
        <Icon className={`color-${meta.color}`} size={40} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {badge && (
        <span
          className={`vx-node-badge vx-badge-${badge}`}
          role="img"
          aria-label={`Estado: ${stateText[badge]}`}
          title={stateText[badge]}
        >
          {badge === 'running' ? (
            <LoaderCircle size={11} strokeWidth={3} className="spin" />
          ) : badge === 'success' ? (
            <Check size={11} strokeWidth={3} />
          ) : badge === 'failed' ? (
            <X size={11} strokeWidth={3} />
          ) : badge === 'waiting' ? (
            <Clock3 size={11} strokeWidth={2.6} />
          ) : badge === 'invalid' ? (
            <AlertTriangle size={11} strokeWidth={2.6} />
          ) : (
            <Minus size={11} strokeWidth={3} />
          )}
        </span>
      )}
      <div className="vx-node-label">
        <strong>{node.name}</strong>
        <small>{summary}</small>
      </div>
      {outputs.length ? (
        outputs.map((output) => (
          <Handle
            key={output.id}
            type="source"
            id={output.id}
            position={Position.Right}
            className={`vx-handle-out branch-${output.id}`}
            style={{ top: output.top }}
            aria-label={`Saída ${output.label}`}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="vx-handle-out"
          aria-label={`Saída de ${node.name}`}
        />
      )}
      {outputs.map((output) => (
        <span key={`${output.id}-label`} className="vx-out-label" style={{ top: output.top }}>
          {output.label}
        </span>
      ))}
    </div>
  );
}
