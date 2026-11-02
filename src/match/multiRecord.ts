import {
  MAX_WALLS,
  MULTI_MODES,
  OBSTACLE_WALLS,
  OFFICIAL_WALLS,
  VARIANT_WALLS,
  applyActionMulti,
  checkModeConsistency,
  createMultiState,
  formatAction,
  legalActionsMulti,
  validateRules,
} from '../engine';
import type { Action, Goal, MultiGameMode, MultiRules, MultiState, WallSpec } from '../engine';
import { GAME_RECORD_FORMAT } from './gameRecord';

/*
 * Records of games with more than two players. Version 1 — the two-player record in
 * gameRecord.ts — is unchanged and still read by parseRecord. A multi-player file carries
 * everything needed to replay the game without assumptions: mode, the start cell and goal line
 * of every seat, the turn order, walls per player, who moved first, the participants' names and
 * the moves (notation is the project's own, see formatAction; the player of each move is stored
 * and cross-checked on import).
 *
 * Version 2 is the official four-player game. Version 3 adds what the variants need — teams, the
 * neutral walls of an obstacle race (explicit cells, so a replay never depends on the generator),
 * the seed and preset they came from — and is written for every mode but the official four-player
 * game, which stays version 2 so that older readers keep working. Both are read by parseMultiRecord.
 */

export const MULTI_RECORD_VERSION = 2;
export const VARIANT_RECORD_VERSION = 3;

export type { MultiGameMode } from '../engine';

export interface MultiRecordFile {
  format: typeof GAME_RECORD_FORMAT;
  version: typeof MULTI_RECORD_VERSION | typeof VARIANT_RECORD_VERSION;
  createdAt: string;
  source: string;
  mode: MultiGameMode;
  /** Start cells and goal lines by seat, and the turn order (version 3: teams and neutral walls too). */
  rules: {
    players: { seat: number; start: [number, number]; goal: Goal }[];
    turnOrder: number[];
    /** Version 3 only: team of every seat. */
    teams?: number[];
    /** Version 3 only: walls on the board before the first move, owned by nobody. */
    neutralWalls?: { orientation: 'h' | 'v'; row: number; col: number }[];
    /** Version 3 only: where the neutral walls came from (informational). */
    seed?: number;
    preset?: string;
  };
  wallsPerPlayer: number[];
  firstPlayer: number;
  /** Who sits where: `slot` is the position in the turn order (P1…Pn as shown). */
  participants: { seat: number; slot: number; name: string }[];
  moves: { ply: number; player: number; notation: string }[];
  /** Selected position (number of moves played). */
  ply: number;
  result: { kind: 'playing' } | { kind: 'win'; winner: number };
  /** Position after the last move, for an integrity check on import. */
  final: { pawns: [number, number][]; wallsRemaining: number[]; currentPlayer: number; winner: number | null };
}

export interface RecordedMultiAction {
  action: Action;
  player: number;
}

export interface MultiGameSetup {
  rules: MultiRules;
  wallsPerPlayer: readonly number[];
  firstPlayer: number;
}

export function initialMultiState(setup: MultiGameSetup): MultiState {
  return createMultiState({ rules: setup.rules, wallsPerPlayer: setup.wallsPerPlayer, firstPlayer: setup.firstPlayer });
}

/** Positions along a record: positions[i] = after i moves. Throws if a move is illegal. */
export function replayMulti(setup: MultiGameSetup, actions: readonly RecordedMultiAction[]): MultiState[] {
  const positions = [initialMultiState(setup)];
  for (const { action } of actions) positions.push(applyActionMulti(positions[positions.length - 1], action));
  return positions;
}

export function buildMultiRecord(
  setup: MultiGameSetup,
  actions: readonly RecordedMultiAction[],
  info: { source?: string; mode?: MultiGameMode; names: readonly string[]; ply?: number },
): MultiRecordFile {
  const positions = replayMulti(setup, actions);
  const last = positions[positions.length - 1];
  const { rules } = setup;
  const mode = info.mode ?? 'four-player';
  const variant = mode !== 'four-player';
  return {
    format: GAME_RECORD_FORMAT,
    version: variant ? VARIANT_RECORD_VERSION : MULTI_RECORD_VERSION,
    createdAt: new Date().toISOString(),
    source: info.source ?? 'play',
    mode,
    rules: {
      players: rules.players.map((p, seat) => ({ seat, start: [p.start.row, p.start.col], goal: { ...p.goal } })),
      turnOrder: [...rules.turnOrder],
      ...(variant && rules.teams ? { teams: [...rules.teams] } : {}),
      ...(variant && rules.neutralWalls?.length ? { neutralWalls: rules.neutralWalls.map((w) => ({ ...w })) } : {}),
      ...(variant && rules.seed !== undefined ? { seed: rules.seed } : {}),
      ...(variant && rules.preset !== undefined ? { preset: rules.preset } : {}),
    },
    wallsPerPlayer: [...setup.wallsPerPlayer],
    firstPlayer: setup.firstPlayer,
    participants: rules.turnOrder.map((seat, slot) => ({ seat, slot, name: info.names[slot] ?? `P${slot + 1}` })),
    moves: actions.map(({ action, player }, i) => ({ ply: i + 1, player, notation: formatAction(action) })),
    ply: Math.max(0, Math.min(info.ply ?? actions.length, actions.length)),
    result: last.winner === null ? { kind: 'playing' } : { kind: 'win', winner: last.winner },
    final: {
      pawns: last.pawns.map((p) => [p.row, p.col] as [number, number]),
      wallsRemaining: [...last.wallsRemaining],
      currentPlayer: last.currentPlayer,
      winner: last.winner,
    },
  };
}

/** The legal action of `state` whose notation is `notation`, or null. */
export function parseActionMulti(state: MultiState, notation: string): Action | null {
  const n = notation.trim().toLowerCase();
  return legalActionsMulti(state).find((a) => formatAction(a) === n) ?? null;
}

export type ParsedMultiRecord =
  | { ok: true; setup: MultiGameSetup; names: string[]; mode: MultiGameMode; actions: RecordedMultiAction[]; ply: number }
  | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Reads a version 2 record (JSON). Every move is replayed with the rules engine; the player of
 * each move and the final position must agree with the replay, otherwise the import is rejected.
 * A version 1 (two-player) record is reported as such instead of being misread.
 */
export function parseMultiRecord(text: string): ParsedMultiRecord {
  let data: MultiRecordFile;
  try {
    data = JSON.parse(text.trim()) as MultiRecordFile;
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다.' };
  }
  if (data?.format !== GAME_RECORD_FORMAT) return { ok: false, error: `기보 형식이 아닙니다 (format: ${String(data?.format)}).` };
  if ((data.version as number) === 1) return { ok: false, error: '정규 2인전 기보(버전 1)입니다. 여기서는 다인전·변형 대전 기보(버전 2·3)만 불러올 수 있습니다.' };
  if (data.version !== MULTI_RECORD_VERSION && data.version !== VARIANT_RECORD_VERSION) return { ok: false, error: `지원하지 않는 기보 버전입니다 (${String(data.version)}).` };
  if (!MULTI_MODES.includes(data.mode)) return { ok: false, error: `지원하지 않는 게임 모드입니다 (${String(data.mode)}).` };
  if (data.version === MULTI_RECORD_VERSION && data.mode !== 'four-player') return { ok: false, error: `버전 2 기보는 정규 4인전만 담을 수 있습니다 (${String(data.mode)}).` };
  const r = data.rules;
  if (!r || !Array.isArray(r.players) || !Array.isArray(r.turnOrder) || !Array.isArray(data.moves) || !Array.isArray(data.wallsPerPlayer)) {
    return { ok: false, error: '기보에 규칙·참가자·수순 정보가 없습니다.' };
  }
  const seatsOk = r.players.every(
    (p, i) =>
      p.seat === i &&
      Array.isArray(p.start) && isInt(p.start[0]) && isInt(p.start[1]) &&
      (p.goal?.axis === 'row' || p.goal?.axis === 'col') && isInt(p.goal.index) && p.goal.index >= 0 && p.goal.index <= 8,
  );
  if (!seatsOk) return { ok: false, error: '기보의 플레이어 설정이 올바르지 않습니다.' };

  const v3 = data.version === VARIANT_RECORD_VERSION;
  const teams = v3 ? r.teams : undefined;
  if (teams !== undefined && (!Array.isArray(teams) || !teams.every(isInt))) return { ok: false, error: '기보의 팀 정보가 올바르지 않습니다.' };
  const neutral = v3 ? r.neutralWalls : undefined;
  if (neutral !== undefined && (!Array.isArray(neutral) || !neutral.every((w) => (w?.orientation === 'h' || w?.orientation === 'v') && isInt(w.row) && isInt(w.col)))) {
    return { ok: false, error: '기보의 중립 벽 정보가 올바르지 않습니다.' };
  }
  if (!r.turnOrder.every(isInt)) return { ok: false, error: '기보의 턴 순서가 올바르지 않습니다.' };
  const rules: MultiRules = {
    ...(v3 ? { mode: data.mode } : {}),
    players: r.players.map((p) => ({ start: { row: p.start[0], col: p.start[1] }, goal: { axis: p.goal.axis, index: p.goal.index } })),
    turnOrder: r.turnOrder,
    ...(teams ? { teams } : {}),
    ...(neutral ? { neutralWalls: neutral.map((w): WallSpec => ({ orientation: w.orientation, row: w.row, col: w.col })) } : {}),
    ...(v3 && isInt(r.seed) ? { seed: r.seed } : {}),
    ...(v3 && typeof r.preset === 'string' ? { preset: r.preset.slice(0, 20) } : {}),
  };
  const n = rules.players.length;
  const walls = data.wallsPerPlayer;
  if (walls.length !== n || !walls.every((w) => isInt(w) && w >= 0 && w <= MAX_WALLS)) return { ok: false, error: '기보의 플레이어별 벽 개수가 올바르지 않습니다.' };
  if (!isInt(data.firstPlayer)) return { ok: false, error: '기보의 시작 플레이어가 올바르지 않습니다.' };
  const setup: MultiGameSetup = { rules, wallsPerPlayer: walls, firstPlayer: data.firstPlayer };
  try {
    validateRules(rules);
    const mismatch = checkModeConsistency(data.mode, rules);
    if (mismatch) return { ok: false, error: `기보의 규칙이 게임 모드와 맞지 않습니다: ${mismatch}` };
    if (initialMultiState(setup).winner !== null) return { ok: false, error: '기보의 초기 배치에서 이미 목표선에 도착한 플레이어가 있습니다.' };
  } catch (err) {
    return { ok: false, error: `기보의 초기 배치가 올바르지 않습니다: ${err instanceof Error ? err.message : String(err)}` };
  }

  let state = initialMultiState(setup);
  const actions: RecordedMultiAction[] = [];
  for (let i = 0; i < data.moves.length; i++) {
    const m = data.moves[i];
    const action = typeof m?.notation === 'string' ? parseActionMulti(state, m.notation) : null;
    if (!action) return { ok: false, error: `${i + 1}번째 수 '${String(m?.notation)}'가 합법이 아닙니다.` };
    if (m.player !== state.currentPlayer) return { ok: false, error: `${i + 1}번째 수의 플레이어 정보가 수순과 맞지 않습니다.` };
    actions.push({ action, player: state.currentPlayer });
    state = applyActionMulti(state, action);
  }
  const f = data.final;
  if (
    f &&
    (f.currentPlayer !== state.currentPlayer ||
      f.winner !== state.winner ||
      f.pawns?.length !== n ||
      f.pawns.some((p, i) => p[0] !== state.pawns[i].row || p[1] !== state.pawns[i].col) ||
      f.wallsRemaining?.length !== n ||
      f.wallsRemaining.some((w, i) => w !== state.wallsRemaining[i]))
  ) {
    return { ok: false, error: '기록된 최종 포지션이 수순을 다시 둔 결과와 다릅니다.' };
  }
  const names = rules.turnOrder.map((seat, slot) => {
    const name = data.participants?.find((p) => p.seat === seat)?.name;
    return typeof name === 'string' && name.trim() ? name.trim().slice(0, 20) : `P${slot + 1}`;
  });
  const ply = isInt(data.ply) ? Math.max(0, Math.min(data.ply, actions.length)) : actions.length;
  return { ok: true, setup, names, mode: data.mode, actions, ply };
}

/** Official wall count for a player count (used when a setup does not say). */
export const officialWalls = (players: number): number[] => Array.from({ length: players }, () => OFFICIAL_WALLS[players]);

/** Default walls per player of `mode` (obstacle races depend on the player count). */
export const defaultWalls = (mode: MultiGameMode, players: number): number[] =>
  Array.from({ length: players }, () => (mode === 'obstacle' ? OBSTACLE_WALLS[players] : VARIANT_WALLS[mode]));

/** "1. e2 a5 e8 i5 2. …": one numbered round per `players` moves (the text form for copying). */
export function multiRecordToText(actions: readonly RecordedMultiAction[], players: number): string {
  const parts: string[] = [];
  actions.forEach(({ action }, i) => {
    if (i % players === 0) parts.push(`${i / players + 1}.`);
    parts.push(formatAction(action));
  });
  return parts.join(' ');
}
