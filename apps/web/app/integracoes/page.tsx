'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Sheet, Plug, Plus } from 'lucide-react';
import { publicConnectorCatalog } from '@eimax/connectors/contracts';
import { api } from '@/lib/api';
import { Button, Dialog } from '@/components/ui';

type Connection = {
  id: string;
  name: string;
  provider: string;
  state: string;
  settings: Record<string, string>;
  updatedAt: string;
  configurationRequired: boolean;
  credentialsConfigured: boolean;
  lastError?: string;
};
const definitions = publicConnectorCatalog().filter((item) => item.channel !== 'WHATSAPP');
export default function IntegrationsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [role, setRole] = useState('viewer');
  const [editing, setEditing] = useState<Partial<Connection>>();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mapping, setMapping] = useState<Connection>();
  const [column, setColumn] = useState('Nome');
  const [field, setField] = useState('name');
  const [sample, setSample] = useState('');
  const [additionalFields, setAdditionalFields] = useState<
    Array<{ column: string; field: string; sample: string }>
  >([]);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheet, setSheet] = useState('Leads');
  const [preview, setPreview] = useState<Array<{ row: number; fields: Record<string, unknown> }>>([]);
  const load = () => api<Connection[]>('/integrations').then(setConnections);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ role: string }>('/me')
      .then((me) => setRole(me.role))
      .catch((e) => setError(e.message));
  }, []);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const definition = definitions.find((item) => item.provider === editing?.provider);
  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Canais comerciais</div>
          <h1>Integrações</h1>
          <p>Conecte as ferramentas da sua equipe e acompanhe a configuração de cada conta.</p>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="info-box" role="status">
          {notice}
        </p>
      )}
      <div className="integration-grid">
        <article className="integration-card">
          <MessageCircle size={26} />
          <h2>WhatsApp</h2>
          <p>Contas oficiais e gateways Evolution, sessões e eventos recebidos.</p>
          <Link className="btn btn-primary" href="/integracoes/whatsapp">
            Gerenciar contas
          </Link>
        </article>
        {definitions.map((item) => {
          const Icon = item.channel === 'EMAIL' ? Mail : item.channel === 'SHEETS' ? Sheet : Plug;
          return (
            <article className="integration-card" key={item.provider}>
              <Icon size={26} />
              <h2>{item.name}</h2>
              <p>
                {item.implementation === 'contract'
                  ? 'Contrato preparado. Autorização e operações ainda indisponíveis.'
                  : item.channel === 'SHEETS'
                    ? 'Prepare sua conta e confira o mapeamento antes da importação ou exportação.'
                    : 'Envios pela outbox e confirmação de entrega por webhook do provedor.'}
              </p>
              <span className="status-badge">
                {item.implementation === 'contract' ? 'Em preparação' : 'Configuração necessária'}
              </span>
              {role === 'owner' && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setCredentials({});
                    setEditing({ provider: item.provider, name: '', settings: {} });
                  }}
                >
                  <Plus size={15} />
                  Adicionar conta
                </Button>
              )}
            </article>
          );
        })}
      </div>
      <h2 className="integration-subheading">Contas da organização</h2>
      {!connections.length && <p className="muted">Nenhuma conta de e-mail, planilha ou CRM cadastrada.</p>}
      <div className="integration-grid">
        {connections.map((connection) => (
          <article className="integration-card" key={connection.id}>
            <span className="eyebrow">
              {definitions.find((item) => item.provider === connection.provider)?.name}
            </span>
            <h2>{connection.name}</h2>
            <p>
              {connection.configurationRequired
                ? 'Configuração necessária'
                : connection.state === 'CONNECTED'
                  ? 'Conexão verificada'
                  : connection.state === 'ERROR'
                    ? 'Erro de conexão'
                    : 'Desconectada'}
            </p>
            {connection.lastError && <p className="validation-errors">{connection.lastError}</p>}
            {role === 'owner' && (
              <div className="integration-actions">
                <Button
                  disabled={busy}
                  onClick={() => {
                    setCredentials({});
                    setEditing(connection);
                  }}
                >
                  Configurar
                </Button>
                <Button
                  disabled={busy || connection.configurationRequired}
                  onClick={() =>
                    perform(() => api(`/integrations/${connection.id}/enable`, { method: 'POST' }))
                  }
                >
                  Verificar conexão
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    perform(() => api(`/integrations/${connection.id}/disconnect`, { method: 'POST' }))
                  }
                >
                  Desconectar
                </Button>
              </div>
            )}
            {connection.provider === 'GOOGLE_SHEETS' && (
              <>
                {role === 'owner' && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const result = await api<{ message?: string }>(
                          `/integrations/${connection.id}/oauth/prepare`,
                          { method: 'POST' },
                        );
                        setNotice(
                          result.message ??
                            'Configuração necessária: configure o aplicativo Google no servidor.',
                        );
                      })
                    }
                  >
                    Preparar autorização Google
                  </Button>
                )}
                {role !== 'viewer' && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setMapping(connection);
                      setPreview([]);
                    }}
                  >
                    Conferir mapeamento
                  </Button>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      {editing && definition && (
        <Dialog title={`Configurar ${definition.name}`} onClose={() => setEditing(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await api(`/integrations${editing.id ? `/${editing.id}` : ''}`, {
                  method: editing.id ? 'PATCH' : 'POST',
                  body: JSON.stringify({
                    name: editing.name,
                    provider: editing.provider,
                    settings: editing.settings ?? {},
                    ...(editing.id ? { expectedUpdatedAt: editing.updatedAt } : {}),
                    ...(Object.keys(credentials).length ? { credentials } : {}),
                  }),
                });
                setCredentials({});
                setEditing(undefined);
              });
            }}
          >
            <label className="field">
              Nome da conta
              <input
                required
                maxLength={100}
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            {definition.fields.map((input) => (
              <label className="field" key={input.key}>
                {input.label}
                <input
                  type={input.type}
                  required={input.required}
                  value={editing.settings?.[input.key] ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, settings: { ...editing.settings, [input.key]: e.target.value } })
                  }
                />
              </label>
            ))}
            {definition.secretFields.map((input) => (
              <label className="field" key={input.key}>
                {input.label}
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    editing.credentialsConfigured
                      ? 'Credencial protegida; deixe vazio para manter'
                      : 'Configuração necessária'
                  }
                  value={credentials[input.key] ?? ''}
                  onChange={(e) =>
                    setCredentials((previous) => {
                      const next = { ...previous };
                      if (e.target.value) next[input.key] = e.target.value;
                      else delete next[input.key];
                      return next;
                    })
                  }
                />
              </label>
            ))}
            {definition.authentication === 'oauth2' && (
              <p className="info-box">
                A autorização OAuth depende do aplicativo do provedor. O cadastro pode ser salvo para preparar
                o mapeamento local.
              </p>
            )}
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              Salvar configuração
            </Button>
          </form>
        </Dialog>
      )}
      {mapping && (
        <Dialog title="Conferir mapeamento da planilha" onClose={() => setMapping(undefined)}>
          <p className="info-box">
            Prévia local. Os dados informados aqui não são importados nem enviados ao Google. A seleção de
            planilhas reais depende de autorização.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                const fields = [{ column, field, sample }, ...additionalFields];
                const result = await api<{ rows: typeof preview }>(
                  `/integrations/${mapping.id}/sheets/import-preview`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      mapping: {
                        spreadsheetId,
                        sheet,
                        fields: fields.map(({ column, field }) => ({ column, field })),
                      },
                      headers: fields.map((item) => item.column),
                      rows: [fields.map((item) => item.sample)],
                    }),
                  },
                );
                setPreview(result.rows);
              });
            }}
          >
            <label className="field">
              Identificador da planilha
              <input
                required
                pattern="[a-zA-Z0-9_-]+"
                maxLength={200}
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
              />
            </label>
            <label className="field">
              Aba
              <input required maxLength={100} value={sheet} onChange={(e) => setSheet(e.target.value)} />
            </label>
            <div className="integration-mapping">
              <label className="field">
                Coluna
                <input required maxLength={100} value={column} onChange={(e) => setColumn(e.target.value)} />
              </label>
              <label className="field">
                Campo do lead
                <select value={field} onChange={(e) => setField(e.target.value)}>
                  {[
                    ['name', 'Nome'],
                    ['email', 'E-mail'],
                    ['company', 'Empresa'],
                    ['phone', 'Telefone'],
                    ['source', 'Origem'],
                    ['budget', 'Orçamento'],
                    ['score', 'Pontuação'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Valor de exemplo
              <input maxLength={5000} value={sample} onChange={(e) => setSample(e.target.value)} />
            </label>
            {additionalFields.map((item, index) => (
              <fieldset className="inspector-fields" key={index}>
                <legend>Campo {index + 2}</legend>
                <label className="field">
                  Coluna {index + 2}
                  <input
                    required
                    maxLength={100}
                    value={item.column}
                    onChange={(e) =>
                      setAdditionalFields((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, column: e.target.value } : row)),
                      )
                    }
                  />
                </label>
                <label className="field">
                  Campo do lead {index + 2}
                  <select
                    value={item.field}
                    onChange={(e) =>
                      setAdditionalFields((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, field: e.target.value } : row)),
                      )
                    }
                  >
                    {[
                      ['name', 'Nome'],
                      ['email', 'E-mail'],
                      ['company', 'Empresa'],
                      ['phone', 'Telefone'],
                      ['source', 'Origem'],
                      ['budget', 'Orçamento'],
                      ['score', 'Pontuação'],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Exemplo {index + 2}
                  <input
                    maxLength={5000}
                    value={item.sample}
                    onChange={(e) =>
                      setAdditionalFields((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, sample: e.target.value } : row)),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  onClick={() => setAdditionalFields((rows) => rows.filter((_, i) => i !== index))}
                >
                  Remover campo {index + 2}
                </Button>
              </fieldset>
            ))}
            <div className="integration-actions">
              <Button
                type="button"
                disabled={additionalFields.length >= 6}
                onClick={() =>
                  setAdditionalFields((rows) => [...rows, { column: '', field: 'email', sample: '' }])
                }
              >
                Adicionar campo
              </Button>
              <Button type="submit" disabled={busy}>
                Ver prévia
              </Button>
            </div>
          </form>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {preview.map((row) => (
            <div className="info-box" key={row.row}>
              Linha {row.row}: {Object.values(row.fields).map(String).join(', ')}
            </div>
          ))}
        </Dialog>
      )}
    </main>
  );
}
