import type { CSSProperties } from 'react';

/**
 * Width of a board column. It depends only on the viewport (never on panel content), so the
 * board keeps its size and position while a game runs, and the whole column fits the screen
 * height on laptops. `reservedRem` = height taken by everything in the column except the board.
 */
export function boardColumnStyle(reservedRem: number): CSSProperties {
  return { width: `min(100%, 640px, max(320px, calc(100svh - ${reservedRem}rem)))` };
}
