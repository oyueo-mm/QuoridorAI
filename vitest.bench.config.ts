import { defineConfig } from 'vitest/config';

// Benchmarks live outside src/ and are not part of `npm test`. Run with `npm run bench`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['bench/**/*.test.ts'],
    // Harnesses enforce their own budgets; this is only a last-resort ceiling.
    testTimeout: 3 * 60 * 60 * 1000,
  },
});
