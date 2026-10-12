import type { PlayerId, WallPlacementResult } from '../engine';

/** Display names: engine player 0/1 are shown as P1/P2. */
export const PLAYER_LABEL: Record<PlayerId, string> = { 0: 'P1', 1: 'P2' };

// Validated for CVD separation and lightness on the dark board surface (#0f172a).
export const PLAYER_COLOR: Record<PlayerId, string> = { 0: '#0b98d8', 1: '#f43f5e' };

export const PLAYER_TEXT_CLASS: Record<PlayerId, string> = { 0: 'text-sky-400', 1: 'text-rose-400' };
export const PLAYER_BG_CLASS: Record<PlayerId, string> = { 0: 'bg-sky-400', 1: 'bg-rose-400' };
export const PLAYER_RING_CLASS: Record<PlayerId, string> = {
  0: 'ring-sky-400/60',
  1: 'ring-rose-400/60',
};

export const WALL_COLOR = '#f59e0b';

export const WALL_RESULT_TEXT: Record<WallPlacementResult, string> = {
  ok: '클릭하여 벽 설치',
  'game-over': '게임이 종료되었습니다',
  'no-walls-left': '남은 벽이 없습니다',
  'out-of-bounds': '보드 밖입니다',
  overlap: '기존 벽과 겹치거나 교차합니다',
  'blocks-path': '플레이어의 목표 경로를 완전히 막을 수 없습니다',
};
