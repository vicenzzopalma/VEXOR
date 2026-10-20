
import { defineConfig } from 'vitest/config'; // ESM config for Node 20.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
