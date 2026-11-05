import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: { STORE_BACKEND: 'memory', LOG_LEVEL: 'silent' },
  },
});
