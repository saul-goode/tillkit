import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Live-backend contract tests: a shared server, so no file-level parallelism.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
