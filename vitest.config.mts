
import { defineConfig } from 'vitest/config'; // ESM config for Node 20.
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' } });
