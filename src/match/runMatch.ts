import { applyAction, createInitialState, isLegalAction } from '../engine';
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

export interface MatchRecord {
  status: MatchStatus;
  finalState: GameState;
  moves: { player: PlayerId; action: Action; trace: DecisionTrace }[];
}

export interface RunMatchOptions {
  /** Experimental ply budget; null disables it (the game may then never end). */
  maxPlies?: number | null;
  initialState?: GameState;
  signal?: AbortSignal;
}

/** Plays a headless AI vs AI game. Every chosen action is re-validated against the engine. */
export async function runMatch(
  agents: readonly [Agent, Agent],
  { maxPlies = DEFAULT_MAX_PLIES, initialState, signal }: RunMatchOptions = {},
): Promise<MatchRecord> {
  let state = initialState ?? createInitialState();
  const moves: MatchRecord['moves'] = [];
  let status = matchStatus(state, maxPlies);

  while (!isMatchOver(status)) {
    const player = state.currentPlayer;
    const agent = agents[player];
    const { action, trace } = await agent.decide(state, { signal });
    if (!isLegalAction(state, action)) throw new IllegalAgentActionError(agent.id, action);
    state = applyAction(state, action);
    moves.push({ player, action, trace });
    status = matchStatus(state, maxPlies);
  }
  return { status, finalState: state, moves };
}
