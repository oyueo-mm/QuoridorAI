import { DEFAULT_BFS_WEIGHTS } from '../ai/bfsAgent';
import { resolveMctsSettings } from '../ai/mctsAgent';
import { resolveMinimaxSettings } from '../ai/minimaxAgent';
import { randomSeed } from '../ai/rng';
import type { AgentId } from '../ai/registry';
import type { BfsWeights, MctsSettings, MinimaxSettings } from '../ai/types';
import type { PlayerId } from '../engine';
import { DEFAULT_MAX_PLIES } from '../match/outcome';

/** Who controls a seat. */
export type SeatController = { kind: 'human' } | { kind: 'ai'; agentId: AgentId };

/**
 * The three ways to play. 'vs-ai' and 'local-2p' are two-player games (GameConfig.opponent is an
 * AI or 'human'); 'four-player' is a separate local game (MultiController).
 */
export type GameMode = 'vs-ai' | 'local-2p' | 'four-player';

/** 'human' = a second person on the same device (hot-seat). */
export type Opponent = 'human' | AgentId;

export interface GameConfig {
  /** Seat the user plays. Player 0 always moves first. */
  userSeat: PlayerId;
  opponent: Opponent;
  /** Names of seats 0 and 1 for Human vs Human (blank = default). */
  names?: readonly [string, string];
  /** Seed for stochastic agents (Random AI). */
  seed: number;
  bfsWeights: BfsWeights;
  minimax: MinimaxSettings;
  mcts: MctsSettings;
  mctsGuided: MctsSettings;
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
    mcts: resolveMctsSettings(),
    mctsGuided: resolveMctsSettings({ variant: 'guided' }),
    maxPlies: DEFAULT_MAX_PLIES,
  };
}

export function seatControllers(config: GameConfig): [SeatController, SeatController] {
  const opponent: SeatController =
    config.opponent === 'human' ? { kind: 'human' } : { kind: 'ai', agentId: config.opponent };
  return config.userSeat === 0 ? [{ kind: 'human' }, opponent] : [opponent, { kind: 'human' }];
}

/** The mode a two-player configuration plays. */
export function modeOfConfig(config: GameConfig): Exclude<GameMode, 'four-player'> {
  return config.opponent === 'human' ? 'local-2p' : 'vs-ai';
}

/** Display name of a seat in Human vs Human. */
export function localSeatName(config: GameConfig, seat: PlayerId): string {
  return config.names?.[seat]?.trim().slice(0, 20) || `플레이어 ${seat + 1}`;
}

/** Choices shown when starting a game and on the home page. */
export const GAME_MODES: { id: GameMode; title: string; description: string }[] = [
  { id: 'vs-ai', title: '사람 vs AI', description: '정규 2인전. AI를 고르고 AI의 판단 분석을 함께 봅니다.' },
  { id: 'local-2p', title: '사람 vs 사람', description: '정규 2인전. 한 기기에서 두 사람이 번갈아 둡니다.' },
  { id: 'four-player', title: '4인 개인전', description: '공식 4인전. 네 사람이 한 기기에서 시계 방향으로 둡니다. 벽은 5개씩.' },
];

