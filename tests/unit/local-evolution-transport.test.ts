import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { secureTransport, validateOrigin, whatsappAdapter } from '../../packages/connectors/src';

let server: Server;
let origin: string;
let requests: Array<{ path: string; method: string; body: string; key?: string }>;

beforeEach(async () => {
  requests = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({ path: req.url!, method: req.method!, body, key: req.headers.apikey as string });
      if (req.url === '/hang') return;
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: `${origin}/must-not-follow` }).end();
        return;
      }
      if (req.url === '/large') {
        res.end('x'.repeat(1024 * 1024 + 1));
        return;
      }
      if (req.url === '/invalid') {
        res.end('not-json');
        return;
      }
      if (req.url === '/unauthorized') {
        res.writeHead(401).end('{}');
        return;
      }
      if (req.url === '/limited') {
        res.writeHead(429, { 'Retry-After': '3' }).end('{}');
        return;
      }
      if (req.url?.startsWith('/instance/connectionState/')) {
        res.end(JSON.stringify({ instance: { state: 'close' } }));
        return;
      }
      if (req.url?.startsWith('/instance/connect/')) {
        res.end(JSON.stringify({ base64: 'data:image/png;base64,bG9jYWw=' }));
        return;
      }
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('EVOLUTION_GATEWAY_URL', origin);
  vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', origin);
  vi.stubEnv('EVOLUTION_LOCAL_GATEWAY_ENABLED', 'true');
  vi.stubEnv('WHATSAPP_EXTERNAL_ENABLED', 'false');
  vi.stubEnv('WHATSAPP_SESSION_ENABLED', 'true');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('Evolution local: exceção explícita e restrita ao loopback configurado', () => {
  it('aceita só EVOLUTION na raiz configurada e realiza HTTP real com corpo e autenticação', async () => {
    expect(validateOrigin(origin, 'EVOLUTION')).toBe(origin);
    expect(validateOrigin(`${origin}/`, 'EVOLUTION')).toBe(origin);
    expect(() => validateOrigin(origin, 'META')).toThrow('ORIGIN_NOT_ALLOWED');
    expect(() => validateOrigin(origin, 'OTHER')).toThrow('ORIGIN_NOT_ALLOWED');
    expect(
      await secureTransport(new URL('/echo', origin), 'POST', { apikey: 'local-fixture' }, { fixture: true }),
    ).toEqual({ ok: true });
    expect(requests).toEqual([
      { path: '/echo', method: 'POST', body: '{"fixture":true}', key: 'local-fixture' },
    ]);
  });

  it.each(['false', '', 'TRUE'])('rejeita flag %j mesmo com origem em allowlist', async (flag) => {
    vi.stubEnv('EVOLUTION_LOCAL_GATEWAY_ENABLED', flag);
    expect(() => validateOrigin(origin, 'EVOLUTION')).toThrow('ORIGIN_NOT_ALLOWED');
    await expect(secureTransport(new URL('/echo', origin), 'GET', {})).rejects.toThrow('ORIGIN_NOT_ALLOWED');
    expect(requests).toHaveLength(0);
  });

  it('rejeita host, porta e URLs de configuração fora da exceção explícita', async () => {
    const port = new URL(origin).port;
    for (const invalid of [
      `http://localhost:${port}`,
      `http://127.0.0.2:${port}`,
      `http://192.168.1.1:${port}`,
      `http://[::1]:${port}`,
      `http://127.0.0.1:${Number(port) === 65535 ? 1 : Number(port) + 1}`,
      `${origin}/path`,
      `${origin}?query=1`,
      `${origin}#fragment`,
      `http://user:pass@127.0.0.1:${port}`,
      'http://127.0.0.1',
      'http://127.0.0.1:0',
      `http://2130706433:${port}`,
    ])
      expect(() => validateOrigin(invalid, 'EVOLUTION')).toThrow();
    for (const invalid of [
      `http://localhost:${port}`,
      `http://127.0.0.2:${port}`,
      `http://127.0.0.1:${Number(port) === 65535 ? 1 : Number(port) + 1}`,
    ]) {
      await expect(secureTransport(new URL(invalid), 'GET', {})).rejects.toThrow('ORIGIN_NOT_ALLOWED');
    }
    for (const configured of [
      `${origin}/path`,
      `${origin}?q=1`,
      `${origin}#fragment`,
      'http://localhost:8088',
      'http://127.0.0.1:0',
      'http://127.0.0.1:65536',
    ]) {
      vi.stubEnv('EVOLUTION_GATEWAY_URL', configured);
      expect(() => validateOrigin(origin, 'EVOLUTION')).toThrow();
    }
    expect(requests).toHaveLength(0);
  });

  it('preserva HTTPS público e bloqueia redes privadas mesmo com a flag local', async () => {
    vi.stubEnv('WHATSAPP_GATEWAY_ORIGINS', 'https://gateway.example');
    expect(validateOrigin('https://gateway.example', 'EVOLUTION')).toBe('https://gateway.example');
    expect(validateOrigin('https://graph.facebook.com', 'META')).toBe('https://graph.facebook.com');
    await expect(secureTransport(new URL('https://127.0.0.1:8088'), 'GET', {})).rejects.toThrow(
      'UNSAFE_ADDRESS',
    );
    expect(() => validateOrigin('http://gateway.example', 'EVOLUTION')).toThrow('ORIGIN_NOT_ALLOWED');
  });

  it('preserva porta padrão explícita ao validar novamente a configuração do adapter', () => {
    vi.stubEnv('EVOLUTION_GATEWAY_URL', 'http://127.0.0.1:80/');
    const configured = validateOrigin('http://127.0.0.1:80/', 'EVOLUTION');
    expect(configured).toBe('http://127.0.0.1:80');
    expect(() =>
      whatsappAdapter('EVOLUTION', { origin: configured, instance: 'fixture' }, { apiKey: 'fixture' }),
    ).not.toThrow();
  });

  it('não segue redirecionamentos', async () => {
    await expect(secureTransport(new URL('/redirect', origin), 'GET', {})).rejects.toThrow(
      'PROVIDER_HTTP_302',
    );
    expect(requests.map((req) => req.path)).toEqual(['/redirect']);
  });

  it('preserva limite de resposta, validação JSON, autenticação e retry-after', async () => {
    await expect(secureTransport(new URL('/large', origin), 'GET', {})).rejects.toThrow();
    await expect(secureTransport(new URL('/invalid', origin), 'GET', {})).rejects.toThrow(
      'INVALID_PROVIDER_RESPONSE',
    );
    await expect(secureTransport(new URL('/unauthorized', origin), 'GET', {})).rejects.toThrow(
      'AUTHENTICATION_FAILED',
    );
    await expect(secureTransport(new URL('/limited', origin), 'GET', {})).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_429',
      retrySafe: true,
      retryAfterMs: 3000,
    });
  });

  it('encerra requisição pendente no prazo de dez segundos', async () => {
    await expect(secureTransport(new URL('/hang', origin), 'GET', {})).rejects.toThrow(
      'PROVIDER_REQUEST_UNCERTAIN',
    );
  }, 15000);

  it('permite QR por sessão sem liberar envio de mensagens ou sessão desabilitada', async () => {
    const settings = { origin, instance: 'vexor_org_account' };
    const secrets = { apiKey: 'local-fixture' };
    const session = whatsappAdapter('EVOLUTION', settings, secrets, undefined, true);
    expect(await session.connect()).toMatchObject({
      state: 'WAITING_FOR_QR',
      qr: 'data:image/png;base64,bG9jYWw=',
    });
    const count = requests.length;
    const messages = whatsappAdapter('EVOLUTION', settings, secrets);
    await expect(messages.send({ to: '+5511999999999', text: 'fixture' })).rejects.toThrow(
      'CONFIGURATION_REQUIRED',
    );
    vi.stubEnv('WHATSAPP_SESSION_ENABLED', 'false');
    await expect(session.status()).rejects.toThrow('CONFIGURATION_REQUIRED');
    expect(requests).toHaveLength(count);
  });
});
