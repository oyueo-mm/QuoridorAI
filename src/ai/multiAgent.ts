import type { Action, MultiRules, MultiState } from '../engine';
import { supportsTwoPlayerAi } from '../engine';

/**
 * Interface reserved for AIs of the multi-player games (not implemented yet — the variants are
 * played by people). It exists so that the next stage has one place to plug in, and so that the
 * existing two-player AIs are never handed a rule set they were not built for.
 *
 * Contract of a future agent:
 *   - it declares which rule sets it understands via `supports` (team games, shared goal lines,
 *     neutral walls and unequal wall counts all change what a good move is);
 *   - it chooses for `state.currentPlayer` only, from `legalActionsMulti(state)`;
 *   - it is deterministic for a given seed, like the two-player agents.
 */
export interface MultiAgent {
  readonly id: string;
  supports(rules: MultiRules): boolean;
  chooseAction(state: MultiState, options: { seed: number }): Action | Promise<Action>;
}

/**
 * Whether the existing two-player agents (Random, BFS, Minimax, MCTS, the AlphaZero-style
 * trainer) may play `rules`. Everything except the regular two-player game is refused.
 */
export function twoPlayerAgentsSupport(rules: MultiRules): boolean {
  return supportsTwoPlayerAi(rules);
}
