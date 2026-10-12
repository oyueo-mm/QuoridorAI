import type { BoardOverlay } from '../board/overlay';

/** Props that make an element preview a board overlay on hover/focus and pin it on click. */
export interface PreviewHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
  tabIndex: number;
  'aria-pressed': boolean;
}

export type PreviewBinder = (key: string, build: () => BoardOverlay) => PreviewHandlers;

export const signed = (n: number, digits = 0): string =>
  (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(digits);

export const fmtScore = (n: number): string => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);
