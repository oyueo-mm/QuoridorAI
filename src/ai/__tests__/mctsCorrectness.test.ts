import { describe, expect, it } from 'vitest';
import { applyAction, createState, legalPawnMoves } from '../../engine';
import type { Coord, GameState } from '../../engine';
import { decideMcts, resolveMctsSettings } from '../mctsAgent';
import { runMcts, uct } from '../mcts/core';
import type { MctsConfig, MctsGame, MctsNode, Player } from '../mcts/core';
import { createRng } from '../rng';

/**
 * Correctness checks for the MCTS implementation beyond the basic core tests:
 * minimax behaviour emerging from averaging, perspective handling for either root player,
 * traps that need a deeper look, exploration extremes, and Quoridor tactics for both seats.
 */

interface ToyNode {
  toMove: Player;
  children?: Record<string, string>;
  winner?: Player;
  value?: number;
}
type Tree = Record<string, ToyNode>;

const game = (tree: Tree): MctsGame<string, string> => ({
  toMove: (s) => tree[s].toMove,
  winner: (s) => tree[s].winner ?? null,
  actions: (s) => Object.keys(tree[s].children ?? {}),
  apply: (s, a) => tree[s].children![a],
});
const leaf = (tree: Tree) => (s: string) => ({ value: tree[s].value ?? 0, plies: 0, truncated: false });
const cfg = (patch: Partial<MctsConfig> = {}): MctsConfig => ({
  maxIterations: 3000,
  timeLimitMs: 0,
  maxNodes: 100_000,
  selection: uct(1.4),
  snapshotTopK: 8,
  maxSnapshots: 64,
  ...patch,
});
const run = (tree: Tree, patch: Partial<MctsConfig> = {}) => runMcts(game(tree), 'R', leaf(tree), createRng(1), cfg(patch));
const child = <S, A>(n: MctsNode<S, A>, a: A) => n.children.find((c) => c.action === a)!;
const mostVisited = <S, A>(n: MctsNode<S, A>) => [...n.children].sort((x, y) => y.N - x.N)[0];

/** Mirror a tree: swap the players and negate every value (player-0 perspective). */
function mirror(tree: Tree): Tree {
  const out: Tree = {};
  for (const [k, n] of Object.entries(tree)) {
    out[k] = {
      toMove: (1 - n.toMove) as Player,
      children: n.children,
      winner: n.winner === undefined ? undefined : ((1 - n.winner) as Player),
      value: n.value === undefined ? undefined : -n.value,
    };
  }
  return out;
}

// Move A has an attractive reply a1 (+0.9) but the opponent can answer a2 (−0.8):
// minimax value of A = −0.8. Move B is solid: replies 0.2 / 0.3 → value 0.2.
const MINIMAX: Tree = {
  R: { toMove: 0, children: { A: 'A', B: 'B' } },
  A: { toMove: 1, children: { a1: 'A1', a2: 'A2' }, value: 0.5 },
  A1: { toMove: 0, value: 0.9 },
  A2: { toMove: 0, value: -0.8 },
  B: { toMove: 1, children: { b1: 'B1', b2: 'B2' }, value: 0.1 },
  B1: { toMove: 0, value: 0.2 },
  B2: { toMove: 0, value: 0.3 },
};

// Trap: T scores well statically but every reply leads to a forced loss two plies later.
const TRAP: Tree = {
  R: { toMove: 0, children: { T: 'T', S: 'S' } },
  T: { toMove: 1, children: { t: 'T1' }, value: 0.9 },
  T1: { toMove: 0, children: { x: 'T2' }, value: 0.9 },
  T2: { toMove: 1, children: { kill: 'K' }, value: 0.9 },
  K: { toMove: 0, winner: 1 },
  S: { toMove: 1, children: { s: 'S1' }, value: 0 },
  S1: { toMove: 0, value: 0 },
};

describe('MCTS behaves like minimax in the limit (toy trees)', () => {
  it('values a move by the opponent’s best reply, not the average reply', () => {
    const r = run(MINIMAX);
    expect(mostVisited(r.root).action).toBe('B');
    const A = child(r.root, 'A');
    // The opponent (player 1) learns to play a2, so A's mean value drifts towards −0.8.
    expect(mostVisited(A).action).toBe('a2');
    expect(A.W / A.N).toBeLessThan(0);
    const B = child(r.root, 'B');
    expect(B.W / B.N).toBeGreaterThan(0.15);
  });

  it('gives the mirrored decision when player 1 is the root player', () => {
    const r = run(mirror(MINIMAX));
    expect(r.root.mover).toBe(0);
    expect(mostVisited(r.root).action).toBe('B');
    expect(mostVisited(child(r.root, 'A')).action).toBe('a2');
    // Q of the root moves is from player 1's (the chooser's) perspective: same numbers.
    const q = (s: string) => child(r.root, s).W / child(r.root, s).N;
    const q0 = (s: string) => child(run(MINIMAX).root, s).W / child(run(MINIMAX).root, s).N;
    expect(q('A')).toBeCloseTo(q0('A'), 9);
    expect(q('B')).toBeCloseTo(q0('B'), 9);
  });

  it('sees through a three-ply trap (solver proves the loss)', () => {
    for (const tree of [TRAP, mirror(TRAP)]) {
      const r = run(tree);
      expect(child(r.root, 'T').proven).toBe('loss');
      expect(mostVisited(r.root).action).toBe('S');
    }
  });

  it('exploration extremes: C = 0 is greedy, a huge C spreads visits evenly', () => {
    const greedy = run(MINIMAX, { selection: uct(0), maxIterations: 200 });
    // Greedy on first impressions: A looked better (0.5 vs 0.1) and keeps being chosen
    // until its value falls below B's — still, the final split is very uneven.
    const nA = child(greedy.root, 'A').N;
    const nB = child(greedy.root, 'B').N;
    expect(Math.abs(nA - nB)).toBeGreaterThan(100);
    const flat = run(MINIMAX, { selection: uct(1000), maxIterations: 200 });
    expect(Math.abs(child(flat.root, 'A').N - child(flat.root, 'B').N)).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------- Quoridor tactics

const at = (row: number, col: number): Coord => ({ row, col });
/** Rotate a position by 180° and swap the players (the same situation for the other seat). */
function flip(setup: { pawns: [Coord, Coord]; walls?: { orientation: 'h' | 'v'; row: number; col: number }[]; wallsRemaining?: [number, number]; currentPlayer: 0 | 1 }) {
  return {
    pawns: [at(8 - setup.pawns[1].row, 8 - setup.pawns[1].col), at(8 - setup.pawns[0].row, 8 - setup.pawns[0].col)] as [Coord, Coord],
    walls: (setup.walls ?? []).map((w) => ({ ...w, row: 7 - w.row, col: 7 - w.col })),
    wallsRemaining: setup.wallsRemaining ? ([setup.wallsRemaining[1], setup.wallsRemaining[0]] as [number, number]) : undefined,
    currentPlayer: (1 - setup.currentPlayer) as 0 | 1,
  };
}

const BUDGETS = [100, 300, 1000];
const decide = (s: GameState, iterations: number, seed = 1) => decideMcts(s, resolveMctsSettings({ iterations, timeLimitMs: 0 }), seed);
const opponentWinsNext = (s: GameState) => {
  const opp = s.currentPlayer;
  return legalPawnMoves(s, opp).some((c) => c.row === (opp === 0 ? 0 : 8));
};

const TACTICS = {
  winInOne: { pawns: [at(1, 2), at(7, 6)] as [Coord, Coord], currentPlayer: 0 as const },
  blockThreat: { pawns: [at(6, 0), at(7, 4)] as [Coord, Coord], currentPlayer: 0 as const },
  jumpTrap: { pawns: [at(7, 3), at(6, 4)] as [Coord, Coord], currentPlayer: 0 as const, wallsRemaining: [0, 10] as [number, number] },
  raceWon: { pawns: [at(2, 0), at(6, 8)] as [Coord, Coord], currentPlayer: 0 as const, wallsRemaining: [10, 0] as [number, number] },
};

describe('Quoridor tactics for both seats and several budgets', () => {
  for (const seat of ['P1', 'P2'] as const) {
    const pos = (s: (typeof TACTICS)[keyof typeof TACTICS]) => createState(seat === 'P1' ? s : flip(s));

    it(`${seat}: takes an immediate win at every budget`, () => {
      for (const n of BUDGETS) {
        const s = pos(TACTICS.winInOne);
        const t = decide(s, n);
        expect(applyAction(s, t.candidates[0].action).winner).toBe(s.currentPlayer);
      }
    });

    it(`${seat}: blocks an immediate winning threat at every budget`, () => {
      for (const n of BUDGETS) {
        const s = pos(TACTICS.blockThreat);
        expect(opponentWinsNext(applyAction(s, decide(s, n).candidates[0].action))).toBe(false);
      }
    });

    it(`${seat}: does not step into a square that lets the opponent jump to victory`, () => {
      for (const n of BUDGETS) {
        const s = pos(TACTICS.jumpTrap);
        expect(opponentWinsNext(applyAction(s, decide(s, n).candidates[0].action))).toBe(false);
      }
    });

    it(`${seat}: runs straight home in a won race`, () => {
      for (const n of BUDGETS) {
        const s = pos(TACTICS.raceWon);
        const next = applyAction(s, decide(s, n).candidates[0].action);
        const goal = s.currentPlayer === 0 ? 0 : 8;
        expect(Math.abs(next.pawns[s.currentPlayer].row - goal)).toBe(1);
      }
    });
  }
});
