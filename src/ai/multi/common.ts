import { BOARD_SIZE, NUM_CELLS, canStep, cellIndex, onGoal, teamOf } from '../../engine';
import type { Coord, Goal, MultiRules, MultiState, WallLayout } from '../../engine';

export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const dist = new Int16Array(NUM_CELLS);
const queue = new Int16Array(NUM_CELLS);
const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];

/** Steps on the shortest wall-respecting route from `start` to `goal` (pawns ignored), Infinity if none. */
export function goalDistance(walls: WallLayout, start: Coord, goal: Goal): number {
  if (onGoal(start, goal)) return 0;
  dist.fill(-1);
  let head = 0;
  let tail = 0;
  const s = cellIndex(start.row, start.col);
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const idx = queue[head++];
    const row = (idx / BOARD_SIZE) | 0;
    const col = idx - row * BOARD_SIZE;
    for (let k = 0; k < 4; k++) {
      if (!canStep(walls, row, col, DR[k], DC[k])) continue;
      const nr = row + DR[k];
      const nc = col + DC[k];
      const next = nr * BOARD_SIZE + nc;
      if (dist[next] !== -1) continue;
      dist[next] = dist[idx] + 1;
      if ((goal.axis === 'row' ? nr : nc) === goal.index) return dist[next];
      queue[tail++] = next;
    }
  }
  return Infinity;
}

export function allDistances(state: MultiState): number[] {
  return state.rules.players.map((p, seat) => goalDistance(state, state.pawns[seat], p.goal));
}

/** Number of sides (teams, or seats in an individual game). */
export function sideCount(rules: MultiRules): number {
  return rules.teams ? Math.max(...rules.teams) + 1 : rules.players.length;
}

export const sideOf = (rules: MultiRules, seat: number): number => teamOf(rules, seat);

/** Seats of each side. */
export function sideSeats(rules: MultiRules): number[][] {
  const out: number[][] = Array.from({ length: sideCount(rules) }, () => []);
  rules.players.forEach((_, seat) => out[sideOf(rules, seat)].push(seat));
  return out;
}
