import { parseMoveList } from '../arena/openings';
import { applyAction, createInitialState, formatAction } from '../engine';
import type { GameState, PlayerId } from '../engine';
import type { MatchStatus } from './outcome';
import type { RecordedAction } from './wallOwners';

/*
 * Game records: the move list of a game (always from the standard start position, which is
 * where every game in this app begins — Play, Arena openings, Compare sources), the player of
 * each move and the ply under analysis. Moves use the project's own notation (formatAction /
 * parseMoveList); no outside standard is assumed. Wall owners are not stored separately: they
 * follow from the moves and their players (wallOwnersFromMoves).
 */

export const GAME_RECORD_FORMAT = 'quoridor-ai.game-record';
export const GAME_RECORD_VERSION = 1;

/** A move list plus the position of interest (0 = start, actions.length = after the last move). */
export interface GameLine {
  actions: RecordedAction[];
  ply: number;
}

export interface SeatInfo {
  kind: 'human' | 'ai';
  /** Display name, e.g. '나', 'Minimax AI'. */
  label: string;
  /** Agent id and the settings it played with (AI seats). */
  agent?: string;
  settings?: unknown;
}

export interface GameRecordFile {
  format: typeof GAME_RECORD_FORMAT;
  version: typeof GAME_RECORD_VERSION;
  createdAt: string;
  /** Where it was exported from: 'play' | 'compare' | 'arena'. */
  source: string;
  /** Start position; this version supports the standard start only. */
  start: 'standard';
  moves: { ply: number; player: PlayerId; notation: string }[];
  /** Selected position (number of moves played), 0..moves.length. */
  ply: number;
  /** Player to move at `ply`. */
  toMove: PlayerId;
  seats?: [SeatInfo, SeatInfo];
  /** Other context (e.g. Play settings). */
  meta?: Record<string, unknown>;
  result?: { kind: 'playing' } | { kind: 'win'; winner: PlayerId } | { kind: 'halted'; reason: string };
  /** Position after the last move, for an integrity check on import. */
  final: { pawns: [[number, number], [number, number]]; wallsRemaining: [number, number]; currentPlayer: PlayerId; winner: PlayerId | null };
}

/** Positions along a line: positions[i] = after i moves. */
export function replayActions(actions: readonly RecordedAction[]): GameState[] {
  const positions = [createInitialState()];
  for (const { action } of actions) positions.push(applyAction(positions[positions.length - 1], action));
  return positions;
}

/** "1. e2 e8 2. e3 e7 …" — the format parseMoveList reads back. */
export function recordToText(actions: readonly RecordedAction[]): string {
  const parts: string[] = [];
  actions.forEach(({ action }, i) => {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(formatAction(action));
  });
  return parts.join(' ');
}

/** Notation of the first `ply` moves, separated by spaces (an Arena opening). */
export function movesText(actions: readonly RecordedAction[], ply = actions.length): string {
  return actions.slice(0, ply).map(({ action }) => formatAction(action)).join(' ');
}

export function resultOf(status: MatchStatus): GameRecordFile['result'] {
  if (status.kind === 'win') return { kind: 'win', winner: status.winner };
  if (status.kind === 'halted') return { kind: 'halted', reason: status.reason };
  return { kind: 'playing' };
}

export function buildRecord(line: GameLine, info: { source: string; seats?: [SeatInfo, SeatInfo]; meta?: Record<string, unknown>; result?: GameRecordFile['result'] }): GameRecordFile {
  const positions = replayActions(line.actions);
  const last = positions[positions.length - 1];
  const at = positions[Math.max(0, Math.min(line.ply, line.actions.length))];
  return {
    format: GAME_RECORD_FORMAT,
    version: GAME_RECORD_VERSION,
    createdAt: new Date().toISOString(),
    source: info.source,
    start: 'standard',
    moves: line.actions.map(({ action, player }, i) => ({ ply: i + 1, player, notation: formatAction(action) })),
    ply: Math.max(0, Math.min(line.ply, line.actions.length)),
    toMove: at.currentPlayer,
    ...(info.seats ? { seats: info.seats } : {}),
    ...(info.meta ? { meta: info.meta } : {}),
    ...(info.result ? { result: info.result } : {}),
    final: {
      pawns: [
        [last.pawns[0].row, last.pawns[0].col],
        [last.pawns[1].row, last.pawns[1].col],
      ],
      wallsRemaining: [last.wallsRemaining[0], last.wallsRemaining[1]],
      currentPlayer: last.currentPlayer,
      winner: last.winner,
    },
  };
}

export type ParsedRecord = { ok: true; line: GameLine; record: GameRecordFile | null } | { ok: false; error: string };

/**
 * Reads a record exported by buildRecord (JSON) or a plain move list ("1. e2 e8 …"). Every move
 * is replayed with the rules engine; JSON records must also agree on each move's player and on
 * the final position, otherwise the import is rejected.
 */
export function parseRecord(text: string): ParsedRecord {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    const parsed = parseMoveList(trimmed);
    if (parsed.error) return { ok: false, error: `${parsed.error.index + 1}번째 수 '${parsed.error.notation}'가 합법이 아닙니다.` };
    return { ok: true, line: { actions: parsed.actions, ply: parsed.actions.length }, record: null };
  }
  let data: GameRecordFile;
  try {
    data = JSON.parse(trimmed) as GameRecordFile;
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다.' };
  }
  if (data?.format !== GAME_RECORD_FORMAT) return { ok: false, error: `기보 형식이 아닙니다 (format: ${String(data?.format)}).` };
  if (data.version !== GAME_RECORD_VERSION) return { ok: false, error: `지원하지 않는 기보 버전입니다 (${String(data.version)}).` };
  if (data.start !== 'standard' || !Array.isArray(data.moves)) return { ok: false, error: '표준 시작 포지션의 수순만 지원합니다.' };
  const parsed = parseMoveList(data.moves.map((m) => m.notation).join(' '));
  if (parsed.error) return { ok: false, error: `${parsed.error.index + 1}번째 수 '${parsed.error.notation}'가 합법이 아닙니다.` };
  const mismatch = data.moves.findIndex((m, i) => m.player !== parsed.actions[i].player);
  if (mismatch >= 0) return { ok: false, error: `${mismatch + 1}번째 수의 플레이어 정보가 수순과 맞지 않습니다.` };
  const last = parsed.positions[parsed.positions.length - 1];
  const f = data.final;
  if (
    f &&
    (f.pawns[0][0] !== last.pawns[0].row ||
      f.pawns[0][1] !== last.pawns[0].col ||
      f.pawns[1][0] !== last.pawns[1].row ||
      f.pawns[1][1] !== last.pawns[1].col ||
      f.wallsRemaining[0] !== last.wallsRemaining[0] ||
      f.wallsRemaining[1] !== last.wallsRemaining[1] ||
      f.currentPlayer !== last.currentPlayer ||
      f.winner !== last.winner)
  ) {
    return { ok: false, error: '기록된 최종 포지션이 수순을 다시 둔 결과와 다릅니다.' };
  }
  const ply = Number.isInteger(data.ply) ? Math.max(0, Math.min(data.ply, parsed.actions.length)) : parsed.actions.length;
  return { ok: true, line: { actions: parsed.actions, ply }, record: data };
}
