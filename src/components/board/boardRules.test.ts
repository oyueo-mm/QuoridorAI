import { describe, expect, it } from 'vitest';
import { FOUR_PLAYER_RULES, applyActionMulti, createInitialState, createMultiState, createState } from '../../engine';
import { FOUR_PLAYER_BOARD, TWO_PLAYER_BOARD, multiBoardRules } from './boardRules';

describe('board rules adapters', () => {
  it('two-player: seat = colour slot, goals are the two rows, both paths exist', () => {
    const s = createInitialState();
    expect(TWO_PLAYER_BOARD.playerCount).toBe(2);
    expect([0, 1].map((p) => TWO_PLAYER_BOARD.slot(p))).toEqual([0, 1]);
    expect(TWO_PLAYER_BOARD.goals).toEqual([{ axis: 'row', index: 0 }, { axis: 'row', index: 8 }]);
    expect(TWO_PLAYER_BOARD.paths(s).map((p) => p.path.length - 1)).toEqual([8, 8]);
    expect(TWO_PLAYER_BOARD.legalMoves(s)).toHaveLength(3);
    expect(TWO_PLAYER_BOARD.checkWall(s, { type: 'wall', orientation: 'h', row: 3, col: 3 })).toBe('ok');
  });

  it('two-player: a wall that seals a player is refused by the adapter', () => {
    const s = createState({ pawns: [{ row: 8, col: 4 }, { row: 0, col: 0 }], walls: [{ orientation: 'v', row: 0, col: 0 }], currentPlayer: 0 });
    expect(TWO_PLAYER_BOARD.checkWall(s, { type: 'wall', orientation: 'h', row: 1, col: 0 })).toBe('blocks-path');
  });

  it('four-player: colour slots follow the clockwise turn order, one goal edge per seat', () => {
    expect([0, 1, 2, 3].map((seat) => FOUR_PLAYER_BOARD.slot(seat))).toEqual([0, 2, 1, 3]);
    const edges = FOUR_PLAYER_BOARD.goals.map((g) => `${g.axis}${g.index}`).sort();
    expect(edges).toEqual(['col0', 'col8', 'row0', 'row8']);
  });

  it('four-player: paths for all four players, moves and walls come from the multi engine', () => {
    let s = createMultiState({ rules: FOUR_PLAYER_RULES });
    expect(FOUR_PLAYER_BOARD.paths(s).map((p) => p.path.length - 1)).toEqual([8, 8, 8, 8]);
    expect(FOUR_PLAYER_BOARD.legalMoves(s)).toHaveLength(3);
    s = applyActionMulti(s, { type: 'move', to: { row: 7, col: 4 } });
    expect(s.currentPlayer).toBe(2);
    expect(FOUR_PLAYER_BOARD.legalMoves(s).map((c) => `${c.row},${c.col}`).sort()).toEqual(['3,0', '4,1', '5,0']);
    expect(multiBoardRules(FOUR_PLAYER_RULES).playerCount).toBe(4);
  });
});
