import { describe, expect, it } from 'vitest';
import { parseMoveList } from '../arena/openings';
import { applyAction, createInitialState } from '../engine';
import { buildRecord, movesText, parseRecord, recordToText, replayActions } from './gameRecord';
import { wallOwnersFromMoves } from './wallOwners';

// Includes walls, a straight jump (e4 over e5) and a diagonal step (d4, the jump is blocked by d3h).
const LINE = 'e2 e8 e3 e7 e4 e6 e5 e4 d3h a8h d4';

describe('game records', () => {
  const parsed = parseMoveList(LINE);

  it('the test line really contains a jump and a diagonal move', () => {
    expect(parsed.error).toBeUndefined();
    const jump = parsed.actions[7].action;
    expect(jump).toEqual({ type: 'move', to: { row: 5, col: 4 } });
    expect(parsed.positions[7].pawns[1]).toEqual({ row: 3, col: 4 }); // from e6, two rows
    const diag = parsed.actions[10].action;
    expect(diag).toEqual({ type: 'move', to: { row: 5, col: 3 } });
    expect(parsed.positions[10].pawns[0]).toEqual({ row: 4, col: 4 });
  });

  it('JSON export -> import restores moves, players, ply, position and wall owners', () => {
    const rec = buildRecord({ actions: parsed.actions, ply: 9 }, { source: 'play', seats: [{ kind: 'human', label: '나' }, { kind: 'ai', label: 'BFS', agent: 'bfs' }], result: { kind: 'playing' } });
    expect(rec.toMove).toBe(1);
    const back = parseRecord(JSON.stringify(rec));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.line.ply).toBe(9);
    expect(back.line.actions).toEqual(parsed.actions);
    expect(back.record?.seats?.[1].agent).toBe('bfs');
    const a = replayActions(back.line.actions).at(-1)!;
    const b = parsed.positions.at(-1)!;
    expect(a.pawns).toEqual(b.pawns);
    expect(a.wallsRemaining).toEqual(b.wallsRemaining);
    expect(a.currentPlayer).toBe(b.currentPlayer);
    expect([...wallOwnersFromMoves(back.line.actions)]).toEqual([...wallOwnersFromMoves(parsed.actions)]);
  });

  it('text export reads back with the existing move-list parser', () => {
    const text = recordToText(parsed.actions);
    expect(text.startsWith('1. e2 e8 2. e3 e7')).toBe(true);
    const back = parseRecord(text);
    expect(back.ok && back.line.actions).toEqual(parsed.actions);
    expect(movesText(parsed.actions, 3)).toBe('e2 e8 e3');
  });

  it('rejects tampered records instead of guessing', () => {
    const rec = buildRecord({ actions: parsed.actions, ply: 11 }, { source: 'play' });
    const wrongPlayer = { ...rec, moves: rec.moves.map((m, i) => (i === 3 ? { ...m, player: 0 } : m)) };
    expect(parseRecord(JSON.stringify(wrongPlayer)).ok).toBe(false);
    const wrongFinal = { ...rec, final: { ...rec.final, wallsRemaining: [10, 10] } };
    expect(parseRecord(JSON.stringify(wrongFinal)).ok).toBe(false);
    const illegal = { ...rec, moves: [...rec.moves, { ply: 12, player: 1, notation: 'a1' }] };
    expect(parseRecord(JSON.stringify(illegal)).ok).toBe(false);
    expect(parseRecord(JSON.stringify({ ...rec, version: 99 })).ok).toBe(false);
    expect(parseRecord('{ not json').ok).toBe(false);
  });

  it('clamps the selected ply and records whose turn it is', () => {
    const rec = buildRecord({ actions: parsed.actions, ply: 99 }, { source: 'compare' });
    expect(rec.ply).toBe(parsed.actions.length);
    expect(rec.toMove).toBe(applyAction(parsed.positions[10], parsed.actions[10].action).currentPlayer);
    expect(buildRecord({ actions: [], ply: 0 }, { source: 'play' }).toMove).toBe(createInitialState().currentPlayer);
  });
});
