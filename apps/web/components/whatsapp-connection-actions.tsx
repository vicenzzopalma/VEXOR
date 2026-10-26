'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Archive, KeyRound, MessageCircle, Pencil, Plus, QrCode, RefreshCw, Unplug } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Dialog } from '@/components/ui';

export type Connection = {
  id: string;
  name: string;
  provider: 'META' | 'EVOLUTION' | 'Z_API' | 'MOCK';
  managed?: boolean;
  state: string;
  settings: {
    origin?: string;
    instance?: string;
    phoneNumberId?: string;
    apiVersion?: string;
    wabaId?: string;
    mockName?: string;
    approvedTemplates?: { name: string; language: string }[];
  };
  configurationRequired: boolean;
  credentialsConfigured: boolean;
  quarantined?: boolean;
  quarantinedAt?: string | null;
  quarantineReason?: string | null;
  lastError?: string;
  checkedAt?: string;
  updatedAt: string;
  webhookPath: string;
  qr?: string;
  expiresAt?: string;
};

type Provider = Connection['provider'];
type Events = Array<{ id: string; kind: string; status: string; errorCode?: string; createdAt: string }>;

const stateLabels: Record<string, string> = {
  DISCONNECTED: 'Desconectada',
  CONNECTING: 'Conectando',
  WAITING_FOR_QR: 'Aguardando leitura do QR Code',
  CONNECTED: 'Conectada',
  RECONNECTING: 'Reconectando',
  ERROR: 'Erro de conexão',
};

const providerLabels: Record<Provider, string> = {
  EVOLUTION: 'Celular via QR Code',
  META: 'WhatsApp Business Platform (Meta)',
  Z_API: 'Z-API',
  MOCK: 'Sandbox local',
};

// Each account is quarantined on its own; one restricted number never blocks the others.
export function quarantineLabel(reason?: string | null) {
  if (!reason) return 'Em quarentena';
  if (reason === 'GLOBAL_KILL_SWITCH') return 'QR Code desligado pelo administrador';
  if (reason === 'USER_REPORTED_ACCOUNT_BAN_AFTER_PAIRING')
    return 'Em quarentena: conta em análise após o pareamento';
  const code = /^PROVIDER_STATUS_(\d+)$/.exec(reason)?.[1];
  if (code === '401') return 'Em quarentena: o WhatsApp desconectou esta sessão (401)';
  if (code) return `Em quarentena: o WhatsApp restringiu esta sessão (${code})`;
  return 'Em quarentena';
}

const providerOptions: Array<{ value: Provider; label: string }> = [
  { value: 'EVOLUTION', label: 'Celular via QR Code (serviço gerenciado)' },
  { value: 'META', label: 'WhatsApp Business Platform oficial (Meta)' },
  { value: 'Z_API', label: 'Z-API' },
  { value: 'MOCK', label: 'Sandbox local (sem envio real)' },
];

export type WhatsAppClientPageProps = { initialQuarantined?: boolean };

export function WhatsAppClientPage({ initialQuarantined = false }: WhatsAppClientPageProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [editing, setEditing] = useState<Partial<Connection>>();
  const [qr, setQr] = useState<Connection>();
  const [pairing, setPairing] = useState<Connection>();
  const [releasing, setReleasing] = useState<Connection>();
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt?: string }>();
  const [events, setEvents] = useState<Events>();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('viewer');
  const [secret, setSecret] = useState('');
  const [secondSecret, setSecondSecret] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const owner = role === 'owner';

  const load = () => api<Connection[]>('/integrations/whatsapp').then(setConnections);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ role: string }>('/me')
      .then((me) => setRole(me.role))
      .catch((e) => setError(e.message));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll only while a real QR from the server is on screen.
  useEffect(() => {
    if (!qr?.qr) return;
    const timer = setInterval(() => {
      api<Connection>(`/integrations/whatsapp/${qr.id}/refresh`, { method: 'POST' })
        .then((result) => {
          setConnections((rows) => rows.map((row) => (row.id === result.id ? result : row)));
          if (result.state === 'CONNECTED') setQr(undefined);
        })
        .catch((e) => setError((e as Error).message));
    }, 5000);
    return () => clearInterval(timer);
  }, [qr]);

  function edit(connection: Partial<Connection>) {
    setSecret('');
    setSecondSecret('');
    setAppSecret('');
    setVerifyToken('');
    setError('');
    setEditing(connection);
  }

  async function operate(connection: Connection, action: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Connection>(`/integrations/whatsapp/${connection.id}/${action}`, {
        method: 'POST',
        ...(action === 'archive'
          ? { body: JSON.stringify({ expectedUpdatedAt: connection.updatedAt }) }
          : {}),
      });
      if (action === 'archive') {
        setConnections((rows) => rows.filter((row) => row.id !== connection.id));
        setNotice('Conta removida da lista. O histórico foi preservado.');
      } else if (result.qr) setQr(result);
      else {
        setQr(undefined);
        if (action === 'disconnect') setNotice('Conta desconectada. Para ocultá-la, use Remover da lista.');
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function openQr(connection: Connection) {
    // Without an available service the dialog explains why; it never shows an illustrative QR.
    if (connection.configurationRequired) return setQr({ ...connection, qr: undefined });
    if (connection.qr && connection.expiresAt && Date.parse(connection.expiresAt) > Date.now())
      return setQr(connection);
    void operate(connection, 'connect');
  }

  function openPairing(connection: Connection) {
    setPairing(connection);
    setPairingPhone('');
    setPairingCode(undefined);
    setError('');
  }

  async function requestPairingCode() {
    if (!pairing) return;
    const digits = pairingPhone.replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      setError('Informe o número com código do país e DDD, por exemplo 55 11 91234-5678.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Only the provider can issue a code that the phone will accept.
      setPairingCode(
        await api<{ code: string; expiresAt?: string }>(`/integrations/whatsapp/${pairing.id}/pairing-code`, {
          method: 'POST',
          body: JSON.stringify({ phoneNumber: digits }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing?.provider) return;
    setBusy(true);
    setError('');
    const path = `/integrations/whatsapp${editing.id ? `/${editing.id}` : ''}`;
    const method = editing.id ? 'PATCH' : 'POST';
    const revision = editing.id ? { expectedUpdatedAt: editing.updatedAt } : {};
    const name = (editing.name ?? '').trim();
    try {
      if (editing.provider === 'EVOLUTION' && (editing.managed || !editing.id)) {
        await api(`/integrations/whatsapp/${editing.id ? `${editing.id}/managed` : 'managed'}`, {
          method,
          body: JSON.stringify({ name, ...revision }),
        });
      } else if (editing.provider === 'MOCK') {
        await api(path, {
          method,
          body: JSON.stringify({
            name,
            provider: 'MOCK',
            settings: { mockName: name.slice(0, 100) },
            ...revision,
          }),
        });
      } else if (editing.provider === 'Z_API') {
        // Both secrets are replaced together; neither is stored in plain settings.
        if ((!editing.id || secret || secondSecret) && (!secret || !secondSecret)) {
          setError('Informe o token da instância e o Client-Token da Z-API.');
          return;
        }
        await api(path, {
          method,
          body: JSON.stringify({
            name,
            provider: 'Z_API',
            settings: { instance: editing.settings?.instance ?? '' },
            ...revision,
            ...(secret ? { credentials: { token: secret, clientToken: secondSecret } } : {}),
          }),
        });
      } else {
        const credentials =
          editing.provider === 'META'
            ? secret && {
                accessToken: secret,
                ...(appSecret ? { appSecret } : {}),
                ...(verifyToken ? { verifyToken } : {}),
              }
            : secret && { apiKey: secret, ...(secondSecret ? { webhookSecret: secondSecret } : {}) };
        const { approvedTemplates: _approved, ...settings } = editing.settings ?? {};
        await api(path, {
          method,
          body: JSON.stringify({
            name,
            provider: editing.provider,
            settings,
            ...revision,
            ...(credentials ? { credentials } : {}),
          }),
        });
      }
      setEditing(undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const settings = editing?.settings ?? {};
  const setting = (key: string, value: string) =>
    setEditing((current) => ({ ...current, settings: { ...current?.settings, [key]: value } }));
  const qrExpired = !!qr?.expiresAt && now >= Date.parse(qr.expiresAt);
  const pairingSeconds = pairingCode?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(pairingCode.expiresAt) - now) / 1000))
    : undefined;
  const managedEdit = editing?.provider === 'EVOLUTION' && (editing.managed || !editing.id);

  return (
    <main className="listing-page">
      <div className="listing-heading">
        <div>
          <div className="eyebrow">Integrações</div>
          <h1>WhatsApp</h1>
          <Link href="/integracoes">Ver todas as integrações</Link>
          <p>Gerencie os números da organização e acompanhe a conexão com cada provedor.</p>
        </div>
        {owner && (
          <Button onClick={() => edit({ provider: 'EVOLUTION', name: '', settings: {} })}>
            <Plus size={15} />
            Adicionar conta
          </Button>
        )}
      </div>

      {initialQuarantined && (
        <div role="status" className="connection-notice">
          Conexões por QR Code estão desligadas pelo administrador da instalação. Contas Meta, Z-API e Sandbox
          continuam disponíveis.
        </div>
      )}
      {notice && (
        <div role="status" className="connection-notice">
          {notice}
        </div>
      )}
      {error && !editing && !pairing && !releasing && (
        <div role="alert" className="validation-errors">
          {error}
        </div>
      )}

      {!connections.length && (
        <div className="empty-state">
          <MessageCircle size={32} />
          <h3>Nenhuma conta conectada</h3>
          <p>
            Adicione um celular, uma conta oficial da Meta, uma instância Z-API ou um Sandbox para testes.
          </p>
        </div>
      )}

      <div className="runs-list">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            owner={owner}
            busy={busy}
            onQr={() => openQr(connection)}
            onPairing={() => openPairing(connection)}
            onRelease={() => {
              setError('');
              setReleasing(connection);
            }}
            onEdit={() => edit(connection)}
            onOperate={(action) => void operate(connection, action)}
            onEvents={() =>
              api<Events>(`/integrations/whatsapp/${connection.id}/events`)
                .then(setEvents)
                .catch((e) => setError(e.message))
            }
          />
        ))}
      </div>

      {events && (
        <Dialog title="Eventos recebidos" onClose={() => setEvents(undefined)}>
          {!events.length && <p>Nenhum evento recebido.</p>}
          {events.map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString('pt-BR')} · {event.kind} · {event.status}
              {event.errorCode ? ` (${event.errorCode})` : ''}
            </p>
          ))}
        </Dialog>
      )}

      {editing && (
        <Dialog
          title={
            editing.id ? (managedEdit ? 'Renomear conta' : 'Configurar conta') : 'Adicionar conta WhatsApp'
          }
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
            {!editing.id && (
              <label className="field">
                Provedor
                <select
                  value={editing.provider}
                  onChange={(e) => {
                    const provider = e.target.value as Provider;
                    setEditing({
                      name: editing.name,
                      provider,
                      settings: provider === 'META' ? { apiVersion: 'v21.0' } : {},
                    });
                  }}
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {managedEdit && (
              <p className="field-helper">
                O serviço e a sessão são gerenciados pelo servidor. Depois de salvar, conecte lendo o QR Code
                ou usando o código de pareamento.
              </p>
            )}
            {editing.provider === 'EVOLUTION' && !managedEdit && (
              <p className="field-helper">
                Conta Evolution com gateway próprio. Instância: {settings.instance ?? '—'}.
              </p>
            )}
            {editing.provider === 'MOCK' && (
              <p className="field-helper">
                Executa fluxos sem sair do servidor: envios são registrados como simulados e nenhuma mensagem
                chega a um celular.
              </p>
            )}

            {editing.provider === 'META' && (
              <>
                <label className="field">
                  Identificador do número
                  <input
                    value={settings.phoneNumberId ?? ''}
                    onChange={(e) => setting('phoneNumberId', e.target.value)}
                  />
                  <span className="field-helper">
                    Phone Number ID do Meta for Developers, não o telefone.
                  </span>
                </label>
                <label className="field">
                  Identificador WABA (para templates)
                  <input value={settings.wabaId ?? ''} onChange={(e) => setting('wabaId', e.target.value)} />
                </label>
                <label className="field">
                  Versão da API Graph
                  <input
                    value={settings.apiVersion ?? ''}
                    onChange={(e) => setting('apiVersion', e.target.value)}
                  />
                </label>
              </>
            )}

            {editing.provider === 'Z_API' && (
              <label className="field">
                ID da instância
                <input
                  value={settings.instance ?? ''}
                  disabled={!!editing.id}
                  onChange={(e) => setting('instance', e.target.value)}
                />
              </label>
            )}

            {(editing.provider === 'META' ||
              editing.provider === 'Z_API' ||
              (editing.provider === 'EVOLUTION' && !managedEdit)) && (
              <details open={!editing.id}>
                <summary>Credenciais</summary>
                <p className="field-helper">
                  Criptografadas no servidor e nunca exibidas.
                  {editing.id ? ' Preencha só para substituir.' : ''}
                </p>
                <label className="field">
                  {editing.provider === 'META'
                    ? 'Token de acesso'
                    : editing.provider === 'Z_API'
                      ? 'Token da instância'
                      : 'Chave da API'}
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
                      <input
                        type="password"
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                      />
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
                    {editing.provider === 'Z_API'
                      ? 'Client-Token'
                      : 'Segredo do webhook (mínimo 24 caracteres)'}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={secondSecret}
                      onChange={(e) => setSecondSecret(e.target.value)}
                    />
                    {editing.provider === 'Z_API' && (
                      <span className="field-helper">Obrigatório: autentica os webhooks recebidos.</span>
                    )}
                  </label>
                )}
                {editing.webhookPath && <p className="field-helper">Webhook: {editing.webhookPath}</p>}
              </details>
            )}

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
        <Dialog title={`Conectar WhatsApp · ${qr.name}`} onClose={() => setQr(undefined)}>
          {qr.configurationRequired ? (
            <>
              <p role="status">
                Serviço de conexão WhatsApp indisponível. A ativação cabe ao administrador da instalação. Você
                não precisa configurar gateway ou credenciais.
              </p>
              <Button onClick={() => setQr(undefined)}>Entendi</Button>
            </>
          ) : (
            <>
              {qrExpired || !qr.qr ? (
                <p role="status">QR Code expirado. Solicite outro.</p>
              ) : (
                <img className="whatsapp-qr" src={qr.qr} alt="QR Code da sessão WhatsApp" />
              )}
              <p className="field-helper">
                No celular: WhatsApp › Aparelhos conectados › Conectar aparelho. A conexão é confirmada pelo
                provedor; o código some após 30 segundos.
              </p>
              <Button disabled={busy} onClick={() => operate(qr, 'connect')}>
                <RefreshCw size={14} />
                Obter novo QR Code
              </Button>
            </>
          )}
        </Dialog>
      )}

      {releasing && (
        <Dialog title={`Liberar quarentena · ${releasing.name}`} onClose={() => setReleasing(undefined)}>
          <div className="inspector-fields">
            <p>{quarantineLabel(releasing.quarantineReason)}.</p>
            <p className="field-helper">
              A sessão antiga será apagada do gateway e a conta voltará a pedir um QR Code novo. Se o mesmo
              número for restringido de novo, a quarentena volta automaticamente. As outras contas não são
              afetadas.
            </p>
            {error && (
              <div role="alert" className="validation-errors">
                {error}
              </div>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api(`/integrations/whatsapp/${releasing.id}/release-quarantine`, {
                    method: 'POST',
                    body: JSON.stringify({ expectedUpdatedAt: releasing.updatedAt }),
                  });
                  setReleasing(undefined);
                  setNotice('Quarentena liberada. Conecte com um QR Code novo.');
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Liberar quarentena
            </Button>
          </div>
        </Dialog>
      )}

      {pairing && (
        <Dialog title={`Código de pareamento · ${pairing.name}`} onClose={() => setPairing(undefined)}>
          <div className="inspector-fields">
            {pairingCode ? (
              <>
                <output className="pairing-code" aria-label="Código de pareamento">
                  {pairingCode.code}
                </output>
                <p className="field-helper">
                  No celular: WhatsApp › Aparelhos conectados › Conectar aparelho › Conectar com número de
                  telefone, e digite o código.
                  {pairingSeconds !== undefined &&
                    (pairingSeconds > 0
                      ? ` Expira em ${pairingSeconds} s.`
                      : ' Código expirado; gere outro.')}
                </p>
                <Button disabled={busy} onClick={() => setPairingCode(undefined)}>
                  Gerar outro código
                </Button>
              </>
            ) : (
              <>
                <label className="field">
                  Número do WhatsApp
                  <input
                    inputMode="tel"
                    placeholder="55 11 91234-5678"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                  />
                  <span className="field-helper">Com código do país e DDD.</span>
                </label>
                {error && (
                  <div role="alert" className="validation-errors">
                    {error}
                  </div>
                )}
                <Button disabled={busy} onClick={requestPairingCode}>
                  <KeyRound size={14} />
                  Gerar código
                </Button>
              </>
            )}
          </div>
        </Dialog>
      )}
    </main>
  );
}

type ConnectionCardProps = {
  connection: Connection;
  owner: boolean;
  busy: boolean;
  onQr: () => void;
  onPairing: () => void;
  onRelease: () => void;
  onEdit: () => void;
  onEvents: () => void;
  onOperate: (action: string) => void;
};

function ConnectionCard({
  connection,
  owner,
  busy,
  onQr,
  onPairing,
  onRelease,
  onEdit,
  onEvents,
  onOperate,
}: ConnectionCardProps) {
  const quarantined = !!connection.quarantined;
  const disconnected = ['DISCONNECTED', 'ERROR'].includes(connection.state) && !quarantined;
  const pending = ['CONNECTING', 'RECONNECTING', 'WAITING_FOR_QR'].includes(connection.state);
  const connected = connection.state === 'CONNECTED';
  const qrProvider = connection.provider === 'EVOLUTION' || connection.provider === 'Z_API';
  const pairingProvider = connection.provider === 'EVOLUTION' || connection.provider === 'Z_API';
  const status = quarantined
    ? quarantineLabel(connection.quarantineReason)
    : `${stateLabels[connection.state] ?? connection.state}${
        connection.configurationRequired ? ' · Configuração necessária' : ''
      }`;

  return (
    <article className="run-card connection-card">
      <span className="table-icon">
        <MessageCircle size={20} />
      </span>
      <div className="connection-info">
        <h3>{connection.name}</h3>
        <p>
          {providerLabels[connection.provider] ?? connection.provider} · {status}
        </p>
        {connection.lastError && <p role="status">Falha: {connection.lastError}</p>}
        {connection.checkedAt && (
          <p>Verificada em {new Date(connection.checkedAt).toLocaleString('pt-BR')}</p>
        )}
      </div>
      <div className="connection-actions">
        {owner && qrProvider && (disconnected || pending) && (
          <Button disabled={busy} onClick={onQr}>
            <QrCode size={14} />
            {pending ? 'Ver QR Code' : 'Conectar com QR Code'}
          </Button>
        )}
        {owner && !qrProvider && disconnected && (
          <Button disabled={busy || connection.configurationRequired} onClick={() => onOperate('connect')}>
            Conectar
          </Button>
        )}
        {owner && pairingProvider && disconnected && (
          <Button disabled={busy || connection.configurationRequired} onClick={onPairing}>
            <KeyRound size={14} />
            Código de pareamento
          </Button>
        )}
        {connected && (
          <Button disabled={busy} onClick={() => onOperate('refresh')}>
            <RefreshCw size={14} />
            Verificar conexão
          </Button>
        )}
        <Button disabled={busy} onClick={onEvents}>
          Eventos
        </Button>
        {owner && (
          <>
            <Button disabled={busy} onClick={onEdit}>
              <Pencil size={14} />
              {connection.managed ? 'Renomear' : 'Configurar'}
            </Button>
            {(connected || pending) && (
              <Button disabled={busy} onClick={() => onOperate('disconnect')}>
                <Unplug size={14} />
                {connected ? 'Desconectar' : 'Cancelar conexão'}
              </Button>
            )}
            {quarantined && connection.quarantinedAt && (
              <Button disabled={busy} onClick={onRelease}>
                Liberar quarentena
              </Button>
            )}
            {(disconnected || (quarantined && connection.state !== 'CONNECTED')) && (
              <Button disabled={busy} onClick={() => onOperate('archive')}>
                <Archive size={14} />
                Remover da lista
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
