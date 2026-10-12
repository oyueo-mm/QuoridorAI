import { createRng } from '../ai/rng';
import { applyAction, createInitialState, formatAction, legalPawnMoves, parseAction } from '../engine';
import type { GameState } from '../engine';

/** A start position: `plies` random pawn moves (no walls) drawn with `seed`. plies 0 = standard start. */
export interface OpeningSpec {
  seed: number;
  plies: number;
}

export function randomOpening({ seed, plies }: OpeningSpec): { state: GameState; moves: string[] } {
  const rng = createRng(seed);
  let state = createInitialState();
  const moves: string[] = [];
  for (let i = 0; i < plies && state.winner === null; i++) {
    const options = legalPawnMoves(state);
    const action = { type: 'move' as const, to: options[Math.floor(rng() * options.length)] };
    moves.push(formatAction(action));
    state = applyAction(state, action);
  }
  return { state, moves };
}

export interface ParsedGame {
  /** Positions after 0..k moves (positions[0] = start). */
  positions: GameState[];
  moves: string[];
  /** First move that could not be parsed or is illegal. */
  error?: { index: number; notation: string };
}

/** Replays a move list in notation ("e2 e8 e3h …", commas/numbers allowed) from the start. */
export function parseMoveList(text: string, start: GameState = createInitialState()): ParsedGame {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^\d+\.+/, '').trim())
    .filter((t) => t.length > 0 && !/^\d+\.?$/.test(t));
  const positions = [start];
  const moves: string[] = [];
  let state = start;
  for (const [index, token] of tokens.entries()) {
    if (state.winner !== null) return { positions, moves, error: { index, notation: token } };
    const action = parseAction(state, token);
    if (!action) return { positions, moves, error: { index, notation: token } };
    state = applyAction(state, action);
    positions.push(state);
    moves.push(formatAction(action));
  }
  return { positions, moves };
}
