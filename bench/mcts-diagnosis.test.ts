/**
 * MCTS weakness diagnosis (small, ~3 min). Run:
 *   npx vitest run --config vitest.bench.config.ts bench/mcts-diagnosis.test.ts
 * Reads bench/results/mcts-benchmark-run2-before-fix.jsonl, writes bench/results/mcts-diagnosis.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS } from '../src/ai/minimaxAgent';
import { decideMcts, resolveMctsSettings } from '../src/ai/mctsAgent';
import { createRolloutEvaluator, rolloutAction } from '../src/ai/mcts/rollout';
import { createRng } from '../src/ai/rng';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MctsSettings, RolloutPolicy } from '../src/ai/types';
import { applyActionUnchecked, applyAction, createInitialState, distanceToRow, formatAction, goalRow, hashState, legalActions, legalPawnMoves } from '../src/engine';
import type { Action, GameState } from '../src/engine';

const out: string[] = [];
const log = (l = '') => {
  out.push(l);
  process.stdout.write(l + '\n');
};
const f2 = (x: number) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(2);
const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
/** Alpha-Beta reference value of a position for `perspective` (depth plies). */
function abValue(s: GameState, depth: number, perspective: 0 | 1): { score: number; best: Action } | null {
  if (s.winner !== null) return { score: s.winner === perspective ? 10_000 : -10_000, best: null as unknown as Action };
  const r = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: depth, timeLimitMs: 0 }, evaluator);
  return { score: s.currentPlayer === perspective ? r.score : -r.score, best: r.bestAction };
}

interface Game {
  type: 'game';
  row: string;
  opening: [number, number];
  mctsSeat: 0 | 1;
  mctsSeed: number;
  result: string;
  plies: number;
  mcts: { avgSimulations: number };
  moves: string[];
}

function opening(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalPawnMoves(s);
    s = applyAction(s, { type: 'move', to: moves[Math.floor(rng() * moves.length)] });
  }
  return s;
}
const byNotation = (s: GameState, n: string) => legalActions(s).find((a) => formatAction(a) === n)!;

it('MCTS diagnosis', () => {
  const lines = readFileSync('bench/results/mcts-benchmark-run2-before-fix.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const games: Game[] = lines.filter((l) => l.type === 'game');

  log('# MCTS weakness diagnosis');
  log();
  log(`Source games: \`mcts-benchmark-run2-before-fix.jsonl\` (${games.length} games). Reference evaluator: Alpha-Beta with the default distance evaluation.`);
  log();

  // ------------------------------------------------------------ 6. seat fairness
  log('## 1. Seat fairness (run 2)');
  log();
  log('| Row | MCTS as P1: games / W / L / halted | MCTS as P2: games / W / L / halted | Same openings for both seats |');
  log('|---|---|---|---|');
  for (const row of [...new Set(games.map((g) => g.row))]) {
    const gs = games.filter((g) => g.row === row);
    const cell = (seat: 0 | 1) => {
      const x = gs.filter((g) => g.mctsSeat === seat);
      return `${x.length} / ${x.filter((g) => g.result === 'mcts-win').length} / ${x.filter((g) => g.result === 'mcts-loss').length} / ${x.filter((g) => g.result.startsWith('halted')).length}`;
    };
    const key = (seat: 0 | 1) => gs.filter((g) => g.mctsSeat === seat).map((g) => `${g.opening}:${g.mctsSeed}`).sort().join('|');
    log(`| ${row} | ${cell(0)} | ${cell(1)} | ${key(0) === key(1) ? 'yes' : 'NO'} |`);
  }
  log();

  // ------------------------------------------------------------ 3. rollouts
  log('## 2. Rollout behaviour (400 rollouts per policy and position)');
  log();
  const positions: [string, GameState][] = [
    ['start', createInitialState()],
    ['opening (2,4)', opening(2, 4)],
  ];
  // A middlegame position from a lost game (ply 20 of the first lost t200 game).
  const lostT200 = games.filter((g) => g.row === 't200-ab' && g.result === 'mcts-loss');
  {
    const g = lostT200[0];
    let s = opening(g.opening[0], g.opening[1]);
    for (const m of g.moves.slice(0, 20)) s = applyAction(s, byNotation(s, m));
    positions.push([`middlegame (t200 game 1, +20 plies)`, s]);
  }
  log('| Position | Policy | Ends with winner | Avg plies | Walls / rollout | Walls used by ply 20 | Pawn back-steps / rollout | Repeated positions / rollout | P1 win share | Mean value (P1 view) | Alpha-Beta d4 (P1 view) |');
  log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name, start] of positions) {
    const ab = abValue(start, 4, 0)!.score;
    for (const policy of ['uniform', 'balanced', 'heuristic'] as RolloutPolicy[]) {
      const settings = resolveMctsSettings({ rollout: policy, rolloutMaxPlies: 100 });
      const rng = createRng(7);
      let ended = 0, plies = 0, walls = 0, wallsBy20 = 0, back = 0, reps = 0, p0wins = 0, value = 0;
      const N = 400;
      for (let k = 0; k < N; k++) {
        let s = start;
        const seen = new Set<string>();
        const last: (string | null)[][] = [[null, null], [null, null]];
        let ply = 0;
        while (s.winner === null && ply < 100) {
          const a = rolloutAction(policy, s, rng, settings as MctsSettings);
          const p = s.currentPlayer;
          if (a.type === 'wall') {
            walls++;
            if (ply < 20) wallsBy20++;
          } else {
            const from = `${s.pawns[p].row},${s.pawns[p].col}`;
            const to = `${a.to.row},${a.to.col}`;
            if (last[p][0] === to) back++; // returns to where it stood one own-move ago
            last[p] = [from, to];
          }
          s = applyActionUnchecked(s, a);
          const h = hashState(s);
          const key = `${h.key}:${h.check}`;
          if (seen.has(key)) reps++;
          seen.add(key);
          ply++;
        }
        plies += ply;
        if (s.winner !== null) {
          ended++;
          if (s.winner === 0) p0wins++;
        }
      }
      const ev = createRolloutEvaluator(settings);
      const r2 = createRng(9);
      for (let k = 0; k < N; k++) value += ev(start, r2).value;
      log(
        `| ${name} | ${policy} | ${((100 * ended) / N).toFixed(0)}% | ${(plies / N).toFixed(1)} | ${(walls / N).toFixed(1)} | ${(wallsBy20 / N).toFixed(1)} | ` +
          `${(back / N).toFixed(2)} | ${(reps / N).toFixed(2)} | ${ended ? ((100 * p0wins) / ended).toFixed(0) : '—'}% | ${f2(value / N)} | ${f2(ab)} |`,
      );
    }
  }
  log();

  // ------------------------------------------------------------ 4. root distributions
  log('## 3. Root visit / value distribution vs. budget');
  log();
  log('SE = standard error of Q (≈ √((1 − Q²)/N)). "Gap" = Q(best) − Q(2nd). "AB loss" = Alpha-Beta depth-4 value of the best move minus that of MCTS’s choice (0 = same quality).');
  log();
  log('| Position | Sims | Root moves | Top-3 (N, Q ± SE) | Gap | Chosen | AB best | AB loss |');
  log('|---|---:|---:|---|---:|---|---|---:|');
  for (const [name, s] of positions) {
    const me = s.currentPlayer;
    const ref = abValue(s, 4, me)!;
    for (const sims of [150, 1000, 5000]) {
      const t = decideMcts(s, resolveMctsSettings({ iterations: sims, timeLimitMs: 0 }), 1);
      const top = t.candidates.slice(0, 3).map((c) => `${c.notation} ${c.visits}, ${f2(c.q)}±${Math.sqrt(Math.max(0, 1 - c.q * c.q) / Math.max(1, c.visits)).toFixed(2)}`);
      const chosen = t.candidates[0];
      const after = applyAction(s, chosen.action);
      const v = abValue(after, 3, me)!.score;
      log(
        `| ${name} | ${sims} | ${t.candidates.length} | ${top.join(' · ')} | ${(t.candidates[0].q - (t.candidates[1]?.q ?? 0)).toFixed(3)} | ` +
          `${chosen.notation} | ${formatAction(ref.best)} | ${(ref.score - v).toFixed(2)} |`,
      );
    }
  }
  log();

  // ------------------------------------------------------------ 7. lost games
  log('## 4. Decisive mistakes in lost games (equal time vs Alpha-Beta)');
  log();
  const picks = [
    ...games.filter((g) => g.row === 't200-ab' && g.result === 'mcts-loss').slice(0, 2),
    ...games.filter((g) => g.row === 't500-ab' && g.result === 'mcts-loss').slice(0, 1),
  ];
  for (const g of picks) {
    let s = opening(g.opening[0], g.opening[1]);
    const seat = g.mctsSeat;
    log(`### ${g.row}, opening (${g.opening}), MCTS = P${seat + 1}, seed ${g.mctsSeed}, ${g.plies} plies, ≈${Math.round(g.mcts.avgSimulations)} simulations/move`);
    log();
    log('| Ply | MCTS move | AB best | AB value before (MCTS view) | AB value after MCTS move | Loss | Walls MCTS:opp | d MCTS:opp |');
    log('|---:|---|---|---:|---:|---:|---|---|');
    let worst: { ply: number; state: GameState; loss: number; move: string; best: string } | null = null;
    for (const [i, mv] of g.moves.entries()) {
      const action = byNotation(s, mv);
      if (s.currentPlayer === seat && s.winner === null) {
        const before = abValue(s, 4, seat)!;
        const next = applyAction(s, action);
        const after = abValue(next, 3, seat)!;
        const loss = before.score - after.score;
        const opp = (1 - seat) as 0 | 1;
        if (loss >= 0.75 || Math.abs(after.score) >= 9000) {
          log(
            `| ${s.ply + 1} | ${mv} | ${formatAction(before.best)} | ${f2(before.score)} | ${f2(after.score)} | ${loss.toFixed(2)} | ` +
              `${s.wallsRemaining[seat]}:${s.wallsRemaining[opp]} | ${distanceToRow(s, s.pawns[seat], goalRow(seat))}:${distanceToRow(s, s.pawns[opp], goalRow(opp))} |`,
          );
        }
        if (!worst || loss > worst.loss) worst = { ply: s.ply + 1, state: s, loss, move: mv, best: formatAction(before.best) };
        s = next;
      } else s = applyAction(s, action);
      void i;
    }
    log();
    if (worst) {
      const sims = Math.max(50, Math.round(g.mcts.avgSimulations));
      const t = decideMcts(worst.state, resolveMctsSettings({ iterations: sims, timeLimitMs: 0 }), g.mctsSeed);
      const row = (n: string) => {
        const c = t.candidates.find((x) => x.notation === n);
        return c ? `N ${c.visits}, Q ${f2(c.q)}` : 'not expanded';
      };
      log(
        `Largest single loss: ply ${worst.ply}, MCTS played **${worst.move}**, Alpha-Beta prefers **${worst.best}** (loss ${worst.loss.toFixed(2)}). ` +
          `Re-running MCTS there with ${sims} simulations: ${worst.move} → ${row(worst.move)}; ${worst.best} → ${row(worst.best)}; ` +
          `root moves ${t.candidates.length}, top visits ${t.candidates.slice(0, 4).map((c) => `${c.notation} ${c.visits}`).join(', ')}.`,
      );
      log();
    }
  }

  writeFileSync('bench/results/mcts-diagnosis.md', out.join('\n') + '\n');
});
