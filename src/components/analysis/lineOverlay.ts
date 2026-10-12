import { applyAction } from '../../engine';
import type { Action, GameState } from '../../engine';
import type { BoardMark, BoardOverlay, BoardPath } from '../board/overlay';

/**
 * Overlay showing the position after playing `actions` from `start`, with every step
 * numbered on the board (the last step is the main highlight).
 */
export function lineOverlay(start: GameState, actions: readonly Action[], title: string, paths: BoardPath[] = []): BoardOverlay {
  let state = start;
  const marks: BoardMark[] = [];
  actions.forEach((action, i) => {
    marks.push({ action, player: state.currentPlayer, label: String(i + 1) });
    state = applyAction(state, action);
  });
  const highlight = marks.pop();
  return { state, title, highlight, marks, paths };
}
