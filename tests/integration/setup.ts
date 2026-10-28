// Optional isolated API for integration tests while the user's local WhatsApp stays online.
// Production application code and tests keep their usual URL when this is not set.
const base = process.env.TEST_API_URL;
if (base) {
  const url = new URL(base);
  if (url.hostname !== '127.0.0.1' || !/^4\d{3}$/.test(url.port))
    throw new Error('Integration API must be local.');
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('http://127.0.0.1:4000/'))
      return original(input.replace('http://127.0.0.1:4000', base), init);
    return original(input, init);
  };
}
