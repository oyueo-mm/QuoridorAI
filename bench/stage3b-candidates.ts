import { FITTED_EVAL_E5, RACE_EVAL_V1 } from '../src/ai/search/evaluation';
import type { MinimaxEvalWeights } from '../src/ai/types';

/**
 * Stage 3-B evaluation candidates. Parameters were fixed before any candidate game was played
 * (no tuning on SPRT data). Each candidate changes one thing relative to RACE_EVAL_V1.
 *
 * E1 walls in hand: diminishing returns (k-th wall worth 0.85^(k−1)) and worth less as the race
 *    ends (× min(1, (d_self + d_opp) / 10)) — stage 1 showed Alpha-Beta losing with walls unused.
 * E2 distances as 6·ln(1 + d/6): one step near the goal counts more than one step far away.
 * E3 path vulnerability: ± 0.5 × (opponent's − own) largest single-wall detour.
 * E4 vulnerability × walls in hand: 0.5 × (v_opp·min(w_self,3)/3 − v_self·min(w_opp,3)/3).
 * E5 linear weights fitted to recorded outcomes (bench/results/stage3b/e5-fit-*.md).
 */
export const EVAL_CANDIDATES: Record<string, MinimaxEvalWeights> = {
  E1: { ...RACE_EVAL_V1, wallDecay: 0.85, wallPhaseSum: 10 },
  E2: { ...RACE_EVAL_V1, distanceCurve: 6 },
  E3: { ...RACE_EVAL_V1, vulnerability: 0.5 },
  E4: { ...RACE_EVAL_V1, vulnerabilityThreat: 0.5 },
  // From e5-fit (validation log-loss 0.4557 vs 0.4897 for the current weights, split by opening).
  E5: { selfDistance: 1.001, opponentDistance: 1, wallDifference: 1.503, tempo: 0.482 }, // = FITTED_EVAL_E5 (adopted, then superseded by E6 = ALPHA_BETA_EVAL)
};

/** Openings used by any experiment up to stage 3-A (incl. E5's training games): excluded from 3-B. */
export const LEDGER_3A = 'bench/openings/ledger-626fec59.txt';

/** Openings used by any experiment up to stage 3-B: excluded from the follow-up runs. */
export const LEDGER_3B = 'bench/openings/ledger-7ca328c9.txt';

/** Openings up to the 3-B follow-up (incl. the E6 pilot/SPRT and the Guided comparison). */
export const LEDGER_3B_NEXT = 'bench/openings/ledger-ffcd0dde.txt';

/**
 * E6 = E4 on top of the E5 weights (adopted after 3-B as ALPHA_BETA_EVAL) (a combination is a new candidate with its own games).
 * Parameters fixed before any E6 game: E4's term unchanged (0.5). Reason for the re-test: E4 won at
 * depth 4 (+84 Elo) but lost ~2 ply at 300 ms (5× cost per node); the exact vulnerability cache and
 * resumed BFS cut that to ~2× (~0.7 ply). See docs/stage3b-eval-report.md.
 */
export const E6: MinimaxEvalWeights = { ...FITTED_EVAL_E5, vulnerabilityThreat: 0.5 };

/** Openings of every stage 3-B run (incl. the E6 confirmation): excluded from stage 3-C. */
export const LEDGER_3C = 'bench/openings/ledger-418a1271.txt';

/**
 * Stage 3-C package C1 (search options only; evaluation E6 frozen as written here):
 * typed table, PVS, table kept between moves, verified interrupted-iteration result.
 */
export const SEARCH_C1 = { ttKind: 'typed', pvs: true, ttPersist: true, partialIteration: true } as const;
