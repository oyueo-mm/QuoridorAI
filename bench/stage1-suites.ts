import type { AgentSpec } from '../src/arena/agentSpec';
import type { TournamentConfig } from '../src/arena/tournament';
import type { Matchup } from './lib/suite';

/**
 * Stage-1 experiment definitions. Changing a config changes its hash: results already in a
 * matchup directory are then refused, so give a changed experiment a new id instead.
 *
 * Openings: 6 plies of random pawn moves or walls (25 % walls), |path difference| ≤ 2,
 * every start position distinct — so deterministic agents never replay a game.
 * Guards: 300 plies, third repetition of a position halts the game (no winner).
 */

const ab = (depth: number): AgentSpec => ({ kind: 'alphabeta', depth, simulations: 0 });
/** Alpha-Beta variant for stage-2 A/B runs (settings overrides + label tag). */
const abv = (depth: number, tag: string, minimax: NonNullable<AgentSpec['minimax']>): AgentSpec => ({ ...ab(depth), tag, minimax });
const AB_STAGE1 = { wallFilter: 'opponent-path', pathKernel: 'reference' } as const;
const AB_MASKED = { wallFilter: 'opponent-path', pathKernel: 'masked' } as const;
const AB_DEFENSE = { wallFilter: 'path-defense', pathKernel: 'masked' } as const;
const mm = (depth: number): AgentSpec => ({ kind: 'minimax', depth, simulations: 0 });
const guided = (simulations: number): AgentSpec => ({ kind: 'mcts-guided', depth: 0, simulations });
const pure = (simulations: number): AgentSpec => ({ kind: 'mcts', depth: 0, simulations });
const bfs: AgentSpec = { kind: 'bfs', depth: 0, simulations: 0 };
const random: AgentSpec = { kind: 'random', depth: 0, simulations: 0 };

const base = {
  openingMode: 'mixed',
  openingPlies: 6,
  openingWallProbability: 0.25,
  openingMaxImbalance: 2,
  uniqueOpenings: true,
  maxPlies: 300,
  repetitionLimit: 3,
} as const;

const fixed = (a: AgentSpec, b: AgentSpec, pairs: number, seed: number): TournamentConfig => ({
  ...base,
  agents: [a, b],
  budget: { mode: 'fixed', timeMs: 0 },
  pairs,
  seed,
  maxGameMs: null,
});

const timed = (a: AgentSpec, b: AgentSpec, timeMs: number, pairs: number, seed: number): TournamentConfig => ({
  ...base,
  agents: [a, b],
  budget: { mode: 'equal-time', timeMs },
  pairs,
  seed,
  // Generous: only a stalled machine should ever hit it (reported as a halt, not a result).
  maxGameMs: timeMs * 400,
});

export const SUITES: Record<string, { description: string; maxGames: number; matchups: Matchup[] }> = {
  /** Deterministic, machine-independent (fixed work per move). Safe to shard across cores. */
  'stage1-fixed': {
    description: 'Fixed search budget (depth / simulations), no time limit. Results are machine-independent.',
    maxGames: 1000,
    matchups: [
      { id: 'F0-bfs-vs-random', question: 'Sanity: BFS vs Random', config: fixed(bfs, random, 20, 81000) },
      { id: 'F1-ab2-vs-bfs', question: 'Alpha-Beta depth 2 vs BFS (1-ply heuristic)', config: fixed(ab(2), bfs, 100, 81001) },
      { id: 'F2-ab3-vs-ab2', question: 'Depth scaling: Alpha-Beta depth 3 vs depth 2', config: fixed(ab(3), ab(2), 100, 81002) },
      { id: 'F3-ab4-vs-ab3', question: 'Depth scaling: Alpha-Beta depth 4 vs depth 3', config: fixed(ab(4), ab(3), 100, 81003) },
      { id: 'F4-ab5-vs-ab4', question: 'Depth scaling: Alpha-Beta depth 5 vs depth 4', config: fixed(ab(5), ab(4), 100, 81004) },
      { id: 'F5-ab4-vs-guided3000', question: 'Alpha-Beta depth 4 vs Guided MCTS 3000 simulations', config: fixed(ab(4), guided(3000), 100, 81005) },
      { id: 'F6-guided3000-vs-pure1000', question: 'Guided MCTS 3000 vs Pure MCTS 1000 simulations', config: fixed(guided(3000), pure(1000), 50, 81006) },
      { id: 'F7-minimax3-vs-ab3', question: 'Sanity: plain Minimax depth 3 vs Alpha-Beta depth 3 (same minimax value, tie-breaks may differ)', config: fixed(mm(3), ab(3), 20, 81007) },
    ],
  },
  /** Equal wall-clock per move. Machine-dependent: compare only within the same session/machine. */
  'stage1-time': {
    description: 'Equal time per move for every search agent. Machine- and load-dependent.',
    maxGames: 1000,
    matchups: [
      { id: 'T300-ab-vs-guided', question: 'Alpha-Beta vs Guided MCTS, 300 ms per move', config: timed(ab(4), guided(3000), 300, 100, 82001) },
      { id: 'T300-ab-vs-pure', question: 'Alpha-Beta vs Pure MCTS, 300 ms per move', config: timed(ab(4), pure(500), 300, 50, 82002) },
      { id: 'T300-ab-vs-bfs', question: 'Alpha-Beta (300 ms) vs BFS', config: timed(ab(4), bfs, 300, 50, 82003) },
      { id: 'T2000-ab-vs-guided', question: 'Alpha-Beta vs Guided MCTS, 2 s per move', config: timed(ab(4), guided(3000), 2000, 20, 82004) },
      { id: 'T10000-ab-vs-guided', question: 'Alpha-Beta vs Guided MCTS, 10 s per move (smoke-sized sample)', config: timed(ab(4), guided(3000), 10000, 4, 82005) },
    ],
  },
  /**
   * Stage 2: each improvement against the stage-1 Alpha-Beta, one change at a time.
   * Run with OUT=bench/results/stage2 (separate from stage-1 results).
   */
  'stage2': {
    description: 'Stage-2 A/B: row-mask BFS and the path-defense wall filter, each against the stage-1 Alpha-Beta.',
    maxGames: 1000,
    matchups: [
      { id: 'S1-masked-vs-reference-300', question: 'Bitboard BFS only: AB (masked BFS) vs AB (reference BFS), same filter, 300 ms per move', config: timed(abv(4, 'masked BFS', AB_MASKED), abv(4, 'reference BFS', AB_STAGE1), 300, 100, 92001) },
      { id: 'S2-defense-vs-path-300', question: 'Wall filter only: AB (path-defense) vs AB (opponent-path), both masked BFS, 300 ms per move', config: timed(abv(4, 'path-defense', AB_DEFENSE), abv(4, 'opponent-path', AB_MASKED), 300, 100, 92002) },
      { id: 'S3-defense-vs-path-d4', question: 'Wall filter at equal depth: AB depth 4 path-defense vs opponent-path (fixed budget)', config: fixed(abv(4, 'path-defense', AB_DEFENSE), abv(4, 'opponent-path', AB_MASKED), 100, 92003) },
      { id: 'S4-new-vs-stage1-300', question: 'Both changes: AB (masked + path-defense) vs stage-1 AB (reference + opponent-path), 300 ms per move', config: timed(abv(4, 'stage 2', AB_DEFENSE), abv(4, 'stage 1', AB_STAGE1), 300, 100, 92004) },
      { id: 'S5-new-vs-guided-300', question: 'AB (masked + path-defense) vs Guided MCTS (masked BFS), 300 ms per move', config: timed(abv(4, 'stage 2', AB_DEFENSE), guided(3000), 300, 100, 92005) },
    ],
  },
  /** Tiny configuration for the harness self-test. */
  'smoke': {
    description: 'Harness smoke test (seconds).',
    maxGames: 1000,
    matchups: [{ id: 'S-ab1-vs-bfs', question: 'Smoke: Alpha-Beta depth 1 vs BFS', config: fixed(ab(1), bfs, 2, 80001) }],
  },
};
