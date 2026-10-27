import { applyAction, createInitialState, distanceToRow, goalRow, legalPawnMoves, legalWallPlacements } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';

export interface ReplayStep {
  readonly player: PlayerId;
  readonly action: Action;
  readonly after: GameState;
}

const MAX_PLIES = 56;
/** Plies on which the scripted players try to place a wall instead of stepping. */
const WALL_PLIES = new Set([3, 4, 7, 8, 11, 12, 15, 18, 21]);

/**
 * A demo game for the Home board. Every action is chosen from the engine's own legal-move
 * generators and applied with applyAction, so it is rule-legal by construction: pawns step
 * along the shortest route; on scripted plies the best-gaining legal wall is placed instead
 * (most added opponent distance, least added own distance; ties go to the first candidate).
 */
export function buildHomeReplay(): ReplayStep[] {
  const steps: ReplayStep[] = [];
  let state = createInitialState();
  while (state.winner === null && state.ply < MAX_PLIES) {
    const player = state.currentPlayer;
    const opp: PlayerId = player === 0 ? 1 : 0;
    let action: Action | null = null;

    if (WALL_PLIES.has(state.ply) && state.wallsRemaining[player] > 0) {
      let best = 0;
      const base = distanceToRow(state, state.pawns[opp], goalRow(opp)) - distanceToRow(state, state.pawns[player], goalRow(player));
      for (const wall of legalWallPlacements(state)) {
        const next = applyAction(state, wall);
        const gain = distanceToRow(next, next.pawns[opp], goalRow(opp)) - distanceToRow(next, next.pawns[player], goalRow(player)) - base;
        if (gain > best) {
          best = gain;
          action = wall;
        }
      }
    }
    if (!action) {
      let bestD = Infinity;
      for (const to of legalPawnMoves(state)) {
        const d = to.row === goalRow(player) ? -1 : distanceToRow(state, to, goalRow(player));
        if (d < bestD) {
          bestD = d;
          action = { type: 'move', to };
        }
      }
    }
    if (!action) break;
    state = applyAction(state, action);
    steps.push({ player, action, after: state });
  }
  return steps;
}

let cached: ReplayStep[] | null = null;
export const homeReplay = (): ReplayStep[] => (cached ??= buildHomeReplay());
