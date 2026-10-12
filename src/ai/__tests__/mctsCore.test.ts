import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { runMcts, selectChild, uct } from '../mcts/core';
import type { MctsConfig, MctsGame, MctsNode, Player } from '../mcts/core';

/**
 * A tiny explicit game tree: every node says who is to move, its children and either a
 * winner (terminal) or a fixed leaf value (player-0 perspective) used instead of a rollout.
 */
interface ToyNode {
  toMove: Player;
  children?: Record<string, string>;
  winner?: Player;
  value?: number;
}
type Tree = Record<string, ToyNode>;

function toyGame(tree: Tree, priors?: number[]): MctsGame<string, string> {
  return {
    toMove: (s) => tree[s].toMove,
    winner: (s) => tree[s].winner ?? null,
    actions: (s) => Object.keys(tree[s].children ?? {}),
    apply: (s, a) => tree[s].children![a],
    priors: priors ? () => priors : undefined,
  };
}

const evaluate = (tree: Tree) => (s: string) => ({ value: tree[s].value ?? 0, plies: 0, truncated: false });

const config = (patch: Partial<MctsConfig> = {}): MctsConfig => ({
  maxIterations: 10,
  timeLimitMs: 0,
  maxNodes: 1000,
  selection: uct(1),
  snapshotTopK: 8,
  maxSnapshots: 64,
  ...patch,
});

const run = (tree: Tree, patch: Partial<MctsConfig> = {}, game = toyGame(tree)) =>
  runMcts(game, 'R', evaluate(tree), createRng(1), config(patch));

const child = (n: MctsNode<string, string>, action: string) => n.children.find((c) => c.action === action)!;

// Root (player 0) with three leaf replies of known value.
const FLAT: Tree = {
  R: { toMove: 0, children: { a: 'A', b: 'B', c: 'C' } },
  A: { toMove: 1, value: 0.5 },
  B: { toMove: 1, value: -0.5 },
  C: { toMove: 1, value: 0.2 },
};

describe('MCTS core on a toy tree', () => {
  it('expands untried actions in order before selecting', () => {
    const r = run(FLAT, { maxIterations: 3 });
    expect(r.root.children.map((c) => c.action)).toEqual(['a', 'b', 'c']);
    expect(r.root.children.map((c) => c.N)).toEqual([1, 1, 1]);
    expect(r.root.N).toBe(3);
  });

  it('backpropagates values from each mover’s perspective', () => {
    const r = run(FLAT, { maxIterations: 3 });
    // Root children were chosen by player 0: W = player-0 value.
    expect(child(r.root, 'a').W).toBeCloseTo(0.5);
    expect(child(r.root, 'b').W).toBeCloseTo(-0.5);
    // The root's mover is player 1 (the side that "moved into" the root): W = −Σ values.
    expect(r.root.mover).toBe(1);
    expect(r.root.W).toBeCloseTo(-(0.5 - 0.5 + 0.2));

    const deep: Tree = {
      R: { toMove: 0, children: { a: 'A', b: 'B' } },
      A: { toMove: 1, children: { x: 'X' }, value: 0 },
      B: { toMove: 1, value: -1 },
      X: { toMove: 0, value: 1 },
    };
    // Iterations: expand a (0), expand b (−1), select a (higher Q) and expand x (+1).
    const d = runMcts(toyGame(deep), 'R', evaluate(deep), createRng(1), config({ maxIterations: 3 }));
    const A = child(d.root, 'a');
    const X = child(A, 'x');
    expect(X.mover).toBe(1);
    expect(X.W).toBe(-1); // good for player 0 = bad for player 1, who chose x
    expect(A.W).toBe(1); // 0 (first visit) + 1
    expect(A.N).toBe(2);
    expect(d.root.N).toBe(3);
    expect(d.root.W).toBeCloseTo(-(0 - 1 + 1));
  });

  it('does not search when only one move exists', () => {
    const single: Tree = { R: { toMove: 0, children: { only: 'O' } }, O: { toMove: 1, value: 0 } };
    const r = run(single, { maxIterations: 100 });
    expect(r.stopReason).toBe('single-move');
    expect(r.iterations).toBe(1);
  });

  it('selects the child with the highest UCT score at each step', () => {
    for (let k = 3; k < 30; k++) {
      const before = run(FLAT, { maxIterations: k });
      const rule = uct(1);
      const scores = before.root.children.map((c) => rule.score(c as MctsNode<unknown, unknown>, before.root.N));
      const expected = before.root.children[scores.indexOf(Math.max(...scores))].action;
      expect(selectChild(before.root, rule).action).toBe(expected);
      const after = run(FLAT, { maxIterations: k + 1 });
      const grew = after.root.children.filter((c, i) => c.N === before.root.children[i].N + 1).map((c) => c.action);
      expect(grew).toEqual([expected]);
    }
  });

  it('accumulates visits: root N = iterations = Σ child N', () => {
    const r = run(FLAT, { maxIterations: 57 });
    expect(r.iterations).toBe(57);
    expect(r.root.N).toBe(57);
    expect(r.root.children.reduce((s, c) => s + c.N, 0)).toBe(57);
    // The best leaf ends up with the most visits.
    expect([...r.root.children].sort((x, y) => y.N - x.N)[0].action).toBe('a');
  });

  it('stops immediately on a winning move (MCTS-Solver)', () => {
    const tree: Tree = {
      R: { toMove: 0, children: { w: 'W', n: 'N' } },
      W: { toMove: 1, winner: 0 },
      N: { toMove: 1, value: 0.9 },
    };
    const r = run(tree, { maxIterations: 100 });
    expect(r.stopReason).toBe('proven-win');
    expect(r.iterations).toBe(1);
    expect(child(r.root, 'w').proven).toBe('win');
  });

  it('proves a move lost when the opponent has a winning reply, and avoids it', () => {
    const tree: Tree = {
      R: { toMove: 0, children: { bad: 'B', good: 'G' } },
      B: { toMove: 1, children: { k: 'K' }, value: 0.9 }, // looks great until k is found
      K: { toMove: 0, winner: 1 },
      G: { toMove: 1, value: 0.1 },
    };
    const r = run(tree, { maxIterations: 50 });
    const bad = child(r.root, 'bad');
    expect(bad.proven).toBe('loss');
    expect(child(bad, 'k').proven).toBe('win');
    // After the proof every remaining simulation goes to the good move.
    expect(child(r.root, 'good').N).toBeGreaterThan(40);
    expect(r.root.proven).toBeNull();
  });

  it('proves a win when every opponent reply loses', () => {
    const tree: Tree = {
      R: { toMove: 0, children: { m: 'M', n: 'N' } },
      M: { toMove: 1, children: { r1: 'T1', r2: 'T2' } },
      T1: { toMove: 0, winner: 0 },
      T2: { toMove: 0, winner: 0 },
      N: { toMove: 1, value: 0.5 },
    };
    const r = run(tree, { maxIterations: 100 });
    const m = child(r.root, 'm');
    expect(m.children.every((c) => c.proven === 'loss')).toBe(true);
    expect(m.proven).toBe('win');
    expect(r.stopReason).toBe('proven-win');
  });

  it('respects the node cap, priors, snapshot budget, time limit and abort', () => {
    expect(run(FLAT, { maxIterations: 20, maxNodes: 2 }).nodes).toBe(2);

    const withPriors = runMcts(toyGame(FLAT, [0.7, 0.2, 0.1]), 'R', evaluate(FLAT), createRng(1), config({ maxIterations: 3 }));
    expect(withPriors.root.children.map((c) => c.prior)).toEqual([0.7, 0.2, 0.1]);

    const snaps = run(FLAT, { maxIterations: 200, maxSnapshots: 4 }).snapshots;
    expect(snaps.length).toBeLessThanOrEqual(5);
    expect(snaps.at(-1)!.iterations).toBe(200);
    for (let i = 1; i < snaps.length; i++) expect(snaps[i].iterations).toBeGreaterThan(snaps[i - 1].iterations);

    let t = 0;
    const timed = runMcts(toyGame(FLAT), 'R', evaluate(FLAT), createRng(1), config({ maxIterations: 1e6, timeLimitMs: 25 }), {
      clock: () => (t += 10),
    });
    expect(timed.stopReason).toBe('time');
    expect(timed.iterations).toBeGreaterThan(0);
    expect(timed.iterations).toBeLessThan(5);

    const ac = new AbortController();
    ac.abort();
    expect(() => runMcts(toyGame(FLAT), 'R', evaluate(FLAT), createRng(1), config(), { signal: ac.signal })).toThrow(/abort/i);
  });
});
