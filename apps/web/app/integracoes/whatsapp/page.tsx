'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageCircle, Plus, RefreshCw, Unplug, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Dialog } from '@/components/ui';

type Connection = {
  id: string;
  name: string;
  provider: 'META' | 'EVOLUTION';
  state: string;
  settings: {
    origin?: string;
    instance?: string;
    phoneNumberId?: string;
    apiVersion?: string;
    wabaId?: string;
    approvedTemplates?: { name: string; language: string }[];
  };
  configurationRequired: boolean;
  credentialsConfigured: boolean;
  lastError?: string;
  checkedAt?: string;
  updatedAt: string;
  webhookPath: string;
  qr?: string;
  expiresAt?: string;
};
const labels: Record<string, string> = {
  DISCONNECTED: 'Desconectada',
  CONNECTING: 'Conectando',
  WAITING_FOR_QR: 'Aguardando QR Code',
  CONNECTED: 'Conectada',
  RECONNECTING: 'Reconectando',
  ERROR: 'Erro de conexão',
};
export default function WhatsAppPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [editing, setEditing] = useState<Partial<Connection>>();
  const [qr, setQr] = useState<Connection>();
  const [now, setNow] = useState(Date.now());
  const [events, setEvents] =
    useState<Array<{ id: string; kind: string; status: string; errorCode?: string; createdAt: string }>>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('viewer');
  const [secret, setSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const load = () => api<Connection[]>('/integrations/whatsapp').then(setConnections);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ role: string }>('/me')
      .then((me) => setRole(me.role))
      .catch((e) => setError(e.message));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(() => {
      api<Connection>(`/integrations/whatsapp/${qr.id}/refresh`, { method: 'POST' })
        .then((result) => {
          setConnections((rows) => rows.map((row) => (row.id === result.id ? result : row)));
          if (result.state === 'CONNECTED') setQr(undefined);
        })
        .catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [qr]);
  const edit = (connection: Partial<Connection>) => {
    setSecret('');
    setWebhookSecret('');
    setAppSecret('');
    setVerifyToken('');
    setEditing(connection);
  };
  async function operate(connection: Connection, action: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<Connection>(`/integrations/whatsapp/${connection.id}/${action}`, {
        method: 'POST',
      });
      if (result.qr) setQr(result);
      else if (action === 'disconnect') setQr(undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const credentials = secret
        ? editing.provider === 'META'
          ? {
              accessToken: secret,
              ...(appSecret ? { appSecret } : {}),
              ...(verifyToken ? { verifyToken } : {}),
            }
          : { apiKey: secret, ...(webhookSecret ? { webhookSecret } : {}) }
        : undefined;
      const { approvedTemplates: _approved, ...writableSettings } = editing.settings ?? {};
      await api(`/integrations/whatsapp${editing.id ? `/${editing.id}` : ''}`, {
        method: editing.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: editing.name,
          provider: editing.provider,
          settings: writableSettings,
          ...(editing.id ? { expectedUpdatedAt: editing.updatedAt } : {}),
          ...(credentials ? { credentials } : {}),
        }),
      });
      setSecret('');
      setWebhookSecret('');
      setAppSecret('');
      setVerifyToken('');
      setEditing(undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const expired = !!qr?.expiresAt && now >= new Date(qr.expiresAt).getTime();
  const settings = editing?.settings ?? {};
  const setting = (key: string, value: string) =>
    setEditing((current) => ({ ...current, settings: { ...current?.settings, [key]: value } }));
  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Integrações</div>
          <h1>WhatsApp</h1>
          <Link href="/integracoes">Ver todas as integrações</Link>
          <p>Gerencie os números da sua organização e acompanhe a conexão com o provedor.</p>
        </div>
        {role === 'owner' && (
          <Button onClick={() => edit({ provider: 'META', name: '', settings: {} })}>
            <Plus size={15} />
            Adicionar conta
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="validation-errors">
          {error}
        </div>
      )}
      {!connections.length && (
        <div className="empty-state">
          <MessageCircle size={32} />
          <h3>Conecte seu atendimento</h3>
          <p>Configuração necessária. Cadastre uma conta Meta ou uma instância existente da Evolution API.</p>
        </div>
      )}
      <div className="runs-list">
        {connections.map((connection) => (
          <article className="run-card" key={connection.id}>
            <span className="table-icon">
              <MessageCircle size={20} />
            </span>
            <div>
              <h3>{connection.name}</h3>
              <p>
                {connection.provider === 'META' ? 'WhatsApp Business Platform' : 'Evolution API · QR Code'} ·{' '}
                {connection.configurationRequired ? 'Configuração necessária' : labels[connection.state]}
              </p>
              {connection.lastError && <p role="status">Falha: {connection.lastError}</p>}
              {connection.checkedAt && (
                <p>Verificada em {new Date(connection.checkedAt).toLocaleString('pt-BR')}</p>
              )}
            </div>
            <Button
              disabled={busy || connection.configurationRequired}
              onClick={() => operate(connection, 'refresh')}
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                api<NonNullable<typeof events>>(`/integrations/whatsapp/${connection.id}/events`)
                  .then(setEvents)
                  .catch((e) => setError(e.message))
              }
            >
              Eventos
            </Button>
            {role === 'owner' && (
              <>
                <Button
                  disabled={busy || connection.configurationRequired}
                  onClick={() => operate(connection, 'connect')}
                >
                  {connection.state === 'CONNECTED' ? 'Verificar conta' : 'Conectar'}
                </Button>
                {connection.provider === 'EVOLUTION' && (
                  <>
                    <Button
                      disabled={busy || connection.configurationRequired}
                      onClick={() => operate(connection, 'create-instance')}
                    >
                      Criar instância
                    </Button>
                    <Button
                      disabled={busy || connection.configurationRequired}
                      onClick={() => operate(connection, 'reconnect')}
                    >
                      Reconectar
                    </Button>
                  </>
                )}
                <Button disabled={busy} onClick={() => edit(connection)}>
                  <Pencil size={14} />
                  Configurar
                </Button>
                <Button disabled={busy} onClick={() => operate(connection, 'disconnect')}>
                  <Unplug size={14} />
                  Desconectar
                </Button>
              </>
            )}
          </article>
        ))}
      </div>
      {events && (
        <Dialog title="Eventos recebidos" onClose={() => setEvents(undefined)}>
          {!events.length && <p>Nenhum evento recebido.</p>}
          {events.map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString('pt-BR')} ? {event.kind} ? {event.status}
              {event.errorCode ? ` (${event.errorCode})` : ''}
            </p>
          ))}
        </Dialog>
      )}
      {editing && (
        <Dialog
          title={editing.id ? 'Configurar conta' : 'Adicionar conta WhatsApp'}
          onClose={() => setEditing(undefined)}
        >
          <div className="inspector-fields">
            <label className="field">
              Nome da conta
              <input
                value={editing.name ?? ''}
                maxLength={100}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label className="field">
              Provedor
              <select
                disabled={!!editing.id}
                value={editing.provider}
                onChange={(e) =>
                  setEditing({
                    name: editing.name,
                    provider: e.target.value as Connection['provider'],
                    settings: {},
                  })
                }
              >
                <option value="META">WhatsApp Business Platform oficial</option>
                <option value="EVOLUTION">Evolution API · QR Code</option>
              </select>
            </label>
            {editing.provider === 'META' ? (
              <>
                <label className="field">
                  Identificador do número
                  <input
                    value={settings.phoneNumberId ?? ''}
                    onChange={(e) => setting('phoneNumberId', e.target.value)}
                  />
                </label>
                <label className="field">
                  Identificador WABA (para templates)
                  <input value={settings.wabaId ?? ''} onChange={(e) => setting('wabaId', e.target.value)} />
                </label>
                <label className="field">
                  Versão da API Graph
                  <input
                    placeholder="Versão habilitada no seu aplicativo Meta"
                    value={settings.apiVersion ?? ''}
                    onChange={(e) => setting('apiVersion', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  Endereço HTTPS do gateway
                  <input value={settings.origin ?? ''} onChange={(e) => setting('origin', e.target.value)} />
                </label>
                <label className="field">
                  Nome da instância existente
                  <input
                    value={settings.instance ?? ''}
                    onChange={(e) => setting('instance', e.target.value)}
                  />
                </label>
              </>
            )}
            <details>
              <summary>Credenciais e webhooks</summary>
              <p className="field-helper">
                As credenciais são criptografadas no servidor. Preencha para substituir o conjunto atual.
              </p>
              <label className="field">
                {editing.provider === 'META' ? 'Token de acesso' : 'Chave da API'}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
              {editing.provider === 'META' ? (
                <>
                  <label className="field">
                    App Secret
                    <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
                  </label>
                  <label className="field">
                    Token de verificação do webhook
                    <input
                      type="password"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  Segredo do webhook (mínimo 24 caracteres)
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                </label>
              )}
              {editing.webhookPath && (
                <p className="field-helper">Caminho do webhook: {editing.webhookPath}</p>
              )}
            </details>
            {error && (
              <div role="alert" className="validation-errors">
                {error}
              </div>
            )}
            <Button disabled={busy || !editing.name?.trim()} onClick={save}>
              Salvar conta
            </Button>
          </div>
        </Dialog>
      )}
      {qr && (
        <Dialog title={`Conectar ${qr.name}`} onClose={() => setQr(undefined)}>
          {expired ? (
            <p role="status">QR Code expirado para exibição. Solicite outro ao gateway.</p>
          ) : (
            <img className="whatsapp-qr" src={qr.qr} alt="QR Code da sessão real do gateway WhatsApp" />
          )}
          <p className="field-helper">
            A conexão será confirmada pelo provedor após o pareamento. O código é ocultado após 30 segundos
            por segurança.
          </p>
          <Button disabled={busy} onClick={() => operate(qr, 'connect')}>
            Obter novo QR Code
          </Button>
        </Dialog>
      )}
    </main>
  );
}
