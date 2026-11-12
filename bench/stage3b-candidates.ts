import { DEFAULT_MINIMAX_EVAL } from '../src/ai/search/evaluation';
import type { MinimaxEvalWeights } from '../src/ai/types';

/**
 * Stage 3-B evaluation candidates. Parameters were fixed before any candidate game was played
 * (no tuning on SPRT data). Each candidate changes one thing relative to DEFAULT_MINIMAX_EVAL.
 *
 * E1 walls in hand: diminishing returns (k-th wall worth 0.85^(k−1)) and worth less as the race
 *    ends (× min(1, (d_self + d_opp) / 10)) — stage 1 showed Alpha-Beta losing with walls unused.
 * E2 distances as 6·ln(1 + d/6): one step near the goal counts more than one step far away.
 * E3 path vulnerability: ± 0.5 × (opponent's − own) largest single-wall detour.
 * E4 vulnerability × walls in hand: 0.5 × (v_opp·min(w_self,3)/3 − v_self·min(w_opp,3)/3).
 * E5 linear weights fitted to recorded outcomes (bench/results/stage3b/e5-fit-*.md).
 */
export const EVAL_CANDIDATES: Record<string, MinimaxEvalWeights> = {
  E1: { ...DEFAULT_MINIMAX_EVAL, wallDecay: 0.85, wallPhaseSum: 10 },
  E2: { ...DEFAULT_MINIMAX_EVAL, distanceCurve: 6 },
  E3: { ...DEFAULT_MINIMAX_EVAL, vulnerability: 0.5 },
  E4: { ...DEFAULT_MINIMAX_EVAL, vulnerabilityThreat: 0.5 },
  // From e5-fit (validation log-loss 0.4557 vs 0.4897 for the current weights, split by opening).
  E5: { selfDistance: 1.001, opponentDistance: 1, wallDifference: 1.503, tempo: 0.482 },
};

/** Openings used by any experiment up to stage 3-A (incl. E5's training games): excluded from 3-B. */
export const LEDGER_3A = 'bench/openings/ledger-626fec59.txt';
