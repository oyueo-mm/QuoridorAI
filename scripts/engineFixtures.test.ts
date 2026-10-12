import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFixtures } from './engineFixtures';

const FILE = 'training/fixtures/engine_fixtures.json';

describe('cross-language engine fixtures', () => {
  it.runIf(process.env.WRITE_FIXTURES === '1')('writes the fixture file', () => {
    mkdirSync('training/fixtures', { recursive: true });
    writeFileSync(FILE, JSON.stringify(buildFixtures()) + '\n');
  });

  it('the committed fixture file matches the current TypeScript engine', () => {
    expect(existsSync(FILE), `${FILE} missing — run npm run fixtures:engine`).toBe(true);
    const committed = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildFixtures())));
  });
});
