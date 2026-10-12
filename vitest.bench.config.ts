import { defineConfig } from 'vitest/config';

// Benchmarks live outside src/ and are not part of `npm test`. Run with `npm run bench`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['bench/**/*.test.ts'],
    testTimeout: 30 * 60 * 1000,
  },
});
