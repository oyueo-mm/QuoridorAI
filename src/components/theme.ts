import type { PlayerId, WallPlacementResult } from '../engine';

/** Display names: engine player 0/1 are shown as P1/P2. */
export const PLAYER_LABEL: Record<PlayerId, string> = { 0: 'P1', 1: 'P2' };

// Muted blue / terracotta on the light board (#efe6d8): separable under deuteranopia and
// protanopia (different lightness and hue), never used as the only cue (labels P1 / P2).
export const PLAYER_COLOR: Record<PlayerId, string> = { 0: '#3c6a8a', 1: '#ad5646' };

export const PLAYER_TEXT_CLASS: Record<PlayerId, string> = { 0: 'text-p1', 1: 'text-p2' };
export const PLAYER_BG_CLASS: Record<PlayerId, string> = { 0: 'bg-p1', 1: 'bg-p2' };
export const PLAYER_RING_CLASS: Record<PlayerId, string> = {
  0: 'ring-p1/45',
  1: 'ring-p2/45',
};

/** Placed walls: dark wood. */
export const WALL_COLOR = '#8a6a4b';

/** Board surfaces (SVG). */
export const BOARD_COLORS = {
  frame: '#e7dccb',
  groove: '#d9ccb8',
  cell: '#f6f0e6',
  label: '#9a8f81',
  preview: '#9a6d24',
  invalid: '#a4473d',
  ink: '#2e2a25',
};

export const WALL_RESULT_TEXT: Record<WallPlacementResult, string> = {
  ok: '클릭하여 벽 설치',
  'game-over': '게임이 종료되었습니다',
  'no-walls-left': '남은 벽이 없습니다',
  'out-of-bounds': '보드 밖입니다',
  overlap: '기존 벽과 겹치거나 교차합니다',
  'blocks-path': '플레이어의 목표 경로를 완전히 막을 수 없습니다',
};
