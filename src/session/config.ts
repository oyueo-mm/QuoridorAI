import { DEFAULT_BFS_WEIGHTS } from '../ai/bfsAgent';
import { resolveMinimaxSettings } from '../ai/minimaxAgent';
import { randomSeed } from '../ai/rng';
import type { AgentId } from '../ai/registry';
import type { BfsWeights, MinimaxSettings } from '../ai/types';
import type { PlayerId } from '../engine';
import { DEFAULT_MAX_PLIES } from '../match/outcome';

/** Who controls a seat. */
export type SeatController = { kind: 'human' } | { kind: 'ai'; agentId: AgentId };

/** 'human' = a second person on the same device (hot-seat). */
export type Opponent = 'human' | AgentId;

export interface GameConfig {
  /** Seat the user plays. Player 0 always moves first. */
  userSeat: PlayerId;
  opponent: Opponent;
  /** Seed for stochastic agents (Random AI). */
  seed: number;
  bfsWeights: BfsWeights;
  minimax: MinimaxSettings;
  /** Experimental ply budget; reaching it halts the game without a winner. null = unlimited. */
  maxPlies: number | null;
}

export function defaultConfig(): GameConfig {
  return {
    userSeat: 0,
    opponent: 'minimax',
    seed: randomSeed(),
    bfsWeights: { ...DEFAULT_BFS_WEIGHTS },
    minimax: resolveMinimaxSettings(),
    maxPlies: DEFAULT_MAX_PLIES,
  };
}

export function seatControllers(config: GameConfig): [SeatController, SeatController] {
  const opponent: SeatController =
    config.opponent === 'human' ? { kind: 'human' } : { kind: 'ai', agentId: config.opponent };
  return config.userSeat === 0 ? [{ kind: 'human' }, opponent] : [opponent, { kind: 'human' }];
}
