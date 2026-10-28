// Fail closed: tests may never use the live workspace database or services.
export function configureTestEnvironment() {
  const value =
    process.env.TEST_DATABASE_URL ??
    'postgresql://eimax:eimax_local_only@127.0.0.1:55432/eimax_test?schema=public';
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_test$/.test(url.pathname))
    throw new Error('Tests require a local database ending in _test; eimax is forbidden.');
  Object.assign(process.env, {
    DATABASE_URL: value,
    TEST_DATABASE_URL: value,
    TEST_API_URL: 'http://127.0.0.1:4001',
    API_ORIGIN: 'http://127.0.0.1:4001',
    API_PORT: '4001',
    WEB_ORIGIN: 'http://127.0.0.1:3001',
    DEVELOPMENT_WORKSPACE: 'true',
    NEXT_TEST_DIST: '.next-test',
    WHATSAPP_EXTERNAL_ENABLED: 'false',
    WHATSAPP_SESSION_ENABLED: 'false',
    EMAIL_EXTERNAL_ENABLED: 'false',
    WHATSAPP_LOCAL_AUTOSTART: 'false',
    EVOLUTION_LOCAL_GATEWAY_ENABLED: 'false',
    ESFERA_OPTOUT_LINKS_JSON: '{}',
    OPT_OUT_CONFIRMATION_ENABLED: 'false',
  });
  return url;
}
