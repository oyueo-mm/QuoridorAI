/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served from https://<user>.github.io/QuoridorAI/ — every asset URL is prefixed with this base.
export default defineConfig({
  base: '/QuoridorAI/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    // bench/lib holds the (fast) unit tests of the benchmark harness; the benchmarks themselves
    // (bench/*.test.ts) only run through vitest.bench.config.ts.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'bench/lib/**/*.test.ts'],
    // Search-algorithm tests (MCTS rollouts, deep Minimax) can exceed vitest's 5 s default.
    testTimeout: 30_000,
  },
});
