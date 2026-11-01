import type { WallPlacementResult } from '../engine';

/**
 * Per-player styling is indexed by *slot*: the player's position in the turn order (0..3), which
 * is also what is shown to people (P1..P4). In the two-player game slot = engine seat. In the
 * four-player game the seats on the top/left/right sides keep their engine ids, but the slot
 * follows the clockwise turn order (see `seatSlot`), so P1 → P2 → P3 → P4 is always the order of play.
 */
export const PLAYER_LABEL: readonly string[] = ['P1', 'P2', 'P3', 'P4'];

// Muted blue / terracotta / ochre / violet on the light board (#efe6d8). Colour is never the only
// cue: every player has a number (P1–P4) and its own wall texture (solid, diagonal stripes, dots,
// vertical stripes).
export const PLAYER_COLOR: readonly string[] = ['#3c6a8a', '#ad5646', '#9c7415', '#6b5a9e'];

export const PLAYER_TEXT_CLASS: readonly string[] = ['text-p1', 'text-p2', 'text-p3', 'text-p4'];
export const PLAYER_BG_CLASS: readonly string[] = ['bg-p1', 'bg-p2', 'bg-p3', 'bg-p4'];
export const PLAYER_BORDER_CLASS: readonly string[] = ['border-p1', 'border-p2', 'border-p3', 'border-p4'];
export const PLAYER_RING_CLASS: readonly string[] = ['ring-p1/45', 'ring-p2/45', 'ring-p3/45', 'ring-p4/45'];

/**
 * Walls take the colour of the player who placed them. Colour is never the only cue: P2 walls
 * carry diagonal stripes, P3 dots, P4 vertical stripes, walls without a recorded owner are drawn
 * hollow (light fill, grey outline), and hovering a wall names its owner. Validated on the board
 * (#e7dccb): P1 vs P2 CVD ΔE 10.6, normal ΔE 19.1.
 */
export const WALL_COLORS: readonly string[] = PLAYER_COLOR;
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
