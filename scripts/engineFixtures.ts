/**
 * Cross-language fixtures: the TypeScript engine is the reference. Every case records a
 * position and what the engine computes for it; training/quoridor_az tests replay the same
 * positions in Python and must reproduce every number.
 *
 * File: training/fixtures/engine_fixtures.json (regenerate with `npm run fixtures:engine`).
 */
import { createRng } from '../src/ai/rng';
import {
  ACTION_SPACE_SIZE,
  WALL_GRID,
  applyAction,
  canonicalActionIndex,
  checkWallPlacement,
  createInitialState,
  createState,
  decodeAction,
  distanceToRow,
  encodeAction,
  encodeStatePlanes,
  formatAction,
  goalRow,
  legalActions,
  legalPawnMoves,
  shortestPath,
} from '../src/engine';
import type { Action, GameState, StateSetup, WallPlacementResult } from '../src/engine';

export const FIXTURE_VERSION = 1;

export interface SerializedState {
  pawns: [[number, number], [number, number]];
  /** Indices (row·8 + col) of horizontal / vertical walls. */
  h: number[];
  v: number[];
  walls: [number, number];
  player: 0 | 1;
  winner: 0 | 1 | null;
  ply: number;
}

export interface FixtureCase {
  name: string;
  state: SerializedState;
  /** Encoded legal actions in engine order (pawn moves first, then h walls, then v walls). */
  legal: number[];
  /** One char per wall slot (64 h, then 64 v): o ok, g game-over, n no-walls-left, x overlap, b blocks-path. */
  wall_checks: string;
  /** BFS distance of each player to its goal row (null = unreachable). */
  distances: [number | null, number | null];
  /** Length (cells) of the BFS shortest path returned for the player to move. */
  path_length: number | null;
  transitions: { action: number; notation: string; next: SerializedState }[];
  /** Legal actions in the canonical (player-to-move) view, sorted. */
  canonical_legal: number[];
  /** Feature planes (11 × 81), rounded to 6 decimals; present for every 3rd case. */
  planes?: number[];
}

export interface FixtureFile {
  version: number;
  generator: string;
  action_space_size: number;
  /** decodeAction(i) for every index: [type, row, col, orientation|null] and its notation. */
  actions: { index: number; type: 'move' | 'wall'; row: number; col: number; orientation: 'h' | 'v' | null; notation: string }[];
  cases: FixtureCase[];
}

const CHECK_CODE: Record<WallPlacementResult, string> = {
  ok: 'o',
  'game-over': 'g',
  'no-walls-left': 'n',
  'out-of-bounds': '?',
  overlap: 'x',
  'blocks-path': 'b',
};

export function serialize(s: GameState): SerializedState {
  const idx = (arr: Uint8Array) => [...arr.keys()].filter((i) => arr[i] === 1);
  return {
    pawns: [
      [s.pawns[0].row, s.pawns[0].col],
      [s.pawns[1].row, s.pawns[1].col],
    ],
    h: idx(s.hWalls),
    v: idx(s.vWalls),
    walls: [s.wallsRemaining[0], s.wallsRemaining[1]],
    player: s.currentPlayer,
    winner: s.winner,
    ply: s.ply,
  };
}

const finite = (d: number) => (Number.isFinite(d) ? d : null);
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function describe(name: string, s: GameState, withPlanes: boolean): FixtureCase {
  const legal = legalActions(s).map(encodeAction);
  let checks = '';
  for (const orientation of ['h', 'v'] as const) {
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) checks += CHECK_CODE[checkWallPlacement(s, { type: 'wall', orientation, row, col })];
    }
  }
  // Deterministic sample of transitions: first pawn move, a middle action and the last action.
  const picks = [...new Set([0, Math.floor(legal.length / 2), legal.length - 1])].filter((i) => i >= 0 && i < legal.length);
  const transitions = picks.map((i) => {
    const action = decodeAction(legal[i]);
    return { action: legal[i], notation: formatAction(action), next: serialize(applyAction(s, action)) };
  });
  const path = s.winner === null ? shortestPath(s, s.pawns[s.currentPlayer], goalRow(s.currentPlayer)) : null;
  const c: FixtureCase = {
    name,
    state: serialize(s),
    legal,
    wall_checks: checks,
    distances: [finite(distanceToRow(s, s.pawns[0], goalRow(0))), finite(distanceToRow(s, s.pawns[1], goalRow(1)))],
    path_length: path ? path.length : null,
    transitions,
    canonical_legal: legal.map((a) => canonicalActionIndex(a, s.currentPlayer)).sort((a, b) => a - b),
  };
  if (withPlanes) c.planes = [...encodeStatePlanes(s)].map(round6);
  return c;
}

const at = (row: number, col: number) => ({ row, col });
const h = (row: number, col: number) => ({ orientation: 'h' as const, row, col });
const v = (row: number, col: number) => ({ orientation: 'v' as const, row, col });

/** Hand-picked rule edge cases (mirrors the engine unit tests). */
const EDGE_CASES: [string, StateSetup][] = [
  ['initial', {}],
  ['corners', { pawns: [at(8, 0), at(0, 8)] }],
  ['edges', { pawns: [at(4, 0), at(4, 8)] }],
  ['wall-in-front', { walls: [h(7, 4)] }],
  ['wall-half-cover', { walls: [h(7, 3)] }],
  ['vertical-wall-between', { pawns: [at(4, 4), at(4, 5)], walls: [v(3, 4)] }],
  ['jump-straight', { pawns: [at(4, 4), at(3, 4)] }],
  ['jump-horizontal', { pawns: [at(4, 4), at(4, 5)] }],
  ['jump-blocked-by-wall-diagonals', { pawns: [at(4, 4), at(3, 4)], walls: [h(2, 4)] }],
  ['jump-blocked-by-edge-diagonals', { pawns: [at(1, 4), at(0, 4)], currentPlayer: 0 }],
  ['diagonal-walled-off', { pawns: [at(4, 4), at(3, 4)], walls: [h(2, 4), v(3, 4)] }],
  ['horizontal-jump-blocked', { pawns: [at(4, 0), at(4, 1)], walls: [v(3, 1)] }],
  ['diagonal-off-board', { pawns: [at(5, 0), at(4, 0)], walls: [h(3, 0)] }],
  ['wall-between-pawns', { pawns: [at(4, 4), at(3, 4)], walls: [h(3, 4)] }],
  ['wall-overlap-and-cross', { walls: [h(3, 3)] }],
  ['wall-vertical-stack', { walls: [v(3, 3)] }],
  ['seal-both-players', { walls: [h(3, 0), h(3, 2), h(3, 4), h(3, 6), v(2, 7)] }],
  ['seal-one-player', { pawns: [at(8, 4), at(0, 0)], walls: [h(0, 0)], currentPlayer: 0 }],
  ['no-walls-left', { wallsRemaining: [0, 3] }],
  ['player2-to-move', { pawns: [at(6, 3), at(2, 5)], walls: [h(4, 2), v(1, 6)], wallsRemaining: [6, 7], currentPlayer: 1 }],
  ['player2-jump-edge', { pawns: [at(8, 0), at(7, 0)], currentPlayer: 1 }],
  ['player2-near-goal', { pawns: [at(3, 3), at(7, 6)], currentPlayer: 1 }],
  ['won-by-player1', { pawns: [at(0, 4), at(5, 5)], currentPlayer: 0 }],
  ['won-by-player2', { pawns: [at(3, 3), at(8, 6)], currentPlayer: 1 }],
  ['maze', { pawns: [at(8, 0), at(0, 0)], walls: [h(4, 0), h(4, 2), h(4, 4), h(4, 6), v(3, 7)] }],
];

export function buildFixtures(): FixtureFile {
  const cases: FixtureCase[] = [];
  let n = 0;
  for (const [name, setup] of EDGE_CASES) cases.push(describe(name, createState(setup), n++ % 3 === 0));

  // Random positions from seeded playouts (half the moves are pawn moves so pawns travel).
  for (let game = 0; game < 12; game++) {
    const rand = createRng(1000 + game);
    let s = createInitialState();
    for (let ply = 0; ply < 60 && s.winner === null; ply++) {
      if (ply % 3 === 0 || ply > 40) cases.push(describe(`random-g${game}-p${ply}`, s, n++ % 3 === 0));
      const actions: Action[] = legalActions(s);
      const moves = legalPawnMoves(s).map((to): Action => ({ type: 'move', to }));
      const pool = rand() < 0.5 ? moves : actions;
      s = applyAction(s, pool[Math.floor(rand() * pool.length)]);
    }
    cases.push(describe(`random-g${game}-final`, s, n++ % 3 === 0));
  }

  const actions = Array.from({ length: ACTION_SPACE_SIZE }, (_, index) => {
    const a = decodeAction(index);
    return a.type === 'move'
      ? { index, type: 'move' as const, row: a.to.row, col: a.to.col, orientation: null, notation: formatAction(a) }
      : { index, type: 'wall' as const, row: a.row, col: a.col, orientation: a.orientation, notation: formatAction(a) };
  });
  return { version: FIXTURE_VERSION, generator: 'scripts/engineFixtures.ts', action_space_size: ACTION_SPACE_SIZE, actions, cases };
}
