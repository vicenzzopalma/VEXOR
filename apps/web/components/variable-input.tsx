'use client';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  leadVariables,
  sampleLead,
  stepVariables,
  templateParts,
  type Workflow,
  type WorkflowNode,
} from '@eimax/workflow-schema';
import { resolveTemplate } from '@eimax/workflow-engine';

/** Tipos de arraste usados pelo detalhe do bloco ao levar um campo da Entrada até um parâmetro. */
export const VARIABLE_DRAG_TYPE = 'application/x-eimax-variable';
export const BLOCKED_DRAG_TYPE = 'application/x-eimax-blocked-field';

export function VariableInput({
  label,
  value,
  onChange,
  maxLength,
  workflow,
  node,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  workflow?: Workflow;
  node: WorkflowNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dropHint, setDropHint] = useState('');
  const focus = useRef({ part: -1, offset: 0 });
  const parts = templateParts(value);
  if (!parts.length || parts.at(-1)?.kind === 'variable') parts.push({ kind: 'text', value: '' });
  const serialize = (updated: typeof parts) =>
    updated.map((p) => (p.kind === 'text' ? p.value : `{{${p.value}}}`)).join('');
  const ancestors = new Set<string>();
  const visit = (nodeId: string) => {
    for (const edge of workflow?.edges.filter((e) => e.target === nodeId) ?? []) {
      if (!ancestors.has(edge.source)) {
        ancestors.add(edge.source);
        visit(edge.source);
      }
    }
  };
  visit(node.id);
  const choices = [
    ...Object.entries(leadVariables).map(([key, name]) => ({ path: `lead.${key}`, name })),
    ...(workflow?.nodes.filter((n) => ancestors.has(n.id) && n.id !== node.id) ?? []).flatMap((n) =>
      Object.entries(stepVariables[n.type] ?? {}).map(([key, name]) => ({
        path: `steps.${n.id}.${key}`,
        name: `${n.name} · ${name}`,
      })),
    ),
  ];
  const update = (updated: typeof parts) => {
    const next = serialize(updated);
    if (next.length > maxLength) return false;
    onChange(next);
    return true;
  };
  const insert = (path: string) => {
    const { part, offset } = focus.current;
    if (parts[part]?.kind === 'text') {
      const text = parts[part].value;
      parts.splice(
        part,
        1,
        { kind: 'text', value: text.slice(0, offset) },
        { kind: 'variable', value: path },
        { kind: 'text', value: text.slice(offset) },
      );
    } else parts.push({ kind: 'variable', value: path });
    const applied = update(parts);
    setOpen(false);
    focus.current.part = -1;
    return applied;
  };
  const dropHere = 'Solte para inserir a variável aqui.';
  const dragOver = (event: DragEvent<HTMLInputElement>) => {
    const types = [...event.dataTransfer.types];
    if (types.includes(VARIABLE_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropHint(dropHere);
    } else if (types.includes(BLOCKED_DRAG_TYPE)) {
      // Sem preventDefault o navegador recusa a soltura; o texto explica o motivo.
      event.dataTransfer.dropEffect = 'none';
      setDropHint(
        'Este campo não pode ser usado aqui: só campos da lista de variáveis do editor são aceitos.',
      );
    }
  };
  const drop = (event: DragEvent<HTMLInputElement>, index: number) => {
    const path = event.dataTransfer.getData(VARIABLE_DRAG_TYPE);
    if (!path && !event.dataTransfer.types.includes(BLOCKED_DRAG_TYPE)) return;
    event.preventDefault();
    if (!path || !choices.some((c) => c.path === path)) {
      setDropHint('Este campo não está disponível para este bloco: ele precisa vir de um bloco anterior.');
      return;
    }
    const input = event.currentTarget;
    focus.current = {
      part: index,
      offset: document.activeElement === input ? (input.selectionStart ?? 0) : input.value.length,
    };
    setDropHint(
      insert(path)
        ? ''
        : `A variável não foi inserida: o texto passaria do limite de ${maxLength} caracteres.`,
    );
  };
  const preview = resolveTemplate(value, sampleLead);
  return (
    <div className="field variable-field">
      <span id={id}>{label}</span>
      <div className="variable-editor" role="group" aria-labelledby={id}>
        {parts.map((part, index) =>
          part.kind === 'variable' ? (
            <span className="variable-pill" key={index}>
              <select
                aria-label={`Editar variável ${index + 1}`}
                value={part.value}
                onChange={(e) => {
                  parts[index].value = e.target.value;
                  update(parts);
                }}
              >
                {!choices.some((c) => c.path === part.value) && (
                  <option value={part.value}>Variável indisponível</option>
                )}
                {choices.map((c) => (
                  <option key={c.path} value={c.path}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remover variável ${index + 1}`}
                onClick={() => update(parts.filter((_, i) => i !== index))}
              >
                <X size={12} />
              </button>
            </span>
          ) : (
            <input
              key={index}
              aria-label={`${label} · texto ${index + 1}`}
              value={part.value}
              maxLength={maxLength}
              style={{ width: `${Math.max(10, Math.min(32, part.value.length + 2))}ch` }}
              onSelect={(e) => {
                focus.current = { part: index, offset: e.currentTarget.selectionStart ?? 0 };
              }}
              onDragOver={dragOver}
              // A dica de soltura recusada continua visível; a de "solte aqui" some ao sair do campo.
              onDragLeave={() => setDropHint((hint) => (hint === dropHere ? '' : hint))}
              onDrop={(e) => drop(e, index)}
              onChange={(e) => {
                parts[index].value = e.target.value;
                update(parts);
                setDropHint('');
              }}
            />
          ),
        )}
      </div>
      <button className="variable-insert" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Plus size={13} />
        Inserir variável
      </button>
      {open && (
        <div className="variable-choices" aria-label={`Variáveis de ${label}`}>
          {choices.map((c) => (
            <button type="button" key={c.path} onClick={() => insert(c.path)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {dropHint && (
        <span className="field-helper variable-drop-hint" role="status">
          {dropHint}
        </span>
      )}
      <span className="field-helper">
        Prévia com dados de exemplo: {preview.text || '—'}
        {preview.issues.length > 0 ? ' · Campo sem valor nesta prévia.' : ''}
      </span>
    </div>
  );
}
