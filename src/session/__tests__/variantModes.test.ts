import { describe, expect, it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  MULTI_MODES,
  defaultAsymmetricPlayers,
  formatAction,
  goalDistanceMulti,
  legalPawnMovesMulti,
  legalWallPlacementsMulti,
  winningSeats,
} from '../../engine';
import type { Action, MultiGameMode, MultiState } from '../../engine';
import { GAME_RECORD_FORMAT, parseRecord } from '../../match/gameRecord';
import { buildMultiRecord, parseMultiRecord } from '../../match/multiRecord';
import type { MultiRecordFile } from '../../match/multiRecord';
import { MultiController, buildMultiSetup, playerCountOf, recommendedConfig, validateMultiConfig } from '../MultiController';
import type { MultiConfig } from '../MultiController';

const NAMES = ['가', '나', '다', '라'];
const configFor = (mode: MultiGameMode, over: Partial<MultiConfig> = {}): MultiConfig => ({ ...recommendedConfig(mode, NAMES), ...over });

/** Variants of every mode worth a full playthrough (obstacle with 2, 3 and 4 players; asymmetric with 3). */
const CASES: { name: string; config: MultiConfig }[] = [
  { name: 'four-player', config: configFor('four-player') },
  { name: 'race-2', config: configFor('race-2') },
  { name: 'race-4', config: configFor('race-4') },
  { name: 'three-player', config: configFor('three-player') },
  { name: 'team-2v2', config: configFor('team-2v2') },
  {
    name: 'asymmetric (3 players, 0 walls for P2)',
    config: configFor('asymmetric', {
      asymmetric: [
        { start: { row: 8, col: 2 }, goal: { axis: 'row', index: 0 }, walls: 4 },
        { start: { row: 4, col: 0 }, goal: { axis: 'col', index: 8 }, walls: 0 },
        { start: { row: 0, col: 6 }, goal: { axis: 'row', index: 8 }, walls: 12 },
      ],
    }),
  },
  { name: 'obstacle (2, normal)', config: configFor('obstacle', { obstacle: { players: 2, preset: 'normal', seed: 42 } }) },
  { name: 'obstacle (3, hard)', config: configFor('obstacle', { obstacle: { players: 3, preset: 'hard', seed: 7 }, walls: 5 }) },
  { name: 'obstacle (4, random)', config: configFor('obstacle', { obstacle: { players: 4, preset: 'random', seed: 99 }, walls: 5 }) },
];

/** Advances the mover along its shortest route; every 5th turn it places a (varying) legal wall instead. */
function chooseAction(game: MultiState, turn: number): Action {
  const me = game.currentPlayer;
  const scored = legalPawnMovesMulti(game).map((to) => ({ to, d: goalDistanceMulti({ ...game, pawns: game.pawns.map((p, i) => (i === me ? to : p)) }, me) }));
  scored.sort((x, y) => x.d - y.d);
  const step: Action = { type: 'move', to: scored[0].to };
  if (turn % 5 !== 4 || game.wallsRemaining[me] === 0) return step;
  const walls = legalWallPlacementsMulti(game);
  return walls.length ? walls[(turn * 7) % walls.length] : step;
}

function playToEnd(controller: MultiController, maxTurns = 2000): number {
  let turns = 0;
  while (controller.getSnapshot().status.kind === 'playing' && turns < maxTurns) {
    const ok = controller.play(chooseAction(controller.getSnapshot().game, turns));
    expect(ok).toBe(true);
    turns++;
  }
  return turns;
}

describe.each(CASES)('$name: start to victory', ({ config }) => {
  it('starts as configured and finishes with a winner', () => {
    const c = new MultiController(config);
    const s0 = c.getSnapshot();
    expect(s0.game.pawns).toHaveLength(playerCountOf(config));
    expect(s0.game.winner).toBeNull();
    expect(s0.setup.rules.neutralWalls?.length ?? 0).toBe(config.mode === 'obstacle' ? s0.setup.rules.neutralWalls!.length : 0);
    const turns = playToEnd(c);
    const s = c.getSnapshot();
    expect(turns).toBeLessThan(2000);
    expect(s.status.kind).toBe('win');
    expect(s.game.winner).not.toBeNull();
    if (config.mode === 'team-2v2') expect(winningSeats(s.game)).toHaveLength(2);
    else expect(winningSeats(s.game)).toEqual([s.game.winner]);
  });

  it('exports and imports without losing anything (rules, names, moves, walls, position)', () => {
    const c = new MultiController(config);
    playToEnd(c);
    const snap = c.getSnapshot();
    const actions = snap.history.map((h) => ({ action: h.action, player: h.player }));
    const file = buildMultiRecord(snap.setup, actions, { names: snap.names, mode: config.mode });
    expect(file.version).toBe(config.mode === 'four-player' ? 2 : 3);
    expect(file.mode).toBe(config.mode);
    const parsed = parseMultiRecord(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = new MultiController();
    restored.load(parsed);
    const r = restored.getSnapshot();
    expect(r.config.mode).toBe(config.mode);
    expect(r.names).toEqual(snap.names);
    expect(r.setup.rules).toEqual(snap.setup.rules);
    expect(r.setup.wallsPerPlayer).toEqual(snap.setup.wallsPerPlayer);
    expect(r.setup.firstPlayer).toBe(snap.setup.firstPlayer);
    expect(r.history.map((h) => formatAction(h.action))).toEqual(snap.history.map((h) => formatAction(h.action)));
    expect(r.game.pawns).toEqual(snap.game.pawns);
    expect(r.game.wallsRemaining).toEqual(snap.game.wallsRemaining);
    expect([...r.game.hWalls]).toEqual([...snap.game.hWalls]);
    expect([...r.game.vWalls]).toEqual([...snap.game.vWalls]);
    expect(r.game.winner).toBe(snap.game.winner);
    // a plain restart after an import replays the imported start (same map, same walls, same first player)
    restored.restart();
    expect(restored.getSnapshot().setup).toEqual(snap.setup);
    expect(restored.getSnapshot().history).toHaveLength(0);
  });

  it('undoes moves and restarts cleanly', () => {
    const c = new MultiController(config);
    const start = c.getSnapshot().game;
    for (let i = 0; i < 4; i++) c.play(chooseAction(c.getSnapshot().game, i));
    const before = c.getSnapshot().game;
    const moved = c.getSnapshot().history.length;
    expect(c.play(chooseAction(before, 0))).toBe(true);
    expect(c.undo()).toBe(true);
    expect(c.getSnapshot().game).toBe(before);
    expect(c.getSnapshot().history).toHaveLength(moved);
    while (c.undo());
    expect(c.getSnapshot().game).toBe(start);
    c.play(chooseAction(c.getSnapshot().game, 0));
    const id = c.getSnapshot().gameId;
    expect(c.restart()).toBe(true);
    const s = c.getSnapshot();
    expect(s.gameId).toBe(id + 1);
    expect(s.history).toHaveLength(0);
    expect(s.game.pawns).toEqual(start.pawns);
    expect([...s.game.hWalls]).toEqual([...start.hWalls]);
    expect([...s.game.vWalls]).toEqual([...start.vWalls]);
    expect(s.game.wallsRemaining).toEqual(start.wallsRemaining);
  });
});

describe('turn order and first player', () => {
  it('three-player: P1 → P2 → P3, first player selectable', () => {
    for (const first of [0, 1, 2]) {
      const c = new MultiController(configFor('three-player', { firstPlayer: first }));
      const order: number[] = [];
      for (let i = 0; i < 6; i++) {
        order.push(c.getSnapshot().game.currentPlayer);
        c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
      }
      expect(order).toEqual([0, 1, 2, 0, 1, 2].map((_, i) => (first + i) % 3));
    }
  });

  it('random first player follows the random source', () => {
    const picks = new Set<number>();
    for (const r of [0, 0.4, 0.7]) picks.add(new MultiController(configFor('three-player', { firstPlayer: 'random' }), { random: () => r }).getSnapshot().game.currentPlayer);
    expect(picks.size).toBe(3);
  });

  it('team game alternates the teams A, B, A, B', () => {
    const c = new MultiController(configFor('team-2v2'));
    const teams: number[] = [];
    for (let i = 0; i < 8; i++) {
      teams.push(c.getSnapshot().game.rules.teams![c.getSnapshot().game.currentPlayer]);
      c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    }
    expect(teams).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('rejects an illegal action without changing anything', () => {
    const c = new MultiController(configFor('race-2'));
    const before = c.getSnapshot();
    expect(c.play({ type: 'move', to: { row: 0, col: 0 } })).toBe(false);
    expect(c.play({ type: 'wall', orientation: 'h', row: 9, col: 0 })).toBe(false);
    expect(c.getSnapshot()).toBe(before);
  });
});

describe('settings per mode', () => {
  it('applies the recommended settings of each mode', () => {
    expect(buildMultiSetup(configFor('race-2')).wallsPerPlayer).toEqual([10, 10]);
    expect(buildMultiSetup(configFor('race-4')).wallsPerPlayer).toEqual([5, 5, 5, 5]);
    expect(buildMultiSetup(configFor('three-player')).wallsPerPlayer).toEqual([5, 5, 5]);
    expect(buildMultiSetup(configFor('team-2v2')).wallsPerPlayer).toEqual([5, 5, 5, 5]);
    expect(buildMultiSetup(configFor('four-player')).wallsPerPlayer).toEqual([5, 5, 5, 5]);
  });

  it('honours a custom wall count and validates its range', () => {
    expect(buildMultiSetup(configFor('race-4', { walls: 0 })).wallsPerPlayer).toEqual([0, 0, 0, 0]);
    expect(buildMultiSetup(configFor('race-4', { walls: 20 })).wallsPerPlayer).toEqual([20, 20, 20, 20]);
    expect(validateMultiConfig(configFor('race-4', { walls: 21 }))).not.toEqual([]);
    expect(validateMultiConfig(configFor('race-4', { walls: -1 }))).not.toEqual([]);
  });

  it('keeps different wall counts per player in the asymmetric mode', () => {
    const c = new MultiController(CASES.find((x) => x.name.startsWith('asymmetric'))!.config);
    expect(c.getSnapshot().game.wallsRemaining).toEqual([4, 0, 12]);
  });

  it('refuses an invalid asymmetric configuration and keeps the running game', () => {
    const c = new MultiController(configFor('race-2'));
    c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    const before = c.getSnapshot();
    const base = defaultAsymmetricPlayers(2);
    for (const bad of [
      [base[0], { ...base[1], start: base[0].start }],
      [{ ...base[0], start: { row: 0, col: 4 } }, base[1]],
      [base[0], { ...base[1], start: { row: 9, col: 0 } }],
      [{ ...base[0], walls: 25 }, base[1]],
    ]) {
      expect(c.restart(configFor('asymmetric', { asymmetric: bad }))).toBe(false);
    }
    expect(c.getSnapshot()).toBe(before);
  });

  it('regenerates the same obstacle map from the same seed, also after a restart', () => {
    const cfg = configFor('obstacle', { obstacle: { players: 3, preset: 'normal', seed: 2024 }, walls: 5 });
    const a = new MultiController(cfg).getSnapshot().setup.rules.neutralWalls;
    const b = new MultiController(cfg).getSnapshot().setup.rules.neutralWalls;
    expect(a).toEqual(b);
    const c = new MultiController(cfg);
    c.restart();
    expect(c.getSnapshot().setup.rules.neutralWalls).toEqual(a);
    expect(new MultiController(configFor('obstacle', { obstacle: { players: 3, preset: 'normal', seed: 2025 }, walls: 5 })).getSnapshot().setup.rules.neutralWalls).not.toEqual(a);
  });
});

describe('records: versions, compatibility and corruption', () => {
  const play = (config: MultiConfig, turns = 6) => {
    const c = new MultiController(config);
    for (let i = 0; i < turns; i++) c.play(chooseAction(c.getSnapshot().game, i));
    const snap = c.getSnapshot();
    const file = buildMultiRecord(snap.setup, snap.history.map((h) => ({ action: h.action, player: h.player })), { names: snap.names, mode: config.mode });
    return file;
  };
  const parse = (f: unknown) => parseMultiRecord(JSON.stringify(f));
  const clone = (f: MultiRecordFile) => JSON.parse(JSON.stringify(f)) as MultiRecordFile;

  it('still reads a version 2 four-player record written before the variants existed', () => {
    const v2 = {
      format: GAME_RECORD_FORMAT,
      version: 2,
      createdAt: '2026-11-01T00:00:00.000Z',
      source: 'play',
      mode: 'four-player',
      rules: {
        players: [
          { seat: 0, start: [8, 4], goal: { axis: 'row', index: 0 } },
          { seat: 1, start: [0, 4], goal: { axis: 'row', index: 8 } },
          { seat: 2, start: [4, 0], goal: { axis: 'col', index: 8 } },
          { seat: 3, start: [4, 8], goal: { axis: 'col', index: 0 } },
        ],
        turnOrder: [0, 2, 1, 3],
      },
      wallsPerPlayer: [5, 5, 5, 5],
      firstPlayer: 0,
      participants: [
        { seat: 0, slot: 0, name: '가' },
        { seat: 2, slot: 1, name: '나' },
        { seat: 1, slot: 2, name: '다' },
        { seat: 3, slot: 3, name: '라' },
      ],
      moves: [
        { ply: 1, player: 0, notation: 'e2' },
        { ply: 2, player: 2, notation: 'b5' },
      ],
      ply: 2,
      result: { kind: 'playing' },
      final: { pawns: [[7, 4], [0, 4], [4, 1], [4, 8]], wallsRemaining: [5, 5, 5, 5], currentPlayer: 1, winner: null },
    };
    const parsed = parseMultiRecord(JSON.stringify(v2));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mode).toBe('four-player');
    expect(parsed.setup.rules.turnOrder).toEqual(FOUR_PLAYER_RULES.turnOrder);
    expect(parsed.names).toEqual(['가', '나', '다', '라']);
    const c = new MultiController();
    c.load(parsed);
    expect(c.getSnapshot().history).toHaveLength(2);
  });

  it('still reads a version 1 two-player record with the two-player reader, and refuses it here with a reason', () => {
    const v1 = { format: GAME_RECORD_FORMAT, version: 1, start: 'standard', moves: [{ ply: 1, player: 0, notation: 'e2' }], ply: 1 };
    expect(parseRecord(JSON.stringify(v1)).ok).toBe(true);
    const multi = parseMultiRecord(JSON.stringify(v1));
    expect(multi.ok).toBe(false);
    if (!multi.ok) expect(multi.error).toContain('2인전');
  });

  it('refuses version 2 and 3 records in the two-player reader', () => {
    for (const mode of ['four-player', 'team-2v2'] as const) {
      const r = parseRecord(JSON.stringify(play(configFor(mode))));
      expect(r.ok).toBe(false);
    }
  });

  it('stores the variant data a replay needs in version 3', () => {
    const team = play(configFor('team-2v2'));
    expect(team.rules.teams).toEqual([0, 1, 0, 1]);
    const obstacle = play(configFor('obstacle', { obstacle: { players: 2, preset: 'easy', seed: 5 } }));
    expect(obstacle.rules.neutralWalls!.length).toBeGreaterThan(0);
    expect(obstacle.rules.seed).toBe(5);
    expect(obstacle.rules.preset).toBe('easy');
    const asym = play(CASES.find((x) => x.name.startsWith('asymmetric'))!.config);
    expect(asym.wallsPerPlayer).toEqual([4, 0, 12]);
    expect(asym.rules.players.map((p) => p.start)).toEqual([[8, 2], [4, 0], [0, 6]]);
  });

  it('accepts the unmodified record of every mode and rejects each kind of damage', () => {
    for (const mode of MULTI_MODES) expect(parse(play(configFor(mode))).ok).toBe(true);

    const base = play(configFor('team-2v2'), 8);
    const bad = (mutate: (f: MultiRecordFile) => void) => {
      const f = clone(base);
      mutate(f);
      return parse(f);
    };
    expect(bad((f) => (f.moves[2].notation = 'a1')).ok).toBe(false); // illegal move
    expect(bad((f) => (f.moves[1].player = 0)).ok).toBe(false); // wrong player for the turn
    expect(bad((f) => (f.final.pawns[0] = [0, 0])).ok).toBe(false); // final position differs from the replay
    expect(bad((f) => (f.rules.teams = [0, 0, 0, 0])).ok).toBe(false); // only one team
    expect(bad((f) => (f.rules.teams = [0, 1])).ok).toBe(false); // team list too short
    expect(bad((f) => delete f.rules.teams).ok).toBe(false); // team mode without teams
    expect(bad((f) => (f.mode = 'obstacle')).ok).toBe(false); // label does not match the rules
    expect(bad((f) => ((f as { mode: string }).mode = 'nope')).ok).toBe(false);
    expect(bad((f) => (f.wallsPerPlayer = [5, 5, 5, 99])).ok).toBe(false);
    expect(bad((f) => (f.rules.players[1].start = [8, 4])).ok).toBe(false); // two pawns on one cell
    expect(bad((f) => (f.rules.players[0].start = [0, 4])).ok).toBe(false); // starts on the goal line
    expect(bad((f) => (f.rules.turnOrder = [0, 0, 1, 2])).ok).toBe(false);
    expect(bad((f) => ((f as { version: number }).version = 9)).ok).toBe(false);
    expect(bad((f) => ((f as { version: number }).version = 2)).ok).toBe(false); // version 2 can only hold the official four-player game
    expect(parseMultiRecord('{ not json').ok).toBe(false);
    expect(parseMultiRecord('{"format":"other"}').ok).toBe(false);
  });

  it('rejects obstacle records whose walls overlap, leave the board or seal a player in', () => {
    const base = play(configFor('obstacle', { obstacle: { players: 2, preset: 'normal', seed: 3 } }), 4);
    const withWalls = (walls: { orientation: 'h' | 'v'; row: number; col: number }[]) => {
      const f = clone(base);
      f.rules.neutralWalls = walls;
      f.moves = [];
      f.ply = 0;
      f.result = { kind: 'playing' };
      f.final = { pawns: f.rules.players.map((p) => p.start), wallsRemaining: f.wallsPerPlayer, currentPlayer: f.firstPlayer, winner: null };
      return parse(f);
    };
    const first = base.rules.neutralWalls![0];
    expect(withWalls([first, { ...first }]).ok).toBe(false); // same wall twice
    expect(withWalls([{ orientation: 'h', row: 8, col: 0 }]).ok).toBe(false); // off the board
    // a sealed pocket around the bottom pawn (e1): walls on three sides plus the top
    expect(
      withWalls([
        { orientation: 'v', row: 7, col: 3 },
        { orientation: 'v', row: 7, col: 4 },
        { orientation: 'h', row: 6, col: 3 },
      ]).ok,
    ).toBe(false);
  });
});
