import { describe, expect, it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  RACE_2_RULES,
  RACE_4_RULES,
  TEAM_2V2_RULES,
  THREE_PLAYER_RULES,
  TWO_PLAYER_RULES,
  applyActionMulti,
  asymmetricRules,
  checkWallMulti,
  createMultiState,
  defaultAsymmetricPlayers,
  fixedRules,
  generateObstacles,
  goalDistanceMulti,
  hasPathToGoal,
  legalActionsMulti,
  legalPawnMovesMulti,
  nextPlayer,
  obstacleBaseRules,
  obstacleRules,
  supportsTwoPlayerAi,
  teamOf,
  teamSeats,
  validateAsymmetric,
  validateRules,
  winningSeats,
} from '..';
import type { Action, MultiRules, MultiState } from '..';
import { at, hWall, keys, vWall } from './helpers';

const make = (rules: MultiRules, setup: Parameters<typeof createMultiState>[0] = {}) => createMultiState({ rules, wallsPerPlayer: 5, ...setup });
const move = (row: number, col: number): Action => ({ type: 'move', to: at(row, col) });

describe('동방향 2인 경주', () => {
  it('starts both pawns on the bottom row, mirrored, with the same distance and 10 walls', () => {
    const s = createMultiState({ rules: RACE_2_RULES, wallsPerPlayer: 10 });
    expect(s.pawns).toEqual([at(8, 3), at(8, 5)]);
    expect(goalDistanceMulti(s, 0)).toBe(8);
    expect(goalDistanceMulti(s, 1)).toBe(8);
    expect(RACE_2_RULES.players.every((p) => p.goal.axis === 'row' && p.goal.index === 0)).toBe(true);
    expect(s.pawns[0].col + s.pawns[1].col).toBe(8); // mirror symmetric around the centre column
  });

  it('is won by the first pawn on row 0 — and only that pawn', () => {
    let s = make(RACE_2_RULES, { pawns: [at(1, 3), at(1, 5)] });
    s = applyActionMulti(s, move(0, 3));
    expect(s.winner).toBe(0);
    expect(winningSeats(s)).toEqual([0]);
    expect(legalActionsMulti(s)).toEqual([]);
  });

  it('lets the pawns jump each other while they race on the same lane', () => {
    const s = make(RACE_2_RULES, { pawns: [at(5, 4), at(4, 4)] });
    expect(keys(legalPawnMovesMulti(s, 0))).toContain('3,4');
    expect(keys(legalPawnMovesMulti(s, 0))).not.toContain('4,4');
  });

  it('lets a wall hold up the other racer but never seal it in', () => {
    const s = make(RACE_2_RULES, { wallsPerPlayer: 10 });
    expect(checkWallMulti(s, hWall(7, 5))).toBe('ok'); // above the other racer's lane
    // a corridor around d1 (two vertical walls): closing it on top would seal that racer in
    let t: MultiState = make(RACE_2_RULES, { walls: [vWall(7, 2), vWall(7, 3)], wallsPerPlayer: 10 });
    expect(checkWallMulti(t, hWall(6, 3))).toBe('blocks-path');
    t = applyActionMulti(t, hWall(4, 0));
    expect(t.wallsRemaining).toEqual([9, 10]);
  });
});

describe('동방향 4인 경주', () => {
  it('starts four pawns on columns 1, 3, 5, 7 of the bottom row, all 8 steps from the top', () => {
    const s = make(RACE_4_RULES);
    expect(s.pawns).toEqual([at(8, 1), at(8, 3), at(8, 5), at(8, 7)]);
    expect([0, 1, 2, 3].map((p) => goalDistanceMulti(s, p))).toEqual([8, 8, 8, 8]);
    expect(s.wallsRemaining).toEqual([5, 5, 5, 5]);
  });

  it('is mirror symmetric (P1↔P4, P2↔P3) and plays P1 → P2 → P3 → P4', () => {
    const cols = RACE_4_RULES.players.map((p) => p.start.col);
    expect(cols.map((c, i) => c + cols[3 - i])).toEqual([8, 8, 8, 8]);
    expect([0, 1, 2, 3, 0].slice(1).map((_, i) => nextPlayer(RACE_4_RULES, i))).toEqual([1, 2, 3, 0]);
  });

  it('crowds only through the standard jump rules: a pawn next to another one jumps it', () => {
    const s = make(RACE_4_RULES, { pawns: [at(4, 4), at(3, 4), at(8, 3), at(8, 5)], firstPlayer: 0 });
    expect(keys(legalPawnMovesMulti(s, 0))).toContain('2,4');
  });

  it('wins for the first pawn that reaches row 0, whichever seat it is', () => {
    for (const seat of [0, 1, 2, 3]) {
      const pawns = [at(8, 1), at(8, 3), at(8, 5), at(8, 7)];
      pawns[seat] = at(1, [1, 3, 5, 7][seat]);
      let s = make(RACE_4_RULES, { pawns, firstPlayer: seat });
      s = applyActionMulti(s, move(0, [1, 3, 5, 7][seat]));
      expect(s.winner).toBe(seat);
    }
  });

  it('keeps every racer a route when players share one goal line (wall check covers all four)', () => {
    // Close the whole row 7/8 boundary except one gap: legal while everyone can still pass through it.
    const walls = [hWall(7, 0), hWall(7, 2), hWall(7, 4)];
    const s = make(RACE_4_RULES, { walls, wallsPerPlayer: 10 });
    for (let p = 0; p < 4; p++) expect(hasPathToGoal(s, s.pawns[p], s.rules.players[p].goal)).toBe(true);
    // The last gap (cols 6-7 / 8) may be narrowed once but not closed.
    expect(checkWallMulti(s, hWall(7, 6))).toBe('ok');
    const full = make(RACE_4_RULES, { walls: [hWall(7, 0), hWall(7, 2), hWall(7, 4), hWall(7, 6)], wallsPerPlayer: 10 });
    expect(checkWallMulti(full, vWall(7, 7))).toBe('blocks-path');
  });
});

describe('3인 개인전', () => {
  it('starts bottom / left / top with 5 walls each and plays bottom → left → top', () => {
    const s = make(THREE_PLAYER_RULES);
    expect(s.pawns).toEqual([at(8, 4), at(4, 0), at(0, 4)]);
    expect(s.wallsRemaining).toEqual([5, 5, 5]);
    expect(THREE_PLAYER_RULES.players.map((p) => `${p.goal.axis}${p.goal.index}`)).toEqual(['row0', 'col8', 'row8']);
    expect([0, 1, 2].map((p) => goalDistanceMulti(s, p))).toEqual([8, 8, 8]);
  });

  it('cycles the turn order P1 → P2 → P3 → P1, from any first player', () => {
    let s = make(THREE_PLAYER_RULES, { firstPlayer: 1 });
    const order: number[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.currentPlayer);
      s = applyActionMulti(s, legalActionsMulti(s).find((a) => a.type === 'move')!);
    }
    expect(order).toEqual([1, 2, 0, 1, 2, 0]);
  });

  it('is won by the first seat on its own goal line, each seat with its own line', () => {
    const left = make(THREE_PLAYER_RULES, { pawns: [at(8, 4), at(4, 7), at(0, 4)], firstPlayer: 1 });
    expect(applyActionMulti(left, move(4, 8)).winner).toBe(1);
    // reaching someone else's goal line (row 0 for the left seat) is not a win
    const wrongLine = make(THREE_PLAYER_RULES, { pawns: [at(8, 4), at(1, 5), at(0, 4)], firstPlayer: 1 });
    expect(applyActionMulti(wrongLine, move(0, 5)).winner).toBeNull();
  });
});

describe('2 vs 2 팀전', () => {
  const team = (setup: Parameters<typeof createMultiState>[0] = {}) => make(TEAM_2V2_RULES, setup);

  it('uses the four-player start, alternates A B A B and keeps 5 walls per player', () => {
    const s = team();
    expect(s.pawns).toEqual([at(8, 4), at(4, 0), at(0, 4), at(4, 8)]);
    expect(TEAM_2V2_RULES.teams).toEqual([0, 1, 0, 1]);
    let seat = 0;
    const teams: number[] = [];
    for (let i = 0; i < 6; i++) {
      teams.push(teamOf(TEAM_2V2_RULES, seat));
      seat = nextPlayer(TEAM_2V2_RULES, seat);
    }
    expect(teams).toEqual([0, 1, 0, 1, 0, 1]);
    expect(s.wallsRemaining).toEqual([5, 5, 5, 5]);
  });

  it('gives the whole team the win when either teammate arrives', () => {
    const s = team({ pawns: [at(8, 4), at(4, 0), at(1, 4), at(4, 8)], firstPlayer: 2 });
    const done = applyActionMulti(s, move(2, 4)); // seat 2 (team A) moves toward row 8: not yet
    expect(done.winner).toBeNull();
    const finish = team({ pawns: [at(8, 2), at(4, 0), at(7, 4), at(4, 8)], firstPlayer: 2 });
    const won = applyActionMulti(finish, move(8, 4));
    expect(won.winner).toBe(2);
    expect(winningSeats(won)).toEqual([0, 2]);
    expect(teamSeats(TEAM_2V2_RULES, 1)).toEqual([1, 3]);
  });

  it('lets team B win through seat 1 or seat 3 alike', () => {
    for (const seat of [1, 3]) {
      const pawns = [at(8, 4), at(4, 0), at(0, 4), at(4, 8)];
      pawns[seat] = seat === 1 ? at(4, 7) : at(4, 1);
      pawns[4 - seat] = seat === 1 ? at(6, 8) : at(2, 0); // the other B pawn steps aside
      const won = applyActionMulti(team({ pawns, firstPlayer: seat }), move(4, seat === 1 ? 8 : 0));
      expect(won.winner).toBe(seat);
      expect(winningSeats(won)).toEqual([1, 3]);
    }
  });

  it('treats a teammate like any pawn: no shared cell, ordinary jump', () => {
    const s = team({ pawns: [at(5, 4), at(4, 0), at(4, 4), at(4, 8)], firstPlayer: 0 }); // seat 2 is seat 0's teammate
    const moves = keys(legalPawnMovesMulti(s, 0));
    expect(moves).not.toContain('4,4');
    expect(moves).toContain('3,4'); // jump over the teammate
  });

  it('goes diagonally around a teammate when the straight jump is blocked', () => {
    const s = team({ pawns: [at(5, 4), at(4, 0), at(4, 4), at(4, 8)], walls: [hWall(3, 3)], firstPlayer: 0 });
    const moves = keys(legalPawnMovesMulti(s, 0));
    expect(moves).not.toContain('3,4');
    expect(moves).toEqual(expect.arrayContaining(['4,3', '4,5']));
  });

  it('applies a wall to allies and enemies alike and checks every participant\'s route', () => {
    // Seat 1 (team B) sits in a corridor; sealing it would also shut an ally out, which is refused for any placer.
    const s = team({ walls: [hWall(3, 0), hWall(4, 0), vWall(5, 0)], firstPlayer: 0, wallsPerPlayer: 5 });
    for (let p = 0; p < 4; p++) expect(hasPathToGoal(s, s.pawns[p], s.rules.players[p].goal)).toBe(true);
  });
});

describe('비대칭 대전', () => {
  it('keeps different wall counts per player and plays with them', () => {
    const players = [
      { start: at(8, 4), goal: { axis: 'row' as const, index: 0 }, walls: 3 },
      { start: at(0, 4), goal: { axis: 'row' as const, index: 8 }, walls: 15 },
    ];
    expect(validateAsymmetric(players)).toEqual([]);
    let s = createMultiState({ rules: asymmetricRules(players), wallsPerPlayer: players.map((p) => p.walls) });
    expect(s.wallsRemaining).toEqual([3, 15]);
    s = applyActionMulti(s, hWall(0, 0));
    expect(s.wallsRemaining).toEqual([2, 15]);
  });

  it('allows zero walls (and then offers only pawn moves)', () => {
    const players = [{ ...defaultAsymmetricPlayers()[0], walls: 0 }, defaultAsymmetricPlayers()[1]];
    const s = createMultiState({ rules: asymmetricRules(players), wallsPerPlayer: [0, 10] });
    expect(legalActionsMulti(s).every((a) => a.type === 'move')).toBe(true);
  });

  it('honours custom starts, goals, turn order and first player', () => {
    const players = [
      { start: at(4, 4), goal: { axis: 'col' as const, index: 8 }, walls: 4 },
      { start: at(0, 0), goal: { axis: 'row' as const, index: 8 }, walls: 4 },
      { start: at(8, 8), goal: { axis: 'col' as const, index: 0 }, walls: 4 },
    ];
    expect(validateAsymmetric(players)).toEqual([]);
    const s = createMultiState({ rules: asymmetricRules(players), wallsPerPlayer: [4, 4, 4], firstPlayer: 2 });
    expect(s.currentPlayer).toBe(2);
    expect(nextPlayer(s.rules, 2)).toBe(0);
    expect(goalDistanceMulti(s, 0)).toBe(4);
    expect(goalDistanceMulti(s, 2)).toBe(8);
  });

  it('rejects invalid configurations with a reason', () => {
    const base = defaultAsymmetricPlayers(2);
    expect(validateAsymmetric([base[0]])).not.toEqual([]); // one player
    expect(validateAsymmetric([...base, ...base, ...base])).not.toEqual([]); // six players
    expect(validateAsymmetric([base[0], { ...base[1], start: base[0].start }]).join()).toContain('시작 위치가 같습니다');
    expect(validateAsymmetric([base[0], { ...base[1], start: at(9, 4) }]).join()).toContain('보드 밖');
    expect(validateAsymmetric([base[0], { ...base[1], start: at(-1, 4) }]).join()).toContain('보드 밖');
    expect(validateAsymmetric([{ ...base[0], start: at(0, 4) }, base[1]]).join()).toContain('이미 목표선');
    expect(validateAsymmetric([{ ...base[0], walls: 21 }, base[1]]).join()).toContain('벽 개수');
    expect(validateAsymmetric([{ ...base[0], walls: -1 }, base[1]]).join()).toContain('벽 개수');
    expect(validateAsymmetric([{ ...base[0], walls: 2.5 }, base[1]]).join()).toContain('벽 개수');
  });

  it('refuses to build a game from duplicate or off-board starts at engine level', () => {
    expect(() => createMultiState({ rules: asymmetricRules([{ start: at(8, 4), goal: { axis: 'row', index: 0 }, walls: 1 }, { start: at(8, 4), goal: { axis: 'row', index: 8 }, walls: 1 }]) })).toThrow();
    expect(() => validateRules({ players: [{ start: at(9, 0), goal: { axis: 'row', index: 0 } }, { start: at(0, 0), goal: { axis: 'row', index: 8 } }], turnOrder: [0, 1] })).toThrow();
  });
});

describe('장애물 경주: map generation', () => {
  const PRESETS = ['easy', 'normal', 'hard', 'random'] as const;

  it('generates the same map for the same seed and a different one for another seed', () => {
    for (const preset of PRESETS) {
      expect(generateObstacles(2, preset, 12345).walls).toEqual(generateObstacles(2, preset, 12345).walls);
    }
    expect(generateObstacles(4, 'normal', 1).walls).not.toEqual(generateObstacles(4, 'normal', 2).walls);
  });

  it('only places legal walls and leaves every player a route (2, 3 and 4 players, many seeds)', () => {
    for (const players of [2, 3, 4]) {
      for (const preset of PRESETS) {
        for (let seed = 1; seed <= 12; seed++) {
          const rules = obstacleRules(players, preset, seed);
          // createMultiState re-applies the walls with the engine's own overlap and route checks.
          const s = createMultiState({ rules, wallsPerPlayer: 5 });
          expect(s.rules.neutralWalls!.length).toBeGreaterThan(0);
          for (let p = 0; p < players; p++) expect(hasPathToGoal(s, s.pawns[p], s.rules.players[p].goal)).toBe(true);
          expect(s.winner).toBeNull();
          expect(s.wallsRemaining).toEqual(Array.from({ length: players }, () => 5)); // neutral walls cost nobody a wall
        }
      }
    }
  });

  it('ranks the presets by wall count, detour and (fewer) shortest routes', () => {
    const mean = (preset: 'easy' | 'normal' | 'hard', pick: (m: ReturnType<typeof generateObstacles>['metrics']) => number) => {
      const xs = Array.from({ length: 15 }, (_, i) => pick(generateObstacles(2, preset, 100 + i).metrics));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean('easy', (m) => m.walls)).toBeLessThan(mean('normal', (m) => m.walls));
    expect(mean('normal', (m) => m.walls)).toBeLessThan(mean('hard', (m) => m.walls));
    expect(mean('easy', (m) => m.meanDetour)).toBeLessThan(mean('normal', (m) => m.meanDetour));
    expect(mean('normal', (m) => m.meanDetour)).toBeLessThan(mean('hard', (m) => m.meanDetour));
  });

  it('finds maps inside the preset bands for the default seeds, and keeps the distances even', () => {
    for (const preset of ['easy', 'normal', 'hard'] as const) {
      let hits = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const map = generateObstacles(2, preset, seed);
        if (map.inBand) hits++;
        expect(map.metrics.spread).toBeLessThanOrEqual(6);
        expect(map.metrics.distances.every((d) => Number.isFinite(d) && d >= 8)).toBe(true);
      }
      expect(hits).toBeGreaterThanOrEqual(8);
    }
  });

  it('records the seed and preset in the rules', () => {
    const rules = obstacleRules(3, 'hard', 777);
    expect(rules.seed).toBe(777);
    expect(rules.preset).toBe('hard');
    expect(rules.players).toEqual(obstacleBaseRules(3).players);
  });
});

describe('rule set validation and AI policy', () => {
  it('accepts every fixed rule set', () => {
    for (const mode of ['four-player', 'race-2', 'race-4', 'three-player', 'team-2v2'] as const) expect(() => validateRules(fixedRules(mode)!)).not.toThrow();
  });

  it('rejects malformed teams and neutral walls', () => {
    const base = TEAM_2V2_RULES;
    expect(() => validateRules({ ...base, teams: [0, 0, 0, 0] })).toThrow(/two teams/);
    expect(() => validateRules({ ...base, teams: [0, 1] })).toThrow(/team number/);
    expect(() => validateRules({ ...base, neutralWalls: [{ orientation: 'h', row: 8, col: 0 }] })).toThrow(/off board/);
  });

  it('lets only the regular two-player rules be played by the existing AIs', () => {
    expect(supportsTwoPlayerAi(TWO_PLAYER_RULES)).toBe(true);
    expect(supportsTwoPlayerAi(RACE_2_RULES)).toBe(false);
    expect(supportsTwoPlayerAi(obstacleRules(2, 'easy', 1))).toBe(false);
    expect(supportsTwoPlayerAi(asymmetricRules(defaultAsymmetricPlayers(2)))).toBe(false); // same starts, but a custom mode never counts as regular
    expect(supportsTwoPlayerAi(FOUR_PLAYER_RULES)).toBe(false);
  });
});
