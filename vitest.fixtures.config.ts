import { defineConfig } from 'vitest/config';

// `npm run fixtures:engine`: regenerates training/fixtures/engine_fixtures.json from the TS engine.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    env: { WRITE_FIXTURES: '1' },
  },
});
