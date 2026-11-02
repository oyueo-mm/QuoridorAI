import { BOARD_SIZE, DIRECTIONS, WALL_GRID, canStep, cellIndex, inBounds, sameCoord } from './board';
import { FOUR_PLAYER_RULES, TWO_PLAYER_RULES, createMultiState, validateRules } from './multi';
import type { MultiRules, PlayerSpec, WallSpec } from './multi';
import { hasPathToGoal, onGoal } from './pathfinding';
import { wallConflicts, withWall } from './walls';
import type { Coord, Goal, WallLayout } from './types';

/**
 * Rule sets of the game variants. Every variant is a `MultiRules` value (start cells, goal lines,
 * turn order, optional teams and neutral walls) plus a wall count per seat — the engine itself
 * (movement, jumping, wall placement, path checks, win test) is the one in multi.ts and has no
 * per-variant branches. New variants are new entries here, nothing more.
 *
 * In every variant seats are numbered in turn order (seat i is "P{i+1}"), so a seat is also its
 * slot in the UI (colour, label, wall texture).
 */

export type MultiGameMode = 'four-player' | 'race-2' | 'race-4' | 'three-player' | 'team-2v2' | 'asymmetric' | 'obstacle';

const last = BOARD_SIZE - 1;
const mid = last / 2;
const TOP: Goal = { axis: 'row', index: 0 };
const BOTTOM: Goal = { axis: 'row', index: last };
const LEFT: Goal = { axis: 'col', index: 0 };
const RIGHT: Goal = { axis: 'col', index: last };

/** Pawn on the middle of a side, heading for the opposite side. */
const FROM_BOTTOM: PlayerSpec = { start: { row: last, col: mid }, goal: TOP };
const FROM_TOP: PlayerSpec = { start: { row: 0, col: mid }, goal: BOTTOM };
const FROM_LEFT: PlayerSpec = { start: { row: mid, col: 0 }, goal: RIGHT };
const FROM_RIGHT: PlayerSpec = { start: { row: mid, col: last }, goal: LEFT };

const identityOrder = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * 동방향 2인 경주: both pawns start on the bottom row, left/right of the centre line (d1 and f1),
 * and race to row 9. Both are 8 steps from the goal, so the start is symmetric; the only
 * structural difference is who moves first (selectable).
 */
export const RACE_2_RULES: MultiRules = {
  mode: 'race-2',
  players: [
    { start: { row: last, col: mid - 1 }, goal: TOP },
    { start: { row: last, col: mid + 1 }, goal: TOP },
  ],
  turnOrder: [0, 1],
};

/**
 * 동방향 4인 경주: four pawns on the bottom row at columns 1, 3, 5, 7 (b, d, f, h), all racing to
 * the top row. Every start is 8 steps away. The layout is mirror-symmetric (P1↔P4, P2↔P3), but the
 * two middle starters have more room to the sides, the outer ones lie next to the board edge.
 */
export const RACE_4_RULES: MultiRules = {
  mode: 'race-4',
  players: [1, 3, 5, 7].map((col) => ({ start: { row: last, col }, goal: TOP })),
  turnOrder: [0, 1, 2, 3],
};

/** 3인 개인전: bottom, left and top middle, each heading for the opposite side; play goes bottom → left → top. */
export const THREE_PLAYER_RULES: MultiRules = {
  mode: 'three-player',
  players: [FROM_BOTTOM, FROM_LEFT, FROM_TOP],
  turnOrder: [0, 1, 2],
};

/**
 * 2 vs 2: the official four-player start. Seats alternate bottom(A) → left(B) → top(A) → right(B),
 * so the teams take turns A, B, A, B and each team holds two opposite sides.
 */
export const TEAM_2V2_RULES: MultiRules = {
  mode: 'team-2v2',
  players: [FROM_BOTTOM, FROM_LEFT, FROM_TOP, FROM_RIGHT],
  turnOrder: [0, 1, 2, 3],
  teams: [0, 1, 0, 1],
};

export const TEAM_NAMES: readonly string[] = ['A팀', 'B팀'];

/** Default walls per player of each variant. */
export const VARIANT_WALLS: Record<MultiGameMode, number> = {
  'four-player': 5,
  'race-2': 10,
  'race-4': 5,
  'three-player': 5,
  'team-2v2': 5,
  asymmetric: 10,
  obstacle: 10,
};

/** Wall count default of an obstacle race by player count (the official counts). */
export const OBSTACLE_WALLS: Record<number, number> = { 2: 10, 3: 5, 4: 5 };

/** Seats of a regular start for `count` players: bottom-top (2), bottom-left-top (3), bottom-left-top-right (4). */
function regularLayout(count: number): PlayerSpec[] {
  if (count === 2) return [FROM_BOTTOM, FROM_TOP];
  if (count === 3) return [FROM_BOTTOM, FROM_LEFT, FROM_TOP];
  return [FROM_BOTTOM, FROM_LEFT, FROM_TOP, FROM_RIGHT];
}

// --------------------------------------------------------------- asymmetric

export const MAX_WALLS = 20;

export interface AsymmetricPlayer {
  start: Coord;
  goal: Goal;
  walls: number;
}

/** Players of an asymmetric game in turn order (the first entry is seat 0 = P1). */
export function asymmetricRules(players: readonly AsymmetricPlayer[]): MultiRules {
  return {
    mode: 'asymmetric',
    players: players.map((p) => ({ start: { row: p.start.row, col: p.start.col }, goal: { axis: p.goal.axis, index: p.goal.index } })),
    turnOrder: identityOrder(players.length),
  };
}

export const defaultAsymmetricPlayers = (count = 2): AsymmetricPlayer[] =>
  regularLayout(count).map((p, i) => ({ start: { ...p.start }, goal: { ...p.goal }, walls: i === 0 ? 8 : 10 }));

const sideLabel = (g: Goal) => (g.axis === 'row' ? (g.index === 0 ? '위' : '아래') : g.index === 0 ? '왼쪽' : '오른쪽');

/**
 * Why a custom start is not allowed (Korean messages for the setup form); empty = valid.
 * Policy: an invalid configuration is refused, never silently corrected — duplicate cells, cells
 * off the board, a pawn that already stands on its own goal line (it would have won before the
 * first move) and wall counts outside 0–20 are errors.
 */
export function validateAsymmetric(players: readonly AsymmetricPlayer[]): string[] {
  const errors: string[] = [];
  if (players.length < 2 || players.length > 4) return ['플레이어는 2~4명이어야 합니다.'];
  players.forEach((p, i) => {
    const name = `P${i + 1}`;
    if (!Number.isInteger(p.start.row) || !Number.isInteger(p.start.col) || !inBounds(p.start.row, p.start.col)) {
      errors.push(`${name}의 시작 위치가 보드 밖입니다.`);
      return;
    }
    if (!Number.isInteger(p.walls) || p.walls < 0 || p.walls > MAX_WALLS) errors.push(`${name}의 벽 개수는 0~${MAX_WALLS}개여야 합니다.`);
    if (onGoal(p.start, p.goal)) errors.push(`${name}는 시작 위치가 이미 목표선(${sideLabel(p.goal)})입니다 — 시작하기 전에 이긴 상태가 됩니다.`);
    for (let j = 0; j < i; j++) {
      if (inBounds(players[j].start.row, players[j].start.col) && sameCoord(players[j].start, p.start)) errors.push(`P${j + 1}과 ${name}의 시작 위치가 같습니다.`);
    }
  });
  if (errors.length === 0) {
    try {
      createMultiState({ rules: asymmetricRules(players), wallsPerPlayer: players.map((p) => p.walls) });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return errors;
}

// --------------------------------------------------------------- obstacle race

export type ObstaclePreset = 'easy' | 'normal' | 'hard' | 'random';

export const OBSTACLE_PRESETS: { id: ObstaclePreset; title: string; description: string }[] = [
  { id: 'easy', title: '쉬움', description: '벽 4~6개, 우회가 거의 필요 없습니다.' },
  { id: 'normal', title: '보통', description: '벽 8~10개, 몇 걸음씩 돌아가야 합니다.' },
  { id: 'hard', title: '어려움', description: '벽 12~16개, 길이 꺾이고 좁아집니다.' },
  { id: 'random', title: '무작위', description: '시드로 개수와 난이도를 정하는 유효한 맵.' },
];

/** What a generated map is worth — for the difficulty rating shown in the UI and the tests. */
export interface ObstacleMetrics {
  /** Steps each seat needs to reach its goal on the generated map. */
  distances: number[];
  /** Steps each seat needs on the empty board. */
  baseDistances: number[];
  /** Extra steps over the empty board, averaged over the seats (the detour). */
  meanDetour: number;
  /** Longest minus shortest distance: a rough measure of how even the map is. */
  spread: number;
  /** Number of distinct shortest routes of each seat (fewer = fewer alternatives). */
  shortestRoutes: number[];
  walls: number;
}

export interface ObstacleMap {
  walls: WallSpec[];
  metrics: ObstacleMetrics;
  /** The result lies in the preset's target band (otherwise: the closest candidate found). */
  inBand: boolean;
}

interface PresetBand {
  minWalls: number;
  maxWalls: number;
  minDetour: number;
  maxDetour: number;
  maxSpread: number;
}

const BANDS: Record<Exclude<ObstaclePreset, 'random'>, PresetBand> = {
  easy: { minWalls: 4, maxWalls: 6, minDetour: 1, maxDetour: 3, maxSpread: 2 },
  normal: { minWalls: 8, maxWalls: 10, minDetour: 3, maxDetour: 6, maxSpread: 3 },
  hard: { minWalls: 12, maxWalls: 16, minDetour: 6, maxDetour: 14, maxSpread: 4 },
};

/** Small seedable PRNG (mulberry32); the engine stays independent of the AI folder. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMPTY: WallLayout = { hWalls: new Uint8Array(WALL_GRID * WALL_GRID), vWalls: new Uint8Array(WALL_GRID * WALL_GRID) };

/** Distance (steps) of every cell to `goal`, -1 where unreachable. Pawns are ignored like everywhere. */
function goalDistances(walls: WallLayout, goal: Goal): Int16Array {
  const dist = new Int16Array(BOARD_SIZE * BOARD_SIZE).fill(-1);
  const queue: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (onGoal({ row: r, col: c }, goal)) {
        dist[cellIndex(r, c)] = 0;
        queue.push(cellIndex(r, c));
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    for (const d of DIRECTIONS) {
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = cellIndex(row + d.row, col + d.col);
      if (dist[next] !== -1) continue;
      dist[next] = dist[idx] + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** Number of distinct shortest routes from `start` to `goal` (0 if none). */
export function countShortestRoutes(walls: WallLayout, start: Coord, goal: Goal): number {
  const dist = goalDistances(walls, goal);
  const startIdx = cellIndex(start.row, start.col);
  if (dist[startIdx] < 0) return 0;
  const memo = new Map<number, number>();
  const count = (idx: number): number => {
    if (dist[idx] === 0) return 1;
    const known = memo.get(idx);
    if (known !== undefined) return known;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    let total = 0;
    for (const d of DIRECTIONS) {
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = cellIndex(row + d.row, col + d.col);
      if (dist[next] === dist[idx] - 1) total += count(next);
    }
    memo.set(idx, total);
    return total;
  };
  return count(startIdx);
}

export function obstacleMetrics(rules: MultiRules, walls: readonly WallSpec[]): ObstacleMetrics {
  let layout: WallLayout = EMPTY;
  for (const w of walls) layout = withWall(layout, w.orientation, w.row, w.col);
  const dist = (layoutOf: WallLayout, p: PlayerSpec) => goalDistances(layoutOf, p.goal)[cellIndex(p.start.row, p.start.col)];
  const baseDistances = rules.players.map((p) => dist(EMPTY, p));
  const distances = rules.players.map((p) => dist(layout, p));
  const detours = distances.map((d, i) => d - baseDistances[i]);
  return {
    distances,
    baseDistances,
    meanDetour: detours.reduce((a, b) => a + b, 0) / detours.length,
    spread: Math.max(...distances) - Math.min(...distances),
    shortestRoutes: rules.players.map((p) => countShortestRoutes(layout, p.start, p.goal)),
    walls: walls.length,
  };
}

function inBand(m: ObstacleMetrics, band: PresetBand): boolean {
  return m.walls >= band.minWalls && m.walls <= band.maxWalls && m.meanDetour >= band.minDetour && m.meanDetour <= band.maxDetour && m.spread <= band.maxSpread;
}

/** How far a map is from a band (0 = inside); used to pick the best candidate when none fits. */
function bandDistance(m: ObstacleMetrics, band: PresetBand): number {
  const out = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  return out(m.meanDetour, band.minDetour, band.maxDetour) + 0.5 * Math.max(0, m.spread - band.maxSpread);
}

const ATTEMPTS = 60;

const ANCHORS: WallSpec[] = (['h', 'v'] as const).flatMap((orientation) =>
  Array.from({ length: WALL_GRID * WALL_GRID }, (_, i): WallSpec => ({ orientation, row: Math.floor(i / WALL_GRID), col: i % WALL_GRID })),
);

/** One attempt: add walls one by one, each time taking the sampled candidate that keeps the detour on schedule. */
function growMap(rules: MultiRules, count: number, targetDetour: number, maxSpread: number, rng: () => number): WallSpec[] {
  const walls: WallSpec[] = [];
  let layout: WallLayout = EMPTY;
  const base = rules.players.map((p) => goalDistances(EMPTY, p.goal)[cellIndex(p.start.row, p.start.col)]);
  for (let k = 1; k <= count; k++) {
    const wanted = (targetDetour * k) / count;
    let best: { wall: WallSpec; layout: WallLayout; score: number } | null = null;
    for (let tries = 0, seen = 0; tries < 80 && seen < 10; tries++) {
      const wall = ANCHORS[Math.floor(rng() * ANCHORS.length)];
      if (wallConflicts(layout, wall.orientation, wall.row, wall.col)) continue;
      const next = withWall(layout, wall.orientation, wall.row, wall.col);
      if (!rules.players.every((p) => hasPathToGoal(next, p.start, p.goal))) continue;
      seen++;
      const goals = rules.players.map((p) => goalDistances(next, p.goal)[cellIndex(p.start.row, p.start.col)]);
      const detour = goals.reduce((sum, d, i) => sum + d - base[i], 0) / goals.length;
      const spread = Math.max(...goals) - Math.min(...goals);
      const score = Math.abs(detour - wanted) + 1.5 * Math.max(0, spread - maxSpread);
      if (best === null || score < best.score) best = { wall, layout: next, score };
    }
    if (best === null) break;
    walls.push(best.wall);
    layout = best.layout;
  }
  return walls;
}

/** The regular start of an obstacle race for `players` players (2: bottom/top, 3: bottom/left/top, 4: all sides). */
export function obstacleBaseRules(players: number): MultiRules {
  return { mode: 'obstacle', players: regularLayout(players), turnOrder: identityOrder(players) };
}

/**
 * Neutral walls for an obstacle race: deterministic for (players, preset, seed). Each preset has a
 * target band for the number of walls, the mean detour (extra steps over the empty board) and the
 * spread between the players' distances (so no seat starts far behind); the generator tries up to
 * 60 seeded attempts for a map inside the band and otherwise returns the closest one. Every map
 * keeps a route to the goal for every seat — wall by wall, with the engine's own path check.
 */
export function generateObstacles(players: number, preset: ObstaclePreset, seed: number): ObstacleMap {
  const rules = obstacleBaseRules(players);
  const rng = makeRng(seed);
  let band: PresetBand;
  if (preset === 'random') {
    // The seed picks the size and the severity; the map must still be even enough to play.
    const walls = 5 + Math.floor(rng() * 10);
    const detour = 1 + rng() * 7;
    band = { minWalls: walls, maxWalls: walls, minDetour: Math.max(0, detour - 1.5), maxDetour: detour + 1.5, maxSpread: 4 };
  } else {
    band = BANDS[preset];
  }
  // Seats on different sides see different walls, so with more players an even map is harder to find.
  if (players > 2) band = { ...band, maxSpread: band.maxSpread + 2 };
  let best: { walls: WallSpec[]; metrics: ObstacleMetrics; dist: number } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const count = band.minWalls + Math.floor(rng() * (band.maxWalls - band.minWalls + 1));
    const target = band.minDetour + (band.maxDetour - band.minDetour) * (0.3 + 0.4 * rng());
    const walls = growMap(rules, count, target, band.maxSpread, rng);
    const metrics = obstacleMetrics(rules, walls);
    const dist = bandDistance(metrics, band) + (walls.length < band.minWalls ? 10 : 0);
    if (best === null || dist < best.dist) best = { walls, metrics, dist };
    if (inBand(metrics, band)) return { walls, metrics, inBand: true };
  }
  return { walls: best!.walls, metrics: best!.metrics, inBand: false };
}

/** Rules of an obstacle race with the map generated from (players, preset, seed). */
export function obstacleRules(players: number, preset: ObstaclePreset, seed: number): MultiRules {
  const map = generateObstacles(players, preset, seed);
  return { ...obstacleBaseRules(players), neutralWalls: map.walls, seed, preset };
}

/** Plain-language rating of a map from its metrics (used next to the preset in the UI). */
export function describeObstacleMap(m: ObstacleMetrics): string {
  const routes = Math.round(m.shortestRoutes.reduce((a, b) => a + b, 0) / m.shortestRoutes.length);
  return `벽 ${m.walls}개 · 평균 우회 +${m.meanDetour.toFixed(1)}칸 · 최단 경로 ${routes}가지 · 거리 차 ${m.spread}`;
}

// --------------------------------------------------------------- AI policy

/**
 * Whether the existing AIs (Random, BFS, Minimax, MCTS, AlphaZero-style trainer) may play these
 * rules: only the regular two-player game (a rule set that names a variant mode never qualifies, even if its
 * start cells happen to match — wall counts and goals are not theirs to assume). They assume the standard start, both goals on opposite
 * rows, no teams and no preset walls, so every other rule set is refused rather than guessed.
 */
export function supportsTwoPlayerAi(rules: MultiRules): boolean {
  return (
    rules.mode === undefined &&
    rules.players.length === 2 &&
    !rules.teams &&
    (rules.neutralWalls?.length ?? 0) === 0 &&
    rules.turnOrder.every((s, i) => s === TWO_PLAYER_RULES.turnOrder[i]) &&
    rules.players.every(
      (p, i) =>
        sameCoord(p.start, TWO_PLAYER_RULES.players[i].start) &&
        p.goal.axis === TWO_PLAYER_RULES.players[i].goal.axis &&
        p.goal.index === TWO_PLAYER_RULES.players[i].goal.index,
    )
  );
}

// --------------------------------------------------------------- validation of a ruleset by mode

/** Rule set a mode must have; used to reject records whose mode label does not match their rules. */
export function checkModeConsistency(mode: MultiGameMode, rules: MultiRules): string | null {
  const n = rules.players.length;
  const hasTeams = !!rules.teams;
  const hasObstacles = (rules.neutralWalls?.length ?? 0) > 0;
  switch (mode) {
    case 'four-player':
      return n === 4 && !hasTeams && !hasObstacles ? null : '4인전은 4명, 팀 없음, 중립 벽 없음이어야 합니다.';
    case 'race-2':
      return n === 2 && !hasTeams && !hasObstacles && rules.players.every((p) => sameGoal(p.goal, rules.players[0].goal)) ? null : '동방향 2인 경주는 2명이 같은 목표선을 공유해야 합니다.';
    case 'race-4':
      return n === 4 && !hasTeams && !hasObstacles && rules.players.every((p) => sameGoal(p.goal, rules.players[0].goal)) ? null : '동방향 4인 경주는 4명이 같은 목표선을 공유해야 합니다.';
    case 'three-player':
      return n === 3 && !hasTeams && !hasObstacles ? null : '3인 개인전은 3명, 팀 없음, 중립 벽 없음이어야 합니다.';
    case 'team-2v2':
      return n === 4 && hasTeams && rules.teams!.filter((t) => t === 0).length === 2 && !hasObstacles ? null : '2 vs 2 팀전은 4명이 2명씩 두 팀이어야 합니다.';
    case 'obstacle':
      return !hasTeams && hasObstacles ? null : '장애물 경주는 중립 벽이 있고 팀이 없어야 합니다.';
    case 'asymmetric':
      return !hasTeams && !hasObstacles ? null : '비대칭 대전은 팀과 중립 벽이 없어야 합니다.';
  }
}

const sameGoal = (a: Goal, b: Goal) => a.axis === b.axis && a.index === b.index;

export const MULTI_MODES: readonly MultiGameMode[] = ['four-player', 'race-2', 'race-4', 'three-player', 'team-2v2', 'asymmetric', 'obstacle'];

/** Rule set of a fixed-layout mode (asymmetric and obstacle depend on the setup, see MultiController). */
export function fixedRules(mode: MultiGameMode): MultiRules | null {
  switch (mode) {
    case 'four-player':
      return FOUR_PLAYER_RULES;
    case 'race-2':
      return RACE_2_RULES;
    case 'race-4':
      return RACE_4_RULES;
    case 'three-player':
      return THREE_PLAYER_RULES;
    case 'team-2v2':
      return TEAM_2V2_RULES;
    default:
      return null;
  }
}

/** Throws unless every fixed rule set is itself valid (guard for edits to the constants above). */
export function assertVariantRulesValid(): void {
  for (const mode of MULTI_MODES) {
    const rules = fixedRules(mode);
    if (rules) validateRules(rules);
  }
}
