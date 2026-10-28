'use client';
import { Copy, Trash2, X, Lightbulb, ChevronDown, Settings2, ShieldCheck } from 'lucide-react';
import { catalog, configSchemas, type WorkflowNode, type Workflow } from '@eimax/workflow-schema';
import { VariableInput } from './variable-input';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { blockIcons } from './icons';
import { Button } from './ui';
type Props = {
  node?: WorkflowNode;
  workflow?: Workflow;
  onUpdate: (node: WorkflowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
  showClose?: boolean;
};
export function Inspector({
  node,
  workflow,
  onUpdate,
  onDelete,
  onDuplicate,
  onClose,
  readOnly = false,
  showClose = true,
}: Props) {
  const [accounts, setAccounts] = useState<
    Array<{
      id: string;
      name: string;
      provider: string;
      state: string;
      settings: { approvedTemplates?: { name: string; language: string }[] };
    }>
  >([]);
  const [members, setMembers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [emailAccounts, setEmailAccounts] = useState<
    Array<{ id: string; name: string; provider: string; state: string }>
  >([]);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (node?.type.startsWith('whatsapp.'))
      api<typeof accounts>('/integrations/whatsapp')
        .then(setAccounts)
        .catch((e) => setLoadError(e.message));
    if (node?.type === 'email.send')
      api<typeof emailAccounts>('/integrations')
        .then((rows) => setEmailAccounts(rows.filter((row) => row.provider === 'RESEND')))
        .catch((e) => setLoadError(e.message));
    if (node?.type === 'sdr.assign')
      api<typeof members>('/memberships')
        .then(setMembers)
        .catch((e) => setLoadError(e.message));
  }, [node?.type]);
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
        {showClose && (
          <button className="icon-btn" aria-label="Fechar propriedades" onClick={onClose}>
            <X size={16} />
          </button>
        )}
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
          {loadError && (
            <p className="field-helper" role="status">
              {loadError}
            </p>
          )}
          {node.type.startsWith('whatsapp.') &&
            !['whatsapp.sdr.notify', 'whatsapp.lead.update'].includes(node.type) && (
              <>
                <label className="field">
                  Conta WhatsApp
                  <select
                    value={String(c.connectionId ?? '')}
                    onChange={(e) => field('connectionId', e.target.value)}
                  >
                    <option value="">Selecione uma conta</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.state === 'CONNECTED' ? 'Conectada' : 'Desconectada'}
                      </option>
                    ))}
                  </select>
                </label>
                {!accounts.length && (
                  <p className="field-helper">Cadastre uma conta em Integrações → WhatsApp.</p>
                )}
                {!!c.connectionId && accounts.find((a) => a.id === c.connectionId)?.state !== 'CONNECTED' && (
                  <p className="validation-errors">Conecte a conta antes de publicar ou executar.</p>
                )}
              </>
            )}
          {node.type === 'whatsapp.conversation.started' && (
            <p className="field-helper">
              Os adaptadores atuais ainda não confirmam um evento nativo de nova conversa. A publicação deste
              gatilho fica bloqueada.
            </p>
          )}
          {node.type === 'whatsapp.text.send' && (
            <VariableInput
              key={`${node.id}-text`}
              node={node}
              workflow={workflow}
              label="Mensagem WhatsApp"
              value={String(c.text ?? '')}
              onChange={(v) => field('text', v)}
              maxLength={4096}
            />
          )}
          {node.type === 'whatsapp.template.send' && (
            <>
              <label className="field">
                Template aprovado
                <select
                  value={`${c.template ?? ''}:${c.language ?? 'pt_BR'}`}
                  onChange={(e) => {
                    const [template, language] = e.target.value.split(':');
                    onUpdate({ ...node, config: { ...c, template, language } });
                  }}
                >
                  <option value=":pt_BR">Selecione um template</option>
                  {(accounts.find((a) => a.id === c.connectionId)?.settings.approvedTemplates ?? []).map(
                    (t) => (
                      <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
                        {t.name} · {t.language}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <p className="field-helper">
                Templates sem parâmetros, confirmados como aprovados pela Meta ao atualizar a conta.
              </p>
            </>
          )}
          {node.type === 'whatsapp.sdr.notify' && (
            <VariableInput
              key={`${node.id}-sdr`}
              node={node}
              workflow={workflow}
              label="Aviso ao SDR"
              value={String(c.message ?? '')}
              onChange={(v) => field('message', v)}
              maxLength={1000}
            />
          )}
          {node.type === 'whatsapp.lead.update' && (
            <>
              <label className="field">
                Campo do lead
                <select value={String(c.field ?? 'name')} onChange={(e) => field('field', e.target.value)}>
                  <option value="name">Nome</option>
                  <option value="company">Empresa</option>
                  <option value="email">E-mail</option>
                </select>
              </label>
              <VariableInput
                key={`${node.id}-value`}
                node={node}
                workflow={workflow}
                label="Valor da conversa"
                value={String(c.value ?? '')}
                onChange={(value) => field('value', value)}
                maxLength={200}
              />
            </>
          )}
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
              <span className="field-helper">
                A execução real utiliza a versão publicada e os dados recebidos.
              </span>
            </label>
          )}
          {node.type === 'email.send' && (
            <>
              <label className="field">
                Conta de e-mail
                <select
                  value={String(c.connectionId ?? '')}
                  onChange={(e) => {
                    const config = { ...c };
                    if (e.target.value) config.connectionId = e.target.value;
                    else delete config.connectionId;
                    onUpdate({ ...node, config });
                  }}
                >
                  <option value="">Selecione uma conta</option>
                  {emailAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.state === 'CONNECTED' ? 'OK' : 'OFF'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Destinatário
                <select value="lead.email" onChange={(e) => field('to', e.target.value)}>
                  <option value="lead.email">E-mail do lead</option>
                </select>
              </label>
              <VariableInput
                key={`${node.id}-subject`}
                node={node}
                workflow={workflow}
                label="Assunto"
                value={String(c.subject ?? '')}
                onChange={(v) => field('subject', v)}
                maxLength={200}
              />
              <VariableInput
                key={`${node.id}-body`}
                node={node}
                workflow={workflow}
                label="Mensagem"
                value={String(c.body ?? '')}
                onChange={(v) => field('body', v)}
                maxLength={5000}
              />
            </>
          )}
          {node.type === 'sdr.assign' && (
            <label className="field">
              Equipe responsável
              <select value={String(c.team ?? '')} onChange={(e) => field('team', e.target.value)}>
                {!members.some((m) => `membership:${m.id}` === c.team) && (
                  <option value={String(c.team ?? '')}>Selecione um responsável</option>
                )}
                {members.map((member) => (
                  <option value={`membership:${member.id}`} key={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
              <span className="field-helper">
                A execução exige um responsável escolhido explicitamente nesta organização.
              </span>
            </label>
          )}
          {node.type === 'wait' && (
            <>
              <label className="field">
                Tipo de espera
                <select
                  value={String(c.mode ?? 'duration')}
                  onChange={(e) =>
                    onUpdate({
                      ...node,
                      config:
                        e.target.value === 'until'
                          ? { mode: 'until', at: '' }
                          : { mode: 'duration', amount: 5, unit: 'minutes' },
                    })
                  }
                >
                  <option value="duration">Por intervalo</option>
                  <option value="until">Até uma data e horário</option>
                </select>
              </label>
              {c.mode === 'until' ? (
                <label className="field">
                  Data e horário com fuso
                  <input
                    type="text"
                    placeholder="2026-12-01T09:00:00-03:00"
                    value={String(c.at ?? '')}
                    onChange={(e) => field('at', e.target.value)}
                  />
                  <span className="field-helper">
                    Use ISO 8601 com fuso explícito. Exemplo: -03:00 para Brasília.
                  </span>
                </label>
              ) : (
                <>
                  <label className="field">
                    Tempo de espera
                    <input
                      type="number"
                      min={1}
                      value={Number(c.amount ?? c.minutes ?? 5)}
                      onChange={(e) =>
                        onUpdate({
                          ...node,
                          config: {
                            mode: 'duration',
                            amount: Number(e.target.value),
                            unit: c.unit ?? 'minutes',
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Unidade
                    <select
                      value={String(c.unit ?? 'minutes')}
                      onChange={(e) =>
                        onUpdate({
                          ...node,
                          config: {
                            mode: 'duration',
                            amount: c.amount ?? c.minutes ?? 5,
                            unit: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="seconds">Segundos</option>
                      <option value="minutes">Minutos</option>
                      <option value="hours">Horas</option>
                      <option value="days">Dias</option>
                    </select>
                  </label>
                </>
              )}
              <p className="field-helper">
                Na execução real, o processo fica aguardando e continua automaticamente. Na simulação, a
                espera é instantânea.
              </p>
            </>
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
            <VariableInput
              key={`${node.id}-message`}
              node={node}
              workflow={workflow}
              label="Mensagem para o gestor"
              value={String(c.message ?? '')}
              onChange={(v) => field('message', v)}
              maxLength={1000}
            />
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
                <ShieldCheck size={16} />O servidor exige uma credencial configurada para esta organização. A
                referência não é um segredo.
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
