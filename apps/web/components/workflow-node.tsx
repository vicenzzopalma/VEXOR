'use client';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Check, AlertCircle, LoaderCircle, Zap } from 'lucide-react';
import { catalog, triggerTypes, type WorkflowNode } from '@eimax/workflow-schema';
import { blockIcons } from './icons';
export type FlowNode = Node<
  { block: WorkflowNode; execution?: string; invalid?: boolean; onOpen?: () => void },
  'workflow'
>;
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
                  : 'Quando um lead chegar';
  return (
    <div
      className={`vx-node flow-node ${trigger ? 'is-trigger' : ''} ${selected ? 'is-selected' : ''} ${data.invalid ? 'is-invalid' : ''} execution-${data.execution ?? 'idle'}`}
      data-testid={`block-${node.id}`}
    >
      {!trigger && <Handle type="target" position={Position.Top} aria-label={`Entrada de ${node.name}`} />}
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
      <span className="flow-node-state">
        {data.execution === 'running' ? (
          <LoaderCircle size={12} className="spin" />
        ) : data.execution === 'success' ? (
          <Check size={13} className="success-text" />
        ) : data.invalid ? (
          <AlertCircle size={13} className="danger-text" />
        ) : null}
      </span>
      <div className="vx-node-label">
        <strong>{node.name}</strong>
        <small>{summary}</small>
      </div>
      {node.type === 'condition' ? (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Bottom}
            style={{ left: '29%' }}
            aria-label="Saída Sim"
          />
          <Handle
            type="source"
            id="false"
            position={Position.Bottom}
            style={{ left: '76%' }}
            aria-label="Saída Não"
          />
          <span className="branch-port yes">Sim</span>
          <span className="branch-port no">Não</span>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} aria-label={`Saída de ${node.name}`} />
      )}
    </div>
  );
}
