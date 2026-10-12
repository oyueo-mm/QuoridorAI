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

/**
 * Walls take the colour of the player who placed them (the P1 / P2 tokens: muted blue-grey and
 * terracotta). Colour is never the only cue: P2 walls also carry faint diagonal stripes, walls
 * without a recorded owner are drawn hollow (light fill, grey outline), and hovering a wall
 * names its owner. Validated on the board (#e7dccb): P1 vs P2 CVD ΔE 10.6, normal ΔE 19.1.
 */
export const WALL_COLORS: Record<PlayerId, string> = PLAYER_COLOR;
export const NEUTRAL_WALL = { fill: '#e2d9cc', stroke: '#8b8178' };

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
