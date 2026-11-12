import type { AgentSpec } from '../src/arena/agentSpec';
import { DEFAULT_SPRT } from '../src/arena/sprt';
import type { TournamentConfig } from '../src/arena/tournament';
import type { Matchup } from './lib/suite';
import { FITTED_EVAL_E5 } from '../src/ai/search/evaluation';
import { E6, EVAL_CANDIDATES, LEDGER_3A, LEDGER_3B, LEDGER_3B_NEXT } from './stage3b-candidates';

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
const AB_DEFENSE3 = { wallFilter: 'path-defense', pathKernel: 'masked', defenseMaxDistance: 3 } as const;
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

/** Stage 3-B: stage-3 opening policy and no opening used before (ledger). */
const fresh = (c: TournamentConfig): TournamentConfig => ({ ...sprtCfg(c), excludeOpeningsFile: LEDGER_3A });

/** Follow-up runs after 3-B: also disjoint from every 3-B opening. */
const fresh3b = (c: TournamentConfig): TournamentConfig => ({ ...sprtCfg(c), excludeOpeningsFile: LEDGER_3B });

/** Stage-3 opening policy: mirror-invariant unique openings of 4–8 plies. */
const sprtCfg = (c: TournamentConfig): TournamentConfig => ({ ...c, openingPlies: 4, openingPliesMax: 8, openingDedupe: 'mirror' });

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
  /**
   * Stage 2b, after S2 rejected always-on protection (36 %): protection only within 3 steps of
   * the goal, and the default Alpha-Beta (masked BFS) against Guided MCTS (masked BFS).
   * Run with OUT=bench/results/stage2.
   */
  'stage2b': {
    description: 'Stage-2b A/B: end-of-race protective walls; default Alpha-Beta vs Guided MCTS, both with bitboard BFS.',
    maxGames: 1000,
    matchups: [
      { id: 'S6-defense3-vs-path-300', question: 'AB (path-defense within 3 steps) vs AB (opponent-path), both masked BFS, 300 ms per move', config: timed(abv(4, 'defense≤3', AB_DEFENSE3), abv(4, 'opponent-path', AB_MASKED), 300, 100, 92006) },
      { id: 'S7-masked-vs-guided-300', question: 'Default AB (masked BFS, opponent-path) vs Guided MCTS (masked BFS), 300 ms per move', config: timed(abv(4, 'masked BFS', AB_MASKED), guided(3000), 300, 100, 92007) },
    ],
  },
  /**
   * Stage 3-A: validation of the SPRT evaluation system on fresh openings (mirror-invariant
   * unique, 4–8 plies). V1/V1b: a known large difference (fixed budget, deterministic: V1b must
   * reproduce V1 exactly). V2: a null test — identical Alpha-Beta on both sides at 300 ms.
   * Run with OUT=bench/results/stage3a.
   */
  'stage3a': {
    description: 'Stage 3-A: SPRT validation (H0 Elo 0 vs H1 Elo +30, α = β = 0.05, 30–600 pairs).',
    maxGames: 2000,
    matchups: [
      { id: 'V1-sprt-ab3-vs-ab2', question: 'SPRT on a known large difference: Alpha-Beta depth 3 vs depth 2 (fixed budget)', config: sprtCfg(fixed(ab(3), ab(2), DEFAULT_SPRT.maxPairs, 93001)), sprt: DEFAULT_SPRT },
      { id: 'V1b-sprt-ab3-vs-ab2-repeat', question: 'Reproducibility: identical configuration to V1 (decision and pair count must match)', config: sprtCfg(fixed(ab(3), ab(2), DEFAULT_SPRT.maxPairs, 93001)), sprt: DEFAULT_SPRT },
      { id: 'V2-sprt-null-ab-vs-ab-300', question: 'SPRT null test: identical Alpha-Beta (default settings) on both sides, 300 ms per move', config: sprtCfg(timed(abv(4, 'A', AB_MASKED), abv(4, 'B', AB_MASKED), 300, DEFAULT_SPRT.maxPairs, 93002)), sprt: DEFAULT_SPRT },
    ],
  },
  /**
   * Stage 3-B, step 1: each evaluation candidate vs the current evaluation at equal depth 4
   * (deterministic; measures judgement without the cost). New openings disjoint from every earlier
   * experiment and from E5's training games. Run with OUT=bench/results/stage3b.
   */
  'stage3b-fixed': {
    description: 'Stage 3-B: evaluation candidates vs current evaluation, fixed depth 4, SPRT (H0 0 / H1 +30).',
    maxGames: 2000,
    matchups: Object.entries(EVAL_CANDIDATES).map(([id, w], i) => ({
      id: `F-${id}-d4`,
      question: `Evaluation ${id} vs current evaluation, both Alpha-Beta depth 4 (fixed budget)`,
      config: fresh(fixed(abv(4, id, { ...AB_MASKED, evaluation: w }), abv(4, 'current eval', AB_MASKED), DEFAULT_SPRT.maxPairs, 94001 + i)),
      sprt: DEFAULT_SPRT,
    })),
  },
  /**
   * Stage 3-B, step 2: equal time (300 ms), for candidates promoted in step 1. Different seeds →
   * openings independent of step 1 (and still disjoint from the ledger).
   */
  'stage3b-time': {
    description: 'Stage 3-B: evaluation candidates vs current evaluation, 300 ms per move, SPRT (H0 0 / H1 +30).',
    maxGames: 2000,
    matchups: Object.entries(EVAL_CANDIDATES).map(([id, w], i) => ({
      id: `T-${id}-300`,
      question: `Evaluation ${id} vs current evaluation, Alpha-Beta 300 ms per move`,
      config: fresh(timed(abv(4, id, { ...AB_MASKED, evaluation: w }), abv(4, 'current eval', AB_MASKED), 300, DEFAULT_SPRT.maxPairs, 95001 + i)),
      sprt: DEFAULT_SPRT,
    })),
  },
  /**
   * After 3-B (E5 adopted as the Alpha-Beta default). Weights are written out explicitly, so these
   * configurations do not change if the default changes again. Openings disjoint from all of 3-B.
   *   P-E6-300  pilot, fixed 40 pairs, never counted in the SPRT: screens for clear harm or bugs.
   *   T-E6-300  SPRT (unchanged H0 0 / H1 +30, α = β = 0.05), only if the pilot gate says go.
   *   G-E5-…    final comparison: adopted Alpha-Beta vs Guided MCTS, 300 ms, 100 pairs
   *             (same design as stage 2's S7, which measured the old evaluation at +73 Elo).
   */
  'stage3b-next': {
    description: 'After 3-B: E6 pilot + SPRT vs adopted E5, and adopted Alpha-Beta vs Guided MCTS (300 ms).',
    maxGames: 2000,
    matchups: [
      { id: 'P-E6-300', question: 'Pilot (40 pairs): E6 (E5 + E4 term) vs adopted E5, Alpha-Beta 300 ms', config: fresh3b(timed(abv(4, 'E6', { ...AB_MASKED, evaluation: E6 }), abv(4, 'E5 (default)', { ...AB_MASKED, evaluation: FITTED_EVAL_E5 }), 300, 40, 96001)) },
      { id: 'T-E6-300', question: 'SPRT: E6 (E5 + E4 term) vs adopted E5, Alpha-Beta 300 ms', config: fresh3b(timed(abv(4, 'E6', { ...AB_MASKED, evaluation: E6 }), abv(4, 'E5 (default)', { ...AB_MASKED, evaluation: FITTED_EVAL_E5 }), 300, DEFAULT_SPRT.maxPairs, 96002)), sprt: DEFAULT_SPRT },
      { id: 'G-E5-vs-guided-300', question: 'Adopted Alpha-Beta (E5) vs Guided MCTS, 300 ms per move, 100 pairs', config: fresh3b(timed(abv(4, 'E5 (default)', { ...AB_MASKED, evaluation: FITTED_EVAL_E5 }), guided(3000), 300, 100, 96003)) },
    ],
  },
  /**
   * Independent confirmation of T-E6-300 before E6 becomes the default: its pilot (AC power, 37
   * pairs) scored 0.500 while the SPRT (battery, shallower searches) scored 0.622. Same test and
   * bounds, new seed, openings disjoint from everything up to the follow-up (ledger-ffcd0dde).
   * Run on AC power. Both SPRTs are reported whatever this one decides.
   */
  'stage3b-confirm': {
    description: 'E6 confirmation SPRT vs adopted E5, 300 ms, AC power, new openings.',
    maxGames: 2000,
    matchups: [
      { id: 'C-E6-300', question: 'Confirmation SPRT: E6 vs adopted E5, Alpha-Beta 300 ms (AC power)', config: { ...sprtCfg(timed(abv(4, 'E6', { ...AB_MASKED, evaluation: E6 }), abv(4, 'E5 (default)', { ...AB_MASKED, evaluation: FITTED_EVAL_E5 }), 300, DEFAULT_SPRT.maxPairs, 96005)), excludeOpeningsFile: LEDGER_3B_NEXT }, sprt: DEFAULT_SPRT },
    ],
  },
  /** Tiny configuration for the harness self-test. */
  'smoke': {
    description: 'Harness smoke test (seconds).',
    maxGames: 1000,
    matchups: [{ id: 'S-ab1-vs-bfs', question: 'Smoke: Alpha-Beta depth 1 vs BFS', config: fixed(ab(1), bfs, 2, 80001) }],
  },
};
