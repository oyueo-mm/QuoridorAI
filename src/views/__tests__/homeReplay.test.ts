import { describe, expect, it } from 'vitest';
import { createInitialState, isLegalAction } from '../../engine';
import { buildHomeReplay } from '../homeReplay';

describe('home replay', () => {
  const steps = buildHomeReplay();

  it('replays only legal actions and ends with a winner', () => {
    let state = createInitialState();
    for (const s of steps) {
      expect(s.player).toBe(state.currentPlayer);
      expect(isLegalAction(state, s.action)).toBe(true);
      state = s.after;
    }
    expect(state.winner).not.toBeNull();
  });

  it('alternates players and contains walls from both sides', () => {
    steps.forEach((s, i) => expect(s.player).toBe(i % 2));
    const walls = steps.filter((s) => s.action.type === 'wall');
    expect(walls.length).toBeGreaterThanOrEqual(6);
    expect(new Set(walls.map((s) => s.player)).size).toBe(2);
    expect(steps.length).toBeLessThanOrEqual(56);
  });
});
