import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, createState, isLegalAction, legalPawnMoves } from '../../engine';
import type { Coord, GameState } from '../../engine';
import { DEFAULT_GUIDED_MCTS_SETTINGS, DEFAULT_MCTS_SETTINGS, decideMcts, resolveMctsSettings } from '../mctsAgent';
import { puct, runMcts, uct } from '../mcts/core';
import type { MctsConfig, MctsGame, MctsNode, Player } from '../mcts/core';
import { SHAPE_CAP, heuristicValue, rolloutWinValue, truncatedValue } from '../mcts/rollout';
import { createRng } from '../rng';

const at = (row: number, col: number): Coord => ({ row, col });

describe('variants', () => {
  it('pure MCTS keeps the stage-4 baseline settings; guided enables A + B + C', () => {
    expect(DEFAULT_MCTS_SETTINGS).toMatchObject({
      variant: 'pure',
      selection: 'uct',
      rollout: 'heuristic',
      rolloutMaxPlies: 100,
      rolloutCutoff: 'distance',
      valueShaping: false,
    });
    expect(DEFAULT_GUIDED_MCTS_SETTINGS).toMatchObject({
      variant: 'guided',
      selection: 'puct',
      rolloutMaxPlies: 4,
      rolloutCutoff: 'evaluation',
      valueShaping: true,
    });
    expect(resolveMctsSettings({ variant: 'guided', iterations: 5 }).selection).toBe('puct');
    expect(resolveMctsSettings({ iterations: 5 }).selection).toBe('uct');
  });
});

describe('value shaping keeps real results consistent (C)', () => {
  it('estimates stay strictly inside (−0.9, 0.9) and keep a slope where tanh saturates', () => {
    for (const x of [0, 1, 5, 20, 100, 1e6]) {
      expect(Math.abs(heuristicValue(x, true))).toBeLessThan(SHAPE_CAP);
      expect(heuristicValue(-x, true)).toBeCloseTo(-heuristicValue(x, true), 12);
    }
    // In a lopsided position (−16 vs −18 steps) tanh barely distinguishes, the soft sign does.
    const tanhGap = heuristicValue(-16, false) - heuristicValue(-18, false);
    const shapedGap = heuristicValue(-16, true) - heuristicValue(-18, true);
    expect(tanhGap).toBeLessThan(1e-3);
    expect(shapedGap).toBeGreaterThan(0.01);
  });

  it('a win found by a rollout lies in (0.9, 1] — above every estimate, at most a terminal win', () => {
    const p0Won = createState({ pawns: [at(0, 4), at(2, 4)] }); // P2 still 6 steps away
    const p0WonNarrowly = createState({ pawns: [at(0, 4), at(7, 4)] }); // P2 was 1 step away
    const wide = rolloutWinValue(p0Won, true);
    const narrow = rolloutWinValue(p0WonNarrowly, true);
    expect(wide).toBeGreaterThan(SHAPE_CAP);
    expect(wide).toBeLessThanOrEqual(1);
    expect(narrow).toBeGreaterThan(SHAPE_CAP);
    expect(wide).toBeGreaterThan(narrow); // bigger margin, higher value
    expect(rolloutWinValue(p0Won, false)).toBe(1);
    const p1Won = createState({ pawns: [at(4, 4), at(8, 4)] });
    expect(rolloutWinValue(p1Won, true)).toBeLessThan(-SHAPE_CAP);
  });

  it('truncated rollouts use the evaluation cut-off', () => {
    const s = createState({ pawns: [at(2, 4), at(6, 4)], wallsRemaining: [10, 4] });
    const shaped = truncatedValue(s, { ...DEFAULT_GUIDED_MCTS_SETTINGS });
    const plain = truncatedValue(s, { ...DEFAULT_GUIDED_MCTS_SETTINGS, valueShaping: false });
    expect(shaped).toBeGreaterThan(0);
    expect(shaped).toBeLessThan(SHAPE_CAP);
    expect(plain).toBeGreaterThan(shaped); // tanh is already close to 1 here
  });
});

// ---------------------------------------------------------------- PUCT on toy trees (B)

interface ToyNode {
  toMove: Player;
  children?: Record<string, string>;
  winner?: Player;
  value?: number;
}
type Tree = Record<string, ToyNode>;
const toy = (tree: Tree, priors: Record<string, number[]>): MctsGame<string, string> => ({
  toMove: (s) => tree[s].toMove,
  winner: (s) => tree[s].winner ?? null,
  actions: (s) => Object.keys(tree[s].children ?? {}),
  apply: (s, a) => tree[s].children![a],
  priors: (s, actions) => priors[s] ?? actions.map(() => 1 / actions.length),
});
const cfg = (patch: Partial<MctsConfig>): MctsConfig => ({
  maxIterations: 2000,
  timeLimitMs: 0,
  maxNodes: 100_000,
  selection: puct(1.5),
  snapshotTopK: 8,
  maxSnapshots: 64,
  ...patch,
});
const child = <S, A>(n: MctsNode<S, A>, a: A) => n.children.find((c) => c.action === a);

const MINIMAX: Tree = {
  R: { toMove: 0, children: { A: 'A', B: 'B', C: 'C' } },
  A: { toMove: 1, children: { a1: 'A1', a2: 'A2' }, value: 0.5 },
  A1: { toMove: 0, value: 0.9 },
  A2: { toMove: 0, value: -0.8 },
  B: { toMove: 1, children: { b1: 'B1', b2: 'B2' }, value: 0.1 },
  B1: { toMove: 0, value: 0.2 },
  B2: { toMove: 0, value: 0.3 },
  C: { toMove: 1, value: -0.9 },
};

describe('PUCT with priors (B)', () => {
  it('still converges to the minimax choice, even with a misleading prior', () => {
    // The prior strongly prefers A, whose refutation a2 must be found.
    const g = toy(MINIMAX, { R: [0.7, 0.2, 0.1] });
    const r = runMcts(g, 'R', (s) => ({ value: MINIMAX[s].value ?? 0, plies: 0, truncated: false }), createRng(1), cfg({}));
    const best = [...r.root.children].sort((x, y) => y.N - x.N)[0];
    expect(best.action).toBe('B');
    expect(child(r.root, 'A')!.prior).toBeCloseTo(0.7);
  });

  it('expands lazily: a hopeless low-prior move need not be expanded at all', () => {
    const g = toy(MINIMAX, { R: [0.6, 0.39, 0.01] });
    const r = runMcts(g, 'R', (s) => ({ value: MINIMAX[s].value ?? 0, plies: 0, truncated: false }), createRng(1), cfg({ maxIterations: 60 }));
    // UCT would have expanded all three root moves within the first three iterations.
    const u = runMcts(toy(MINIMAX, {}), 'R', (s) => ({ value: MINIMAX[s].value ?? 0, plies: 0, truncated: false }), createRng(1), cfg({ maxIterations: 3, selection: uct(1.4) }));
    expect(u.root.children).toHaveLength(3);
    const c = child(r.root, 'C');
    expect(c === undefined || c.N <= 2).toBe(true);
    expect(r.root.N).toBe(60);
    expect(r.root.children.reduce((s, x) => s + x.N, 0)).toBe(60);
  });
});

// ---------------------------------------------------------------- guided Quoridor tactics

function flip(s: { pawns: [Coord, Coord]; currentPlayer: 0 | 1; wallsRemaining?: [number, number] }) {
  return {
    pawns: [at(8 - s.pawns[1].row, 8 - s.pawns[1].col), at(8 - s.pawns[0].row, 8 - s.pawns[0].col)] as [Coord, Coord],
    currentPlayer: (1 - s.currentPlayer) as 0 | 1,
    wallsRemaining: s.wallsRemaining ? ([s.wallsRemaining[1], s.wallsRemaining[0]] as [number, number]) : undefined,
  };
}
const threat = (s: GameState) => legalPawnMoves(s, s.currentPlayer).some((c) => c.row === (s.currentPlayer === 0 ? 0 : 8));

describe('Guided MCTS tactics (both seats)', () => {
  const guided = (s: GameState, iterations: number) =>
    decideMcts(s, resolveMctsSettings({ variant: 'guided', iterations, timeLimitMs: 0 }), 3);

  for (const seat of ['P1', 'P2'] as const) {
    const pos = (x: { pawns: [Coord, Coord]; currentPlayer: 0 | 1; wallsRemaining?: [number, number] }) => createState(seat === 'P1' ? x : flip(x));
    it(`${seat}: wins immediately, blocks threats and avoids jump traps`, () => {
      for (const n of [50, 500]) {
        const win = pos({ pawns: [at(1, 2), at(7, 6)], currentPlayer: 0 });
        expect(applyAction(win, guided(win, n).candidates[0].action).winner).toBe(win.currentPlayer);
        const block = pos({ pawns: [at(6, 0), at(7, 4)], currentPlayer: 0 });
        expect(threat(applyAction(block, guided(block, n).candidates[0].action))).toBe(false);
        const trap = pos({ pawns: [at(7, 3), at(6, 4)], currentPlayer: 0, wallsRemaining: [0, 10] });
        expect(threat(applyAction(trap, guided(trap, n).candidates[0].action))).toBe(false);
      }
    });
  }

  it('is reproducible, legal and records priors', () => {
    const s = createInitialState();
    const a = guided(s, 400);
    const b = guided(s, 400);
    expect(b.candidates.map((c) => [c.notation, c.visits])).toEqual(a.candidates.map((c) => [c.notation, c.visits]));
    expect(isLegalAction(s, a.candidates[0].action)).toBe(true);
    expect(a.candidates.every((c) => typeof c.prior === 'number')).toBe(true);
    expect(a.candidates.reduce((sum, c) => sum + c.visits, 0)).toBe(a.simulations);
    expect(a.valueRule).toContain('0.9');
  });
});

describe('guided trace text', () => {
  it('names the evaluation cut-off correctly in the rationale', () => {
    const t = decideMcts(createInitialState(), resolveMctsSettings({ variant: 'guided', iterations: 200, timeLimitMs: 0 }), 1);
    const line = t.rationale.find((l) => l.includes('ply 제한'));
    expect(line).toContain('Minimax 평가값');
  });
});
