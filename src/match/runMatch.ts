import { applyAction, createInitialState, hashState, isLegalAction } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import type { Agent, DecisionTrace } from '../ai/types';
import { DEFAULT_MAX_PLIES, isMatchOver, matchStatus } from './outcome';
import type { MatchStatus } from './outcome';

export class IllegalAgentActionError extends Error {
  constructor(
    readonly agentId: string,
    readonly action: Action,
  ) {
    super(`Agent "${agentId}" chose an illegal action: ${JSON.stringify(action)}`);
    this.name = 'IllegalAgentActionError';
  }
}

export interface MatchMove {
  player: PlayerId;
  action: Action;
  trace: DecisionTrace;
}

export interface MatchRecord {
  status: MatchStatus;
  finalState: GameState;
  moves: MatchMove[];
  elapsedMs: number;
}

export interface RunMatchOptions {
  /** Experimental ply budget; null disables it (the game may then never end). */
  maxPlies?: number | null;
  /**
   * Wall-clock budget for the whole game in ms (checked between moves, so a single move can
   * overrun it by at most its own duration). null = unlimited.
   */
  maxGameMs?: number | null;
  /**
   * Halt when the same position (pawns, walls, walls in hand, side to move) occurs this many
   * times. Experimental guard against shuffling; not an official rule. null = off.
   */
  repetitionLimit?: number | null;
  initialState?: GameState;
  signal?: AbortSignal;
  /** Called after every move (progress logging). */
  onMove?: (move: MatchMove, state: GameState) => void;
  clock?: () => number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Plays a headless AI vs AI game. Every chosen action is re-validated against the engine. */
export async function runMatch(
  agents: readonly [Agent, Agent],
  {
    maxPlies = DEFAULT_MAX_PLIES,
    maxGameMs = null,
    repetitionLimit = null,
    initialState,
    signal,
    onMove,
    clock = now,
  }: RunMatchOptions = {},
): Promise<MatchRecord> {
  const start = clock();
  let state = initialState ?? createInitialState();
  const moves: MatchMove[] = [];
  const seen = new Map<string, number>();
  const visit = (s: GameState) => {
    const h = hashState(s);
    const key = `${h.key}:${h.check}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n;
  };
  visit(state);
  let status = matchStatus(state, maxPlies);

  while (!isMatchOver(status)) {
    if (maxGameMs !== null && clock() - start >= maxGameMs) {
      status = { kind: 'halted', reason: 'time-limit', limitMs: maxGameMs };
      break;
    }
    const player = state.currentPlayer;
    const agent = agents[player];
    const { action, trace } = await agent.decide(state, { signal });
    if (!isLegalAction(state, action)) throw new IllegalAgentActionError(agent.id, action);
    state = applyAction(state, action);
    const move = { player, action, trace };
    moves.push(move);
    onMove?.(move, state);
    status = matchStatus(state, maxPlies);
    const repeats = visit(state);
    if (status.kind === 'playing' && repetitionLimit !== null && repeats >= repetitionLimit) {
      status = { kind: 'halted', reason: 'repetition', repeats };
    }
  }
  return { status, finalState: state, moves, elapsedMs: clock() - start };
}
