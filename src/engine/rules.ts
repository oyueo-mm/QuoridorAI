import { DIRECTIONS, WALL_GRID, canStep, goalRow, opponentOf, sameCoord } from './board';
import { hasPathToRow, shortestPath } from './pathfinding';
import { checkWallPlacement, pathEdgeSet, wallConflicts, wallCutsEdges, withWall } from './walls';
import type { Action, Coord, GameState, Orientation, PlayerId, WallAction, WallLayout } from './types';

/**
 * Legal pawn destinations for `player` (defaults to the player to move).
 *
 * For each orthogonal direction:
 *   - an empty, unwalled neighbour is a legal step;
 *   - if the neighbour holds the opponent, the pawn may jump straight over it, unless a wall
 *     or the board edge is behind the opponent; in that case it may instead move diagonally
 *     to either side of the opponent (where not walled off).
 */
export function legalPawnMoves(state: GameState, player: PlayerId = state.currentPlayer): Coord[] {
  if (state.winner !== null) return [];
  return pawnMovesAmong(state, state.pawns[player], [state.pawns[opponentOf(player)]]);
}

/**
 * Pawn destinations for a pawn on `self` given the cells held by all `others` (walls only
 * come from `walls`). Shared by the two-player and the multi-player engine.
 *
 * Per orthogonal direction: an unoccupied, unwalled neighbour is a step. If the neighbour holds
 * a pawn, the mover may jump straight over it when the cell behind it is on the board, not
 * walled off and not occupied (at most one pawn is ever jumped). Otherwise it may move
 * diagonally to either side of the jumped pawn, where not walled off and not occupied.
 */
export function pawnMovesAmong(walls: WallLayout, self: Coord, others: readonly Coord[]): Coord[] {
  const moves: Coord[] = [];
  const seen = new Set<number>();
  const occupied = (row: number, col: number) => others.some((o) => o.row === row && o.col === col);
  const add = (row: number, col: number) => {
    const key = row * 16 + col;
    if (seen.has(key)) return;
    seen.add(key);
    moves.push({ row, col });
  };

  for (const d of DIRECTIONS) {
    if (!canStep(walls, self.row, self.col, d.row, d.col)) continue;
    const next = { row: self.row + d.row, col: self.col + d.col };
    if (!occupied(next.row, next.col)) {
      add(next.row, next.col);
      continue;
    }
    if (canStep(walls, next.row, next.col, d.row, d.col) && !occupied(next.row + d.row, next.col + d.col)) {
      add(next.row + d.row, next.col + d.col);
      continue;
    }
    // Straight jump blocked (wall, edge or another pawn behind): diagonal moves to the sides.
    const sides = d.row === 0
      ? [{ row: -1, col: 0 }, { row: 1, col: 0 }]
      : [{ row: 0, col: -1 }, { row: 0, col: 1 }];
    for (const s of sides) {
      if (canStep(walls, next.row, next.col, s.row, s.col) && !occupied(next.row + s.row, next.col + s.col)) {
        add(next.row + s.row, next.col + s.col);
      }
    }
  }
  return moves;
}

/**
 * All legal wall placements for the player to move, horizontal walls first, row-major.
 *
 * Optimised: a wall can only disconnect a player if it cuts that player's current shortest
 * path (otherwise that path still exists). So each player's path is computed once, and the
 * full reachability BFS is only run for walls that cut one of the two paths.
 * Equivalent to legalWallPlacementsBruteForce (verified by tests).
 */
export function legalWallPlacements(state: GameState): WallAction[] {
  if (state.winner !== null || state.wallsRemaining[state.currentPlayer] <= 0) return [];
  const paths = [0, 1].map((p) => shortestPath(state, state.pawns[p], goalRow(p as PlayerId)));
  if (paths[0] === null || paths[1] === null) return legalWallPlacementsBruteForce(state);
  const edges = [pathEdgeSet(paths[0]), pathEdgeSet(paths[1])];

  const result: WallAction[] = [];
  const orientations: Orientation[] = ['h', 'v'];
  for (const orientation of orientations) {
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        if (wallConflicts(state, orientation, row, col)) continue;
        const cuts0 = wallCutsEdges(edges[0], orientation, row, col);
        const cuts1 = wallCutsEdges(edges[1], orientation, row, col);
        if (cuts0 || cuts1) {
          const next = withWall(state, orientation, row, col);
          if (cuts0 && !hasPathToRow(next, state.pawns[0], goalRow(0))) continue;
          if (cuts1 && !hasPathToRow(next, state.pawns[1], goalRow(1))) continue;
        }
        result.push({ type: 'wall', orientation, row, col });
      }
    }
  }
  return result;
}

/** Reference implementation: full checkWallPlacement for every slot. Kept for tests/benchmarks. */
export function legalWallPlacementsBruteForce(state: GameState): WallAction[] {
  if (state.winner !== null || state.wallsRemaining[state.currentPlayer] <= 0) return [];
  const result: WallAction[] = [];
  const orientations: Orientation[] = ['h', 'v'];
  for (const orientation of orientations) {
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        const wall: WallAction = { type: 'wall', orientation, row, col };
        if (checkWallPlacement(state, wall) === 'ok') result.push(wall);
      }
    }
  }
  return result;
}

/** Every legal action for the player to move: pawn moves first, then walls. */
export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const moves: Action[] = legalPawnMoves(state).map((to) => ({ type: 'move', to }));
  return moves.concat(legalWallPlacements(state));
}

export function isLegalAction(state: GameState, action: Action): boolean {
  if (state.winner !== null) return false;
  if (action.type === 'move') {
    return legalPawnMoves(state).some((c) => sameCoord(c, action.to));
  }
  return checkWallPlacement(state, action) === 'ok';
}
