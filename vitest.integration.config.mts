import { defineConfig } from 'vitest/config'; // ESM config for Node 20.
import { configureTestEnvironment } from './scripts/test-environment.mjs';
configureTestEnvironment();
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
