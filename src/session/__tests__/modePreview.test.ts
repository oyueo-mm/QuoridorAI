import { describe, expect, it } from 'vitest';
import { goalDistanceMulti } from '../../engine';
import { GAME_MODES, isMultiMode } from '../config';
import { MultiController, buildMultiSetup, recommendedConfig } from '../MultiController';
import { computePreview, layoutKey, needsObstacleMap, obstacleKey, previewBrief } from '../modePreview';

const multiModes = GAME_MODES.filter((m) => isMultiMode(m.id));

describe('mode preview', () => {
  it('covers all nine modes with a valid initial position', () => {
    expect(GAME_MODES).toHaveLength(9);
    for (const m of GAME_MODES) {
      const r = computePreview(m.id, recommendedConfig(isMultiMode(m.id) ? m.id : 'four-player'));
      expect(r.ok, m.id).toBe(true);
      if (!r.ok) continue;
      const { state, setup } = r.preview;
      expect(state.ply).toBe(0);
      expect(state.pawns).toEqual(setup.rules.players.map((p) => p.start));
      state.pawns.forEach((_, s) => expect(goalDistanceMulti(state, s)).toBeGreaterThan(0));
      expect(previewBrief(r.preview).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('matches the position a real start produces, for every multi mode', () => {
    for (const m of multiModes) {
      const config = recommendedConfig(m.id as never);
      const r = computePreview(m.id, config);
      if (!r.ok) throw new Error(m.id);
      const started = new MultiController(config, { random: () => 0 }).getSnapshot();
      expect(r.preview.state.pawns, m.id).toEqual(started.game.pawns);
      expect(r.preview.state.wallsRemaining, m.id).toEqual(started.game.wallsRemaining);
      expect(r.preview.state.hWalls, m.id).toEqual(started.game.hWalls);
      expect(r.preview.state.vWalls, m.id).toEqual(started.game.vWalls);
      expect(r.preview.setup.rules, m.id).toEqual(started.setup.rules);
    }
  });

  it('obstacle preview shows the same neutral walls as the game for the same seed, and changes with the seed', () => {
    const base = recommendedConfig('obstacle');
    const cfg = (seed: number, preset: 'easy' | 'normal' | 'hard' = 'normal') => ({ ...base, obstacle: { players: 2 as const, preset, seed } });
    const a = computePreview('obstacle', cfg(42));
    const b = computePreview('obstacle', cfg(42));
    const c = computePreview('obstacle', cfg(43));
    if (!a.ok || !b.ok || !c.ok) throw new Error('invalid');
    expect(a.preview.setup.rules.neutralWalls).toEqual(b.preview.setup.rules.neutralWalls);
    expect(a.preview.setup.rules.neutralWalls).not.toEqual(c.preview.setup.rules.neutralWalls);
    expect(new MultiController(cfg(42)).getSnapshot().setup.rules.neutralWalls).toEqual(a.preview.setup.rules.neutralWalls);
    // a map generated elsewhere (the worker) is used as is
    expect(computePreview('obstacle', cfg(42), a.preview.setup.rules)).toEqual(a);
    expect(buildMultiSetup(cfg(42), () => 0, a.preview.setup.rules).rules).toBe(a.preview.setup.rules);
  });

  it('reports invalid asymmetric and wall settings instead of a position', () => {
    const asym = recommendedConfig('asymmetric');
    const dup = { ...asym, asymmetric: asym.asymmetric!.map((p) => ({ ...p, start: asym.asymmetric![0].start })) };
    const r = computePreview('asymmetric', dup);
    expect(r.ok).toBe(false);
    expect(computePreview('race-2', { ...recommendedConfig('race-2'), walls: 99 }).ok).toBe(false);
  });

  it('only layout settings change the layout key', () => {
    const c = recommendedConfig('obstacle');
    const key = layoutKey('obstacle', c);
    expect(layoutKey('obstacle', { ...c, names: ['x', 'y'], firstPlayer: 1 })).toBe(key);
    expect(layoutKey('obstacle', { ...c, obstacle: { ...c.obstacle!, seed: c.obstacle!.seed + 1 } })).not.toBe(key);
    expect(layoutKey('vs-ai', c)).toBe(layoutKey('local-2p', c));
    expect(obstacleKey({ ...c, walls: 3 })).toBe(obstacleKey(c));
    expect(needsObstacleMap('obstacle', c)).toBe(true);
    expect(needsObstacleMap('race-2', c)).toBe(false);
  });

  it('previews the team and asymmetric specifics', () => {
    const team = computePreview('team-2v2', recommendedConfig('team-2v2'));
    if (!team.ok) throw new Error('team');
    expect(team.preview.setup.rules.teams).toEqual([0, 1, 0, 1]);
    const race = computePreview('race-4', recommendedConfig('race-4'));
    if (!race.ok) throw new Error('race');
    expect(race.preview.state.pawns.map((p) => p.col)).toEqual([1, 3, 5, 7]);
  });
});
