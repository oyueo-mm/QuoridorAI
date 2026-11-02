import type { MultiRules } from '../engine';
import { supportsTwoPlayerAi } from '../engine';

/**
 * The multi-player AIs (Random, BFS / Greedy, Max-N for 2–4 seats and every rule set) live in
 * `./multi/`; this module is the one place the rest of the app imports them from. They are
 * independent of the two-player agents (`GameState`, the 209-action encoding and the trainer's
 * tensors are untouched), which keep refusing every rule set except the regular two-player game.
 */
export * from './multi/types';
export * from './multi/registry';
export * from './multi/engine';
export { DEFAULT_MULTI_GREEDY_WEIGHTS, MULTI_WIN_SCORE, resolveGreedyWeights } from './multi/greedy';
export { MAXN_LIMITS, MAXN_PRESETS, WIN as MAXN_WIN, resolveMaxNSettings } from './multi/maxn';

/**
 * Whether the existing two-player agents (Random, BFS, Minimax, MCTS, the AlphaZero-style
 * trainer) may play `rules`. Everything except the regular two-player game is refused.
 */
export function twoPlayerAgentsSupport(rules: MultiRules): boolean {
  return supportsTwoPlayerAi(rules);
}
