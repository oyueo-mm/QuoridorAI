/**
 * Multi-player AI benchmark (not part of `npm test`).
 * Run: npx vitest run --config vitest.bench.config.ts bench/multi.bench.test.ts
 * Writes bench/results/multi-benchmark.md. Times depend on the machine (Node, one thread, no
 * worker); node counts, depths and candidate counts are deterministic for a given position.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  applyActionMulti,
  createMultiState,
  fixedRules,
  legalActionsMulti,
  obstacleRules,
} from '../src/engine';
import type { MultiRules, MultiState } from '../src/engine';
import { DEFAULT_MULTI_GREEDY_WEIGHTS, decideMultiGreedy } from '../src/ai/multi/greedy';
import { MAXN_PRESETS, decideMultiMaxN } from '../src/ai/multi/maxn';

const out: string[] = [];
const log = (line = '') => {
  out.push(line);
  process.stdout.write(line + '\n');
};
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const wallsFor = (n: number) => (n === 2 ? 10 : 5);
const fresh = (rules: MultiRules, walls?: number) => createMultiState({ rules, wallsPerPlayer: walls ?? wallsFor(rules.players.length) });

/** Plays the 1-ply Greedy for every seat until `stop` says so (a reproducible way to reach a mid-game position). */
function playGreedy(s: MultiState, stop: (s: MultiState) => boolean, max = 200): MultiState {
  for (let i = 0; i < max && s.winner === null && !stop(s); i++) s = applyActionMulti(s, decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS).action);
  return s;
}
const wallsOnBoard = (s: MultiState) => s.hWalls.reduce((a, b) => a + b, 0) + s.vWalls.reduce((a, b) => a + b, 0);

const scenarios: { name: string; state: () => MultiState }[] = [
  { name: '정규 4인전 초기', state: () => fresh(FOUR_PLAYER_RULES) },
  { name: '정규 4인전 중반 (벽 8개 이상)', state: () => playGreedy(fresh(FOUR_PLAYER_RULES), (s) => wallsOnBoard(s) >= 8, 300) },
  {
    name: '말 4개가 인접한 복잡한 상태',
    state: () => createMultiState({ rules: FOUR_PLAYER_RULES, wallsPerPlayer: 5, pawns: [{ row: 4, col: 4 }, { row: 4, col: 3 }, { row: 3, col: 4 }, { row: 4, col: 5 }], firstPlayer: 0 }),
  },
  { name: '동방향 4인 경주 초기', state: () => fresh(fixedRules('race-4')!) },
  { name: '2 vs 2 팀전 (12수 진행)', state: () => playGreedy(fresh(fixedRules('team-2v2')!), (s) => s.ply >= 12) },
  { name: '장애물 경주 (4인, 어려움 맵)', state: () => fresh(obstacleRules(4, 'hard', 7)) },
];

const REPEAT = 5;
const stats = (xs: number[]) => ({ mean: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) });

it('multi-player AI benchmark', () => {
  log('# 다인전 AI 벤치마크');
  log();
  log(`- 환경: ${cpus()[0].model.trim()} · ${cpus().length} 스레드 · Node ${process.version} (워커 없이 단일 스레드, 브라우저 워커 성능과 같지 않을 수 있음)`);
  log(`- 측정: 각 조합을 ${REPEAT}번 실행한 평균 / 최악 시간. 노드 수·깊이·후보 수는 위치가 같으면 항상 같음 (시간 예산에 걸린 경우 제외).`);
  log('- 노드 = 탐색이 생성해 평가한 국면 수. 후보 = 첫 수에서 탐색한 행동 수(말 이동 전부 + 벽 후보).');
  log();

  for (const sc of scenarios) {
    const state = sc.state();
    const legal = legalActionsMulti(state);
    log(`## ${sc.name}`);
    log();
    log(`합법 행동 ${legal.length}개 (말 이동 ${legal.filter((a) => a.type === 'move').length}, 벽 ${legal.filter((a) => a.type === 'wall').length}) · ${state.rules.players.length}인 · ${state.ply}수째`);
    log();
    log('| AI | 평균 ms | 최악 ms | 노드 | 완료 깊이 | 후보 | 벽 후보/합법 | 종료 | 전치표 적중 |');
    log('|---|---:|---:|---:|---:|---:|---:|---|---:|');

    const g = Array.from({ length: REPEAT }, () => decideMultiGreedy(state, DEFAULT_MULTI_GREEDY_WEIGHTS));
    const gt = stats(g.map((d) => d.trace.elapsedMs));
    log(`| Greedy (1수) | ${fmt(gt.mean, 1)} | ${fmt(gt.max, 1)} | ${g[0].trace.totalCandidates} | 1 | ${g[0].trace.totalCandidates} | – | – | – |`);

    for (const preset of ['easy', 'normal', 'hard'] as const) {
      const runs = Array.from({ length: REPEAT }, () => decideMultiMaxN(state, MAXN_PRESETS[preset]));
      const t = stats(runs.map((d) => d.trace.elapsedMs));
      const tr = runs[0].trace;
      const stops = [...new Set(runs.map((d) => d.trace.stopReason))].join('/');
      log(`| Max-N ${preset} (깊이≤${MAXN_PRESETS[preset].maxDepth}, ${MAXN_PRESETS[preset].timeMs}ms) | ${fmt(t.mean)} | ${fmt(t.max)} | ${fmt(tr.nodes)} | ${tr.completedDepth} | ${tr.candidates.length} | ${tr.consideredWalls}/${tr.legalWalls} | ${stops} | ${fmt(tr.ttHits)} |`);
    }
    log();
  }

  // Cancel responsiveness: time from raising the abort flag (inside a progress callback) until the search returns.
  log('## 취소 응답성 (탐색 중 취소 → 함수 반환까지)');
  log();
  const heavy = playGreedy(fresh(FOUR_PLAYER_RULES), (s) => wallsOnBoard(s) >= 8, 300);
  const latencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const signal = { aborted: false };
    let raisedAt = 0;
    const t0 = performance.now();
    decideMultiMaxN(heavy, { ...MAXN_PRESETS.hard, timeMs: 20_000, maxNodes: 5_000_000, maxDepth: 10 }, {
      signal,
      onProgress: (p) => {
        if (!signal.aborted && p.elapsedMs > 150) {
          signal.aborted = true;
          raisedAt = performance.now();
        }
      },
    });
    if (raisedAt) latencies.push(performance.now() - raisedAt);
    else latencies.push(NaN);
    void t0;
  }
  const valid = latencies.filter((x) => !Number.isNaN(x));
  log(`- 취소 플래그를 올린 뒤 반환까지: 평균 ${fmt(stats(valid).mean, 2)} ms, 최악 ${fmt(stats(valid).max, 2)} ms (${valid.length}/10회 측정). 탐색은 노드마다 플래그를 확인하고, 브라우저에서는 워커를 terminate하므로 즉시 끝납니다.`);
  log();

  mkdirSync('bench/results', { recursive: true });
  writeFileSync('bench/results/multi-benchmark.md', out.join('\n') + '\n');
}, 30 * 60 * 1000);
