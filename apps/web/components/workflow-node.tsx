
'use client';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Check, AlertCircle, LoaderCircle } from 'lucide-react';
import { catalog, type WorkflowNode } from '@eimax/workflow-schema';
import { blockIcons } from './icons';
export type FlowNode = Node<{ block: WorkflowNode; execution?: string; invalid?: boolean }, 'workflow'>;
export function WorkflowBlock({ data, selected }: NodeProps<FlowNode>) {
  const node = data.block;
  const meta = catalog[node.type];
  const Icon = blockIcons[node.type];
  const trigger = ['lead.created', 'webhook.received'].includes(node.type);
  const c = node.config;
  const summary =
    node.type === 'condition'
      ? `${({ budget: 'Orçamento', score: 'Pontuação', source: 'Origem', company: 'Empresa', email: 'E-mail' } as Record<string, string>)[String(c.field)] ?? 'Campo'} ${({ gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', contains: 'contém' } as Record<string, string>)[String(c.operator)] ?? ''} ${c.value ?? '…'}`
      : node.type === 'sdr.assign'
        ? String(c.team || 'Selecione uma equipe')
        : node.type === 'tag.add'
          ? String(c.tag || 'Defina uma etiqueta')
          : node.type === 'wait'
            ? `${c.minutes ?? '?'} minutos`
            : node.type === 'email.send'
              ? String(c.subject || 'Escreva um assunto')
              : node.type === 'manager.notify'
                ? 'Notificação para o gestor'
                : node.type === 'webhook.received'
                  ? 'Entrada autenticada · fase 2'
                  : 'Quando um lead chegar';
  return (
    <div
      className={`workflow-node ${selected ? 'is-selected' : ''} ${data.invalid ? 'is-invalid' : ''} execution-${data.execution ?? 'idle'}`}
      data-testid={`block-${node.id}`}
    >
      {!trigger && <Handle type="target" position={Position.Top} aria-label={`Entrada de ${node.name}`} />}
      <div className="node-type">
        <span className={`color-${meta.color}`}>
          {trigger
            ? 'GATILHO'
            : node.type === 'condition'
              ? 'CONDIÇÃO'
              : node.type === 'wait'
                ? 'CONTROLE'
                : 'AÇÃO'}
        </span>
        {data.execution === 'running' ? (
          <LoaderCircle size={12} className="spin" />
        ) : data.execution === 'success' ? (
          <Check size={13} className="success-text" />
        ) : data.invalid ? (
          <AlertCircle size={13} className="danger-text" />
        ) : null}
      </div>
      <div className="node-main">
        <span className={`block-icon color-${meta.color}`}>
          <Icon size={19} />
        </span>
        <strong>{node.name}</strong>
      </div>
      <div className="node-summary">{summary}</div>
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
