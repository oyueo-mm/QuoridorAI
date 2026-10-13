import { describe, expect, it } from 'vitest';
import { parseMoveList } from '../arena/openings';
import type { DecisionTrace } from '../ai/types';
import { createInitialState } from '../engine';
import type { Action } from '../engine';
import { replayActions } from '../match/gameRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import { branchAt, gotoPly, loadLine, playMove, redoMove, resetToBase, undoMove } from './analysisLine';
import { aiValue, positionKey, raceMargin } from './positionEval';

const mv = (row: number, col: number): Action => ({ type: 'move', to: { row, col } });

describe('analysis line', () => {
  const source = parseMoveList('e2 e8 e3 e7 d4h');
  const loaded = () => loadLine({ actions: source.actions, ply: 3 });

  it('loads a copy at the given ply; the source is never modified', () => {
    const a = loaded();
    expect(a.cursor).toBe(3);
    const at = replayActions(a.line)[a.cursor];
    const b = playMove(a, at, mv(1, 3)); // a different P2 move at ply 3 -> variation
    expect(b.line).toHaveLength(4);
    expect(source.actions).toHaveLength(5);
    expect(a.line).toHaveLength(5);
    expect(branchAt(b)).toBe(3);
  });

  it('undo / redo / goto move the cursor; a new move discards the old continuation', () => {
    let a = gotoPly(loaded(), 5);
    a = undoMove(undoMove(a));
    expect(a.cursor).toBe(3);
    a = redoMove(a);
    expect(a.cursor).toBe(4);
    expect(redoMove(gotoPly(a, 99)).cursor).toBe(5);
    a = gotoPly(a, 2);
    const at = replayActions(a.line)[2];
    a = playMove(a, at, mv(7, 3)); // P1 plays d2 instead of e3
    expect(a.line).toHaveLength(3);
    expect(a.line[2].player).toBe(0);
    expect(redoMove(a).cursor).toBe(3); // nothing to redo past the new end
    expect(resetToBase(a).line).toHaveLength(5);
  });

  it('playing the move that is already next keeps the line (just steps forward)', () => {
    const a = gotoPly(loaded(), 1);
    const b = playMove(a, replayActions(a.line)[1], source.actions[1].action);
    expect(b.line).toBe(a.line);
    expect(b.cursor).toBe(2);
  });

  it('illegal moves and finished positions change nothing', () => {
    const a = loaded();
    expect(playMove(a, replayActions(a.line)[3], mv(4, 4))).toBe(a);
  });

  it('turn and wall owners stay correct after branching', () => {
    let a = gotoPly(loaded(), 4); // after e2 e8 e3 e7, P1 to move
    a = playMove(a, replayActions(a.line)[4], { type: 'wall', orientation: 'v', row: 3, col: 3 });
    a = playMove(a, replayActions(a.line)[5], { type: 'wall', orientation: 'h', row: 5, col: 0 });
    const owners = wallOwnersFromMoves(a.line.slice(0, a.cursor));
    expect(owners.get('v3,3')).toBe(0);
    expect(owners.get('h5,0')).toBe(1);
    expect(owners.has('h4,3')).toBe(false); // d4h of the original line is gone in this branch
    expect(replayActions(a.line)[a.cursor].currentPlayer).toBe(0);
  });
});

describe('evaluation values', () => {
  it('race margin is from P1 view and does not flip with the turn', () => {
    const p = parseMoveList('e2 e8 e3').positions;
    expect(raceMargin(createInitialState())).toBe(0);
    expect(raceMargin(p[1])).toBe(1); // P1 closer, P2 to move
    expect(raceMargin(p[2])).toBe(0); // P1 to move
    expect(raceMargin(p[3])).toBe(1);
  });

  it('AI values are converted from the mover view to P1 view', () => {
    const minimax = { algorithm: 'minimax', score: 2.5 } as unknown as DecisionTrace;
    expect(aiValue(minimax, 0)).toEqual({ kind: 'minimax', value: 2.5 });
    expect(aiValue(minimax, 1)).toEqual({ kind: 'minimax', value: -2.5 });
    const forced = { algorithm: 'minimax', score: 10000 } as unknown as DecisionTrace;
    expect(aiValue(forced, 1)).toEqual({ kind: 'minimax', value: -10000, forced: -1 });
    const mcts = { algorithm: 'mcts', candidates: [{ q: 0.3 }] } as unknown as DecisionTrace;
    expect(aiValue(mcts, 1)!.value).toBeCloseTo(-0.3);
    const random = { algorithm: 'random' } as unknown as DecisionTrace;
    expect(aiValue(random, 0)).toBeNull();
  });

  it('position keys identify positions, not move orders', () => {
    const a = parseMoveList('e2 e8 d2').positions.at(-1)!;
    const b = parseMoveList('d1 e8 d2').positions.at(-1)!;
    const c = parseMoveList('e2 e8 e3').positions.at(-1)!;
    expect(positionKey(a)).toBe(positionKey(b));
    expect(positionKey(a)).not.toBe(positionKey(c));
  });
});
