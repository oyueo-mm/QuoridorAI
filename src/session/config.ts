import type { PlayerId } from '../engine';

/** Who controls a seat. AI seats reference an id from AGENT_CATALOG. */
export type SeatController = { kind: 'human' } | { kind: 'ai'; agentId: string };

/** 'local' = a second person on the same device (hot-seat); otherwise an AGENT_CATALOG id. */
export type OpponentId = 'local' | string;

export interface GameConfig {
  /** Seat the user plays. Player 0 always moves first. */
  userSeat: PlayerId;
  opponent: OpponentId;
}

export const DEFAULT_CONFIG: GameConfig = { userSeat: 0, opponent: 'local' };

export function seatControllers(config: GameConfig): [SeatController, SeatController] {
  const opponent: SeatController =
    config.opponent === 'local' ? { kind: 'human' } : { kind: 'ai', agentId: config.opponent };
  return config.userSeat === 0 ? [{ kind: 'human' }, opponent] : [opponent, { kind: 'human' }];
}
