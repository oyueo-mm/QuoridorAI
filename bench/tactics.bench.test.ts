/**
 * Stage-1 tactical test set (not part of `npm test`).
 *
 *   TACTICS=mine npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts
 *     Mines positions from recorded games (bench/results/stage1/stage1-fixed/**) plus a few
 *     hand-made ones, classifies them with the exact oracles of bench/lib/tactics.ts and writes
 *     bench/tactics/positions.json (an existing file is never overwritten: delete it on purpose).
 *
 *   TACTICS=run [AGENTS=ab4,bfs,...] npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts
 *     Asks every agent for a move in every position and scores it. Writes
 *     bench/results/stage1/tactics/tactics-<timestamp>.{md,json}.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { inProcessFactory } from '../src/arena/agentSpec';
import type { AgentSpec, Budget } from '../src/arena/agentSpec';
import { parseMoveList } from '../src/arena/openings';
import { wilson } from '../src/arena/stats';
import {
  createState,
  formatAction,
  hashState,
  legalActions,
  legalPawnMoves,
  opponentOf,
} from '../src/engine';
import type { GameState, WallLayout } from '../src/engine';
import { readGames } from './lib/suite';
import { collectProvenance } from './lib/provenance';
import {
  NoWallSolver,
  bestMargin,
  dist,
  inAlphaBetaCandidates,
  keepsForcedWin,
  marginAfter,
  provenResult,
  savingActions,
  selfHarmWalls,
  winIn3Actions,
  winningPawnMoves,
} from './lib/tactics';

const POSITIONS = 'bench/tactics/positions.json';
const SOURCE = 'bench/results/stage1/stage1-fixed';
const OUT = 'bench/results/stage1/tactics';

export const EXACT = ['win-in-1', 'defend-1', 'win-in-3', 'win-in-5', 'endgame-win', 'endgame-loss'] as const;
export const HEURISTIC = ['race-behind', 'corridor', 'scarce-walls', 'opening-walls'] as const;
type Category = (typeof EXACT)[number] | (typeof HEURISTIC)[number];

interface TacticPosition {
  id: string;
  category: Category;
  exact: boolean;
  tags: string[];
  source: string;
  /** Moves from the standard start (replay with parseMoveList), or a setup for hand-made ones. */
  moves?: string[];
  setup?: Parameters<typeof createState>[0];
  toMove: 0 | 1;
  /** Exact categories: the set of correct answers (null = verified per answer). */
  solution: string[] | null;
  legalCount: number;
  note?: string;
}

function stateOf(p: TacticPosition): GameState {
  if (p.setup) return createState(p.setup);
  const parsed = parseMoveList(p.moves!.join(' '));
  if (parsed.error) throw new Error(`${p.id}: bad move ${parsed.error.notation}`);
  return parsed.positions[parsed.positions.length - 1];
}

const layoutKey = (w: WallLayout) => `${Array.from(w.hWalls).join('')}|${Array.from(w.vWalls).join('')}`;
const solvers = new Map<string, NoWallSolver>();
const solverFor = (s: GameState) => {
  const k = layoutKey(s);
  let v = solvers.get(k);
  if (!v) solvers.set(k, (v = new NoWallSolver(s)));
  return v;
};

const isJumpPosition = (s: GameState) => {
  const [a, b] = s.pawns;
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
};

/** Hand-made positions for situations that self-play rarely produces in a clean form. */
const HANDMADE: TacticPosition[] = [
  { id: 'h-jump-straight', category: 'win-in-1', exact: true, tags: ['jump', 'handmade'], source: 'handmade', setup: { pawns: [{ row: 2, col: 4 }, { row: 1, col: 4 }], wallsRemaining: [3, 3] }, toMove: 0, solution: ['e9'], legalCount: 0, note: 'straight jump over the opponent onto the goal row' },
  { id: 'h-jump-diagonal', category: 'win-in-1', exact: true, tags: ['jump', 'diagonal', 'handmade'], source: 'handmade', setup: { pawns: [{ row: 1, col: 4 }, { row: 0, col: 4 }], wallsRemaining: [3, 3] }, toMove: 0, solution: ['d9', 'f9'], legalCount: 0, note: 'opponent on the goal row blocks the straight move: diagonal jump wins' },
  { id: 'h-defend-file-a', category: 'defend-1', exact: true, tags: ['handmade'], source: 'handmade', setup: { pawns: [{ row: 4, col: 4 }, { row: 7, col: 0 }] }, toMove: 0, solution: null, legalCount: 0, note: 'only a wall stops the opponent on the edge file' },
  { id: 'h-win3-no-walls-opp', category: 'win-in-3', exact: true, tags: ['handmade'], source: 'handmade', setup: { pawns: [{ row: 2, col: 4 }, { row: 0, col: 0 }], wallsRemaining: [10, 0] }, toMove: 0, solution: null, legalCount: 0, note: 'opponent has no walls left: walking forward forces the win' },
];

const minedFrom: { matchup: string; games: number }[] = [];

async function mine(): Promise<TacticPosition[]> {
  const out: TacticPosition[] = [];
  const pools = new Map<Category, { key: string; make: () => TacticPosition | null }[]>();
  const add = (c: Category, key: string, make: () => TacticPosition | null) => {
    const l = pools.get(c) ?? [];
    l.push({ key, make });
    pools.set(c, l);
  };
  const seen = new Set<string>();
  const only = process.env.SOURCES?.split(',').map((x) => x.trim());
  const dirs = (existsSync(SOURCE) ? readdirSync(SOURCE).filter((d) => existsSync(join(SOURCE, d, 'config.json'))).sort() : []).filter((d) => !only || only.includes(d));
  minedFrom.push(...dirs.map((d) => ({ matchup: d, games: readGames(join(SOURCE, d)).length })));
  for (const d of dirs) {
    for (const g of readGames(join(SOURCE, d))) {
      const record = [...g.opening.moves, ...g.moves];
      const parsed = parseMoveList(record.join(' '));
      if (parsed.error) continue;
      parsed.positions.forEach((s, i) => {
        if (s.winner !== null || i < g.opening.moves.length) return;
        const h = hashState(s);
        const key = `${h.key}:${h.check}`;
        if (seen.has(key)) return;
        seen.add(key);
        const me = s.currentPlayer;
        const opp = opponentOf(me);
        const base = (category: Category, exact: boolean, tags: string[], solution: string[] | null): TacticPosition => ({
          id: `${d}/g${g.index}/p${i}`,
          category,
          exact,
          tags,
          source: `${d} game ${g.index} ply ${i}`,
          moves: record.slice(0, i),
          toMove: me,
          solution,
          legalCount: legalActions(s).length,
        });
        const jump = isJumpPosition(s) ? ['jump'] : [];
        const winNow = winningPawnMoves(s).length > 0;
        // Hash order = a deterministic, well-mixed sample.
        const order = `${(h.key % 1_000_003).toString().padStart(7, '0')}`;
        if (winNow) {
          add('win-in-1', order, () => base('win-in-1', true, jump, winningPawnMoves(s).map((to) => formatAction({ type: 'move', to }))));
          return;
        }
        if (s.wallsRemaining[0] === 0 && s.wallsRemaining[1] === 0) {
          add(dist(s, me) <= dist(s, opp) ? 'endgame-win' : 'endgame-loss', order, () => {
            const solver = solverFor(s);
            const v = solver.valueOf(s);
            if (v.result === 'draw') return null;
            const values = legalPawnMoves(s).map((to) => ({ n: formatAction({ type: 'move', to }), v: solver.moveValue(s, to) }));
            if (v.result === 'win') {
              const keep = values.filter((x) => x.v.result === 'win').map((x) => x.n);
              if (keep.length === values.length) return null; // trivial: every move wins
              const p = base('endgame-win', true, [...jump, `dtm${v.plies}`], keep);
              p.note = `win in ${v.plies} plies; optimal: ${values.filter((x) => x.v.result === 'win' && x.v.plies === v.plies).map((x) => x.n).join(' ')}`;
              return p;
            }
            const best = Math.max(...values.map((x) => x.v.plies));
            if (values.every((x) => x.v.plies === best)) return null;
            const p = base('endgame-loss', true, [...jump, `dtm${v.plies}`], values.filter((x) => x.v.plies === best).map((x) => x.n));
            p.note = `lost in ${v.plies} plies; the solution delays the loss the longest`;
            return p;
          });
          return;
        }
        if (winningPawnMoves(s, opp).length > 0) {
          add('defend-1', order, () => {
            const saving = savingActions(s);
            if (saving.length === 0 || saving.length === legalActions(s).length) return null;
            return base('defend-1', true, saving.length <= 3 ? ['few-defences'] : [], saving.map(formatAction));
          });
          return;
        }
        if (dist(s, me) <= 3) {
          add('win-in-3', order, () => {
            const wins = winIn3Actions(s);
            if (wins.length === 0 || wins.length === legalActions(s).length) return null;
            return base('win-in-3', true, jump, wins.map(formatAction));
          });
        }
        if (dist(s, me) <= 4 && s.wallsRemaining[opp] <= 2) {
          add('win-in-5', order, () => {
            if (winIn3Actions(s).length > 0) return null;
            return provenResult(s, 5) === 5 ? base('win-in-5', true, jump, null) : null;
          });
        }
        const dm = dist(s, me);
        const dO = dist(s, opp);
        const walls = s.wallsRemaining[me];
        if (walls > 0 && dm > dO) add('race-behind', order, () => base('race-behind', false, [], null));
        if (dm >= Math.abs(s.pawns[me].row - (me === 0 ? 0 : 8)) + 4 || dO >= Math.abs(s.pawns[opp].row - (opp === 0 ? 0 : 8)) + 4) {
          add('corridor', order, () => base('corridor', false, [], null));
        }
        const total = s.wallsRemaining[0] + s.wallsRemaining[1];
        if (total >= 1 && total <= 3) add('scarce-walls', order, () => base('scarce-walls', false, [], null));
        if (s.wallsRemaining[0] >= 9 && s.wallsRemaining[1] >= 9 && s.ply <= 16) add('opening-walls', order, () => base('opening-walls', false, [], null));
      });
    }
  }
  const caps: Record<Category, number> = {
    'win-in-1': 25, 'defend-1': 30, 'win-in-3': 30, 'win-in-5': 12, 'endgame-win': 25, 'endgame-loss': 15,
    'race-behind': 25, corridor: 20, 'scarce-walls': 20, 'opening-walls': 20,
  };
  const budgetMs: Partial<Record<Category, number>> = { 'win-in-5': 240_000 };
  for (const [c, pool] of pools) {
    pool.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const t0 = performance.now();
    let n = 0;
    for (const cand of pool) {
      if (n >= caps[c] || performance.now() - t0 > (budgetMs[c] ?? 120_000)) break;
      const p = cand.make();
      if (p) {
        out.push(p);
        n++;
      }
    }
    process.stdout.write(`${c}: ${n} positions (pool ${pool.length}, ${((performance.now() - t0) / 1000).toFixed(1)} s)\n`);
  }
  for (const h of HANDMADE) {
    const s = stateOf(h);
    const solution = h.category === 'defend-1' ? savingActions(s).map(formatAction) : h.category === 'win-in-3' ? winIn3Actions(s).map(formatAction) : h.solution;
    out.push({ ...h, solution, legalCount: legalActions(s).length });
  }
  return out;
}

// ---------------------------------------------------------------- run

const AGENTS: Record<string, { spec: AgentSpec; budget: Budget }> = {
  random: { spec: { kind: 'random', depth: 0, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  bfs: { spec: { kind: 'bfs', depth: 0, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  ab1: { spec: { kind: 'alphabeta', depth: 1, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  ab2: { spec: { kind: 'alphabeta', depth: 2, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  ab3: { spec: { kind: 'alphabeta', depth: 3, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  ab4: { spec: { kind: 'alphabeta', depth: 4, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  ab5: { spec: { kind: 'alphabeta', depth: 5, simulations: 0 }, budget: { mode: 'fixed', timeMs: 0 } },
  'ab-300ms': { spec: { kind: 'alphabeta', depth: 4, simulations: 0 }, budget: { mode: 'equal-time', timeMs: 300 } },
  'ab-2s': { spec: { kind: 'alphabeta', depth: 4, simulations: 0 }, budget: { mode: 'equal-time', timeMs: 2000 } },
  guided3000: { spec: { kind: 'mcts-guided', depth: 0, simulations: 3000 }, budget: { mode: 'fixed', timeMs: 0 } },
  'guided-300ms': { spec: { kind: 'mcts-guided', depth: 0, simulations: 3000 }, budget: { mode: 'equal-time', timeMs: 300 } },
  pure1000: { spec: { kind: 'mcts', depth: 0, simulations: 1000 }, budget: { mode: 'fixed', timeMs: 0 } },
  // Stage 2 variants (masked BFS + path-defense wall filter).
  'ab4-pd': { spec: { kind: 'alphabeta', depth: 4, simulations: 0, minimax: { wallFilter: 'path-defense' } }, budget: { mode: 'fixed', timeMs: 0 } },
  'ab5-pd': { spec: { kind: 'alphabeta', depth: 5, simulations: 0, minimax: { wallFilter: 'path-defense' } }, budget: { mode: 'fixed', timeMs: 0 } },
  'ab-300ms-pd': { spec: { kind: 'alphabeta', depth: 4, simulations: 0, minimax: { wallFilter: 'path-defense' } }, budget: { mode: 'equal-time', timeMs: 300 } },
  'ab-2s-pd': { spec: { kind: 'alphabeta', depth: 4, simulations: 0, minimax: { wallFilter: 'path-defense' } }, budget: { mode: 'equal-time', timeMs: 2000 } },
};

interface Answer {
  agent: string;
  id: string;
  category: Category;
  move: string;
  ms: number;
  correct: boolean | null;
  optimal?: boolean;
  /** Heuristic: best 1-ply margin − margin after the move (0 = as good as the best). */
  marginGap?: number;
  selfHarm?: boolean;
  wall?: boolean;
  /** The correct move was not among Alpha-Beta's search candidates (filter miss). */
  filteredOut?: boolean;
  /** win-in-3 answered with a move that still forces a win within 5 plies (slower, not wrong). */
  slowerWin?: boolean;
}

const win5Memo = new Map<string, boolean>();

async function run(positions: TacticPosition[], agentIds: string[]) {
  const answers: Answer[] = [];
  for (const agentId of agentIds) {
    const cfg = AGENTS[agentId];
    if (!cfg) throw new Error(`unknown agent ${agentId}`);
    const t0 = performance.now();
    for (const [i, p] of positions.entries()) {
      const s = stateOf(p);
      const agent = inProcessFactory(cfg.spec, cfg.budget, 1000 + i);
      const t = performance.now();
      const { action } = await agent.decide(s);
      agent.dispose?.();
      const ms = performance.now() - t;
      const move = formatAction(action);
      const a: Answer = { agent: agentId, id: p.id, category: p.category, move, ms, correct: null, wall: action.type === 'wall' };
      if (p.exact) {
        if (p.category === 'win-in-5') {
          const k = `${p.id}|${move}`;
          if (!win5Memo.has(k)) win5Memo.set(k, keepsForcedWin(s, action, 5));
          a.correct = win5Memo.get(k)!;
        } else {
          a.correct = p.solution!.includes(move);
        }
        if (!a.correct && p.category === 'win-in-3') a.slowerWin = keepsForcedWin(s, action, 5);
        if (p.category === 'endgame-win' || p.category === 'endgame-loss') {
          const solver = solverFor(s);
          const v = solver.valueOf(s);
          const mv = action.type === 'move' ? solver.moveValue(s, action.to) : null;
          a.optimal = mv !== null && mv.result === v.result && mv.plies === v.plies;
        }
        if (!a.correct && p.solution && agentId.startsWith('ab') && !agentId.endsWith('-pd')) {
          a.filteredOut = !p.solution.some((n) => {
            const act = legalActions(s).find((x) => formatAction(x) === n);
            return act !== undefined && inAlphaBetaCandidates(s, act);
          });
        }
      } else {
        a.marginGap = bestMargin(s) - marginAfter(s, action);
        a.selfHarm = action.type === 'wall' && selfHarmWalls(s).some((w) => formatAction(w) === move);
      }
      answers.push(a);
    }
    process.stdout.write(`${agentId}: ${positions.length} positions in ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
  }
  return answers;
}

function report(positions: TacticPosition[], answers: Answer[], agentIds: string[]): string {
  const L: string[] = [];
  const prov = collectProvenance();
  const pct = (k: number, n: number) => {
    const w = wilson(k, n);
    return w ? `${k}/${n} (${(100 * w.p).toFixed(0)}%, CI ${(100 * w.low).toFixed(0)}–${(100 * w.high).toFixed(0)})` : '—';
  };
  L.push('# Stage 1 — tactical test results');
  L.push('');
  L.push(`- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.srcDirty ? ' (+uncommitted src)' : ''} · ${prov.cpu} · Node ${prov.node}`);
  L.push(`- ${positions.length} positions (${POSITIONS}). Exact categories are scored against proven answers; heuristic ones by 1-ply measures (no proof).`);
  L.push('- Timed agents (ms budgets) depend on the machine and load; fixed-budget agents are deterministic.');
  L.push('');
  L.push('## Exact categories — correct answers');
  L.push('');
  L.push(`| Category (n) | ${agentIds.join(' | ')} |`);
  L.push(`|---|${agentIds.map(() => '---:|').join('')}`);
  for (const c of EXACT) {
    const n = positions.filter((p) => p.category === c).length;
    if (n === 0) continue;
    const cells = agentIds.map((id) => {
      const as = answers.filter((a) => a.agent === id && a.category === c);
      const k = as.filter((a) => a.correct).length;
      return `${k}/${as.length}`;
    });
    L.push(`| ${c} (${n}) | ${cells.join(' | ')} |`);
  }
  const allExact = agentIds.map((id) => {
    const as = answers.filter((a) => a.agent === id && a.correct !== null);
    return pct(as.filter((a) => a.correct).length, as.length);
  });
  L.push(`| **all exact** | ${allExact.join(' | ')} |`);
  const opt = agentIds.map((id) => {
    const as = answers.filter((a) => a.agent === id && a.optimal !== undefined);
    return `${as.filter((a) => a.optimal).length}/${as.length}`;
  });
  L.push(`| endgame DTM-optimal | ${opt.join(' | ')} |`);
  const filt = agentIds.map((id) => {
    const as = answers.filter((a) => a.agent === id && a.correct === false);
    return id.startsWith('ab') ? `${as.filter((a) => a.filteredOut).length}/${as.length}` : '—';
  });
  L.push(`| AB misses where every correct move was outside the wall filter | ${filt.join(' | ')} |`);
  const slower = agentIds.map((id) => {
    const as = answers.filter((a) => a.agent === id && a.category === 'win-in-3' && a.correct === false);
    return `${as.filter((a) => a.slowerWin).length}/${as.length}`;
  });
  L.push(`| win-in-3 misses that still force a win within 5 plies | ${slower.join(' | ')} |`);
  L.push('');
  L.push('## Heuristic categories — mean gap to the best 1-ply race margin (0 = best; lower is better) · self-harm walls · wall share');
  L.push('');
  L.push(`| Category (n) | ${agentIds.join(' | ')} |`);
  L.push(`|---|${agentIds.map(() => '---:|').join('')}`);
  for (const c of HEURISTIC) {
    const n = positions.filter((p) => p.category === c).length;
    if (n === 0) continue;
    const cells = agentIds.map((id) => {
      const as = answers.filter((a) => a.agent === id && a.category === c);
      const gaps = as.map((a) => a.marginGap!).filter(Number.isFinite);
      const g = gaps.reduce((x, y) => x + y, 0) / Math.max(1, gaps.length);
      return `${g.toFixed(2)} · ${as.filter((a) => a.selfHarm).length} · ${((100 * as.filter((a) => a.wall).length) / Math.max(1, as.length)).toFixed(0)}%`;
    });
    L.push(`| ${c} (${n}) | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Decision time per position (ms, mean)');
  L.push('');
  L.push(`| | ${agentIds.join(' | ')} |`);
  L.push(`|---|${agentIds.map(() => '---:|').join('')}`);
  L.push(`| ms | ${agentIds.map((id) => { const as = answers.filter((a) => a.agent === id); return (as.reduce((s, a) => s + a.ms, 0) / Math.max(1, as.length)).toFixed(0); }).join(' | ')} |`);
  L.push('');
  L.push('## Failed exact positions (first 40)');
  L.push('');
  L.push('| Position | Category | Tags | Agents that failed (their move) | Solution |');
  L.push('|---|---|---|---|---|');
  let shown = 0;
  for (const p of positions.filter((x) => x.exact)) {
    const fails = answers.filter((a) => a.id === p.id && a.correct === false && a.agent !== 'random');
    if (fails.length === 0 || shown >= 40) continue;
    shown++;
    L.push(`| ${p.id} | ${p.category} | ${p.tags.join(' ') || '—'} | ${fails.map((a) => `${a.agent} (${a.move})`).join(', ')} | ${p.solution ? p.solution.slice(0, 6).join(' ') + (p.solution.length > 6 ? ` … (${p.solution.length})` : '') : 'verified per answer'} |`);
  }
  L.push('');
  return L.join('\n');
}

it('stage-1 tactics', async () => {
  const mode = process.env.TACTICS ?? 'run';
  if (mode === 'mine') {
    if (existsSync(POSITIONS)) throw new Error(`${POSITIONS} exists; delete it on purpose to re-mine`);
    const positions = await mine();
    mkdirSync('bench/tactics', { recursive: true });
    writeFileSync(POSITIONS, JSON.stringify({ format: 'quoridor-tactics/1', minedAt: new Date().toISOString(), source: SOURCE, minedFrom, positions }, null, 1) + '\n');
    return;
  }
  const { positions } = JSON.parse(readFileSync(POSITIONS, 'utf8')) as { positions: TacticPosition[] };
  const agentIds = (process.env.AGENTS ?? 'random,bfs,ab1,ab2,ab3,ab4,ab5,guided3000,pure1000').split(',').map((s) => s.trim());
  const answers = await run(positions, agentIds);
  const md = report(positions, answers, agentIds);
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(OUT, `tactics-${stamp}.md`), md + '\n');
  writeFileSync(join(OUT, `tactics-${stamp}.json`), JSON.stringify({ agents: agentIds, answers }, null, 1) + '\n');
  process.stdout.write(md + '\n');
}, 3 * 60 * 60 * 1000);
