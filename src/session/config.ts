import { DEFAULT_BFS_WEIGHTS } from '../ai/bfsAgent';
import { resolveMctsSettings } from '../ai/mctsAgent';
import { resolveMinimaxSettings } from '../ai/minimaxAgent';
import { randomSeed } from '../ai/rng';
import type { AgentId } from '../ai/registry';
import type { BfsWeights, MctsSettings, MinimaxSettings } from '../ai/types';
import type { MultiGameMode, PlayerId } from '../engine';
import { DEFAULT_MAX_PLIES } from '../match/outcome';

/** Who controls a seat. */
export type SeatController = { kind: 'human' } | { kind: 'ai'; agentId: AgentId };

/**
 * The ways to play. 'vs-ai' and 'local-2p' are regular two-player games (GameConfig.opponent is an
 * AI or 'human'); every other mode is a local multi-player game or variant (MultiController).
 */
export type GameMode = 'vs-ai' | 'local-2p' | MultiGameMode;

export const isMultiMode = (mode: GameMode): mode is MultiGameMode => mode !== 'vs-ai' && mode !== 'local-2p';

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
export function modeOfConfig(config: GameConfig): 'vs-ai' | 'local-2p' {
  return config.opponent === 'human' ? 'local-2p' : 'vs-ai';
}

/** Display name of a seat in Human vs Human. */
export function localSeatName(config: GameConfig, seat: PlayerId): string {
  return config.names?.[seat]?.trim().slice(0, 20) || `플레이어 ${seat + 1}`;
}

export interface ModeInfo {
  id: GameMode;
  title: string;
  description: string;
  /** Participants, as shown on the card. */
  players: string;
  /** Official rules (Gigamic) or a custom variant of this project. */
  official: boolean;
  group: 'basic' | 'variant';
}

/** Choices shown when starting a game: 기본 대전 (official rules) first, then 변형 대전. */
export const GAME_MODES: ModeInfo[] = [
  { id: 'vs-ai', title: '사람 vs AI', description: '정규 2인전. AI를 고르고 AI의 판단 분석을 함께 봅니다.', players: '2인', official: true, group: 'basic' },
  { id: 'local-2p', title: '사람 vs 사람', description: '정규 2인전. 한 기기에서 두 사람이 번갈아 둡니다.', players: '2인', official: true, group: 'basic' },
  { id: 'four-player', title: '정규 4인전', description: '공식 4인전. 네 사람이 한 기기에서 시계 방향으로 둡니다. 벽은 5개씩.', players: '4인', official: true, group: 'basic' },
  { id: 'race-2', title: '동방향 2인 경주', description: '두 말이 같은 줄에서 출발해 같은 방향의 목표선으로 달립니다.', players: '2인', official: false, group: 'variant' },
  { id: 'race-4', title: '동방향 4인 경주', description: '네 말이 아래쪽에서 나란히 출발해 위쪽 목표선을 향해 경쟁합니다.', players: '4인', official: false, group: 'variant' },
  { id: 'three-player', title: '3인 개인전', description: '아래·왼쪽·위에서 출발해 각자 반대편을 향합니다.', players: '3인', official: false, group: 'variant' },
  { id: 'team-2v2', title: '2 vs 2 팀전', description: '두 팀이 교대로 둡니다. 팀원 누구든 먼저 도착하면 팀이 이깁니다.', players: '4인 (2팀)', official: false, group: 'variant' },
  { id: 'asymmetric', title: '비대칭 대전', description: '시작 위치·목표선·벽 개수를 플레이어마다 다르게 정하는 핸디캡 대전.', players: '2~4인', official: false, group: 'variant' },
  { id: 'obstacle', title: '장애물 경주', description: '처음부터 중립 벽이 놓인 맵에서 우회로를 찾아 경쟁합니다.', players: '2~4인', official: false, group: 'variant' },
];

export const modeInfo = (mode: GameMode): ModeInfo => GAME_MODES.find((m) => m.id === mode)!;
