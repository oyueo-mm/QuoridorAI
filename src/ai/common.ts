import type { GameState } from '../engine';
import type { AgentContext } from './types';

export function assertCanDecide(state: GameState, context?: AgentContext): void {
  if (context?.signal?.aborted) throw new DOMException('Decision aborted', 'AbortError');
  if (state.winner !== null) throw new Error('Cannot decide in a finished game');
}

export const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();
