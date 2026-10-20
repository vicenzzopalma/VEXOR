
'use client';
import { Copy, Trash2, X, Lightbulb, ChevronDown, Settings2, ShieldCheck } from 'lucide-react';
import { catalog, configSchemas, type WorkflowNode } from '@eimax/workflow-schema';
import { blockIcons } from './icons';
import { Button } from './ui';
type Props = {
  node?: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
};
export function Inspector({ node, onUpdate, onDelete, onDuplicate, onClose, readOnly = false }: Props) {
  if (!node)
    return (
      <aside className="inspector">
        <div className="panel-heading">
          <h2>Propriedades</h2>
          <button className="icon-btn" aria-label="Fechar propriedades" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="inspector-empty">
          <Settings2 size={32} />
          <h3>Um detalhe faz a diferença</h3>
          <p>Selecione um bloco no canvas para personalizar seu processo.</p>
        </div>
      </aside>
    );
  const Icon = blockIcons[node.type];
  const meta = catalog[node.type];
  const c = node.config;
  const field = (key: string, value: unknown) => onUpdate({ ...node, config: { ...c, [key]: value } });
  const validation = configSchemas[node.type].safeParse(c);
  return (
    <aside className="inspector" aria-label="Propriedades do bloco">
      <div className="panel-heading">
        <h2>Propriedades do bloco</h2>
        <button className="icon-btn" aria-label="Fechar propriedades" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="inspector-scroll">
        <div className="inspector-block">
          <span className={`block-icon color-${meta.color}`}>
            <Icon size={23} />
          </span>
          <div>
            <strong>{meta.name}</strong>
            <p>{meta.category === 'Lógica' ? 'Dê inteligência ao seu fluxo' : meta.description}</p>
          </div>
        </div>
        <fieldset disabled={readOnly} className="inspector-fields">
          <label className="field">
            Nome do bloco
            <input
              value={node.name}
              maxLength={200}
              onChange={(e) => onUpdate({ ...node, name: e.target.value })}
            />
          </label>
          <label className="field">
            Descrição <span className="optional">opcional</span>
            <textarea
              placeholder="O que este bloco faz?"
              rows={2}
              maxLength={500}
              value={node.description}
              onChange={(e) => onUpdate({ ...node, description: e.target.value })}
            />
          </label>
          <div className="section-rule" />
          <h3 className="field-section">
            {node.type === 'condition' ? 'Configure sua condição' : 'Configuração'}
          </h3>
          {node.type === 'condition' && (
            <>
              <p className="field-helper">O lead seguirá um caminho de acordo com esta regra.</p>
              <div className="condition-config">
                <span className="tiny-label">SE O LEAD TIVER</span>
                <label className="field">
                  Campo
                  <select value={String(c.field)} onChange={(e) => field('field', e.target.value)}>
                    <option value="budget">Orçamento</option>
                    <option value="score">Pontuação</option>
                    <option value="source">Origem</option>
                    <option value="company">Empresa</option>
                    <option value="email">E-mail</option>
                  </select>
                </label>
                <label className="field">
                  Condição
                  <select value={String(c.operator)} onChange={(e) => field('operator', e.target.value)}>
                    <option value="gte">Maior ou igual a</option>
                    <option value="gt">Maior que</option>
                    <option value="lte">Menor ou igual a</option>
                    <option value="lt">Menor que</option>
                    <option value="eq">Igual a</option>
                    <option value="contains">Contém</option>
                  </select>
                </label>
                <label className="field">
                  Valor
                  <div className="input-affix">
                    {c.field === 'budget' && <span>R$</span>}
                    <input
                      aria-label="Valor da condição"
                      type={['budget', 'score'].includes(String(c.field)) ? 'number' : 'text'}
                      value={String(c.value ?? '')}
                      onChange={(e) => field('value', e.target.value)}
                    />
                  </div>
                </label>
              </div>
              <div className="path-explainer">
                <p>
                  <span className="status-dot green" />
                  <strong>Sim</strong>
                  <span>A condição foi atendida</span>
                </p>
                <p>
                  <span className="status-dot pink" />
                  <strong>Não</strong>
                  <span>A condição não foi atendida</span>
                </p>
              </div>
            </>
          )}
          {node.type === 'lead.created' && (
            <label className="field">
              Origem do lead
              <input value={String(c.source ?? '')} onChange={(e) => field('source', e.target.value)} />
              <span className="field-helper">Evento de exemplo na simulação. Recepção real na fase 2.</span>
            </label>
          )}
          {node.type === 'email.send' && (
            <>
              <label className="field">
                Destinatário
                <select value="lead.email" onChange={(e) => field('to', e.target.value)}>
                  <option value="lead.email">E-mail do lead</option>
                </select>
              </label>
              <label className="field">
                Assunto
                <input
                  value={String(c.subject ?? '')}
                  onChange={(e) => field('subject', e.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="field">
                Mensagem
                <textarea
                  rows={5}
                  value={String(c.body ?? '')}
                  onChange={(e) => field('body', e.target.value)}
                  maxLength={5000}
                />
              </label>
            </>
          )}
          {node.type === 'sdr.assign' && (
            <label className="field">
              Equipe responsável
              <input
                value={String(c.team ?? '')}
                onChange={(e) => field('team', e.target.value)}
                maxLength={200}
              />
              <span className="field-helper">Atribuição será simulada. A equipe não será notificada.</span>
            </label>
          )}
          {node.type === 'wait' && (
            <label className="field">
              Tempo de espera em minutos
              <input
                type="number"
                min={1}
                max={43200}
                value={Number(c.minutes ?? 0)}
                onChange={(e) => field('minutes', Number(e.target.value))}
              />
              <span className="field-helper">Até 30 dias. Na simulação, a espera é instantânea.</span>
            </label>
          )}
          {node.type === 'tag.add' && (
            <label className="field">
              Nome da etiqueta
              <input
                value={String(c.tag ?? '')}
                onChange={(e) => field('tag', e.target.value)}
                maxLength={60}
              />
            </label>
          )}
          {node.type === 'manager.notify' && (
            <label className="field">
              Mensagem para o gestor
              <textarea
                rows={4}
                value={String(c.message ?? '')}
                onChange={(e) => field('message', e.target.value)}
                maxLength={1000}
              />
            </label>
          )}
          {node.type === 'webhook.received' && (
            <>
              <label className="field">
                Referência da credencial
                <input
                  value={String(c.credentialRef ?? '')}
                  onChange={(e) => field('credentialRef', e.target.value)}
                  placeholder="webhook-comercial"
                  maxLength={80}
                />
                <span className="field-helper">Use um identificador. Nunca cole senhas ou tokens aqui.</span>
              </label>
              <div className="info-box">
                <ShieldCheck size={16} />
                Endpoint e autenticação de webhook indisponíveis até a fase 2.
              </div>
            </>
          )}
          {!validation.success && (
            <div className="validation-errors" role="alert">
              {validation.error.issues.map((i, n) => (
                <p key={n}>{i.message}</p>
              ))}
            </div>
          )}
          <div className="help-note">
            <Lightbulb size={17} />
            <div>
              <strong>Uma dica para seu processo</strong>
              <p>
                {node.type === 'condition'
                  ? 'Conecte as duas saídas para que nenhum lead fique sem um próximo passo.'
                  : 'Teste seu processo antes de publicar. Você pode ajustar tudo depois.'}
              </p>
            </div>
          </div>
        </fieldset>
        <div className="node-identifier">
          ID do bloco <code>{node.id.slice(0, 16)}</code>
          <ChevronDown size={11} />
        </div>
      </div>
      <div className="inspector-footer">
        <Button onClick={onDuplicate} disabled={readOnly}>
          <Copy size={15} />
          Duplicar
        </Button>
        <Button variant="ghost" className="danger-text" onClick={onDelete} disabled={readOnly}>
          <Trash2 size={15} />
          Excluir
        </Button>
      </div>
    </aside>
  );
}
