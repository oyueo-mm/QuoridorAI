import { describe, expect, it } from 'vitest';
import { bottomSeatFor } from './ui';

describe('board orientation', () => {
  it('auto keeps the given seat (the user) at the bottom', () => {
    expect(bottomSeatFor('auto', 0)).toBe(0);
    expect(bottomSeatFor('auto', 1)).toBe(1); // playing second: own pawn still at the bottom
  });

  it('fixed views ignore the user seat', () => {
    expect(bottomSeatFor('p1', 1)).toBe(0);
    expect(bottomSeatFor('p2', 0)).toBe(1);
  });
});
