import type { GameState, PlayerId } from '../../src/engine';

export const OPENING_IDENTITY = 'quoridor-2p-goal-preserving-v1';

/** Four automorphisms of the regular row-goal game. A row flip MUST exchange players/goals. */
export function transformOpening(state: GameState, flipRows: boolean, flipCols: boolean): GameState {
  const hWalls = new Uint8Array(64);
  const vWalls = new Uint8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const target = (flipRows ? 7 - r : r) * 8 + (flipCols ? 7 - c : c);
    hWalls[target] = state.hWalls[r * 8 + c];
    vWalls[target] = state.vWalls[r * 8 + c];
  }
  const pawn = (p: PlayerId) => ({ row: flipRows ? 8 - state.pawns[p].row : state.pawns[p].row, col: flipCols ? 8 - state.pawns[p].col : state.pawns[p].col });
  const swap = (p: PlayerId): PlayerId => flipRows ? (1 - p) as PlayerId : p;
  return { ...state, hWalls, vWalls,
    pawns: flipRows ? [pawn(1), pawn(0)] : [pawn(0), pawn(1)],
    wallsRemaining: flipRows ? [state.wallsRemaining[1], state.wallsRemaining[0]] : state.wallsRemaining,
    currentPlayer: swap(state.currentPlayer), winner: state.winner === null ? null : swap(state.winner),
  };
}

/** Lossless board encoding, not a hash. Ply/history are intentionally absent for a fresh game. */
export function exactOpeningKey(state: GameState): string {
  const walls = (array: Uint8Array) => {
    if (array.length !== 64 || array.some((value) => value !== 0 && value !== 1)) throw new Error('Expected regular 9x9 binary wall arrays');
    return [...array.keys()].filter((index) => array[index] === 1).join(',');
  };
  return `h:${walls(state.hWalls)};v:${walls(state.vWalls)};p:${state.pawns.map((p) => p.row * 9 + p.col).join(',')};w:${state.wallsRemaining.join(',')};t:${state.currentPlayer};win:${state.winner ?? '-'}`;
}

export function canonicalOpeningKey(state: GameState): string {
  return [exactOpeningKey(state), exactOpeningKey(transformOpening(state, false, true)),
    exactOpeningKey(transformOpening(state, true, false)), exactOpeningKey(transformOpening(state, true, true))].sort()[0];
}
