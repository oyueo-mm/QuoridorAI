import { describe, expect, it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  formatAction,
  goalDistanceMulti,
  legalPawnMovesMulti,
  legalWallPlacementsMulti,
  nextPlayer,
  withWall,
} from '../../engine';
import type { Action, MultiState } from '../../engine';
import { GAME_RECORD_FORMAT, parseRecord } from '../../match/gameRecord';
import { MULTI_RECORD_VERSION, buildMultiRecord, parseMultiRecord } from '../../match/multiRecord';
import { MultiController, defaultMultiConfig } from '../MultiController';
import type { MultiConfig } from '../MultiController';

/** The pawn move that leaves the mover closest to its goal (ties: first generated). */
function bestPawnMove(game: MultiState): Action {
  const me = game.currentPlayer;
  const scored = legalPawnMovesMulti(game).map((to) => {
    const pawns = game.pawns.map((p, i) => (i === me ? to : p));
    return { to, d: goalDistanceMulti({ ...game, pawns }, me) };
  });
  scored.sort((a, b) => a.d - b.d);
  return { type: 'move', to: scored[0].to };
}

/** A plausible, deterministic player: advance; every 4th turn wall in the opponent closest to its goal. */
function chooseAction(game: MultiState, turn: number): Action {
  const me = game.currentPlayer;
  if (turn % 4 !== 3 || game.wallsRemaining[me] === 0) return bestPawnMove(game);
  const leader = [0, 1, 2, 3]
    .filter((p) => p !== me)
    .sort((a, b) => goalDistanceMulti(game, a) - goalDistanceMulti(game, b))[0];
  const base = goalDistanceMulti(game, leader);
  let best: Action | null = null;
  let gain = 0;
  for (const w of legalWallPlacementsMulti(game)) {
    const g = goalDistanceMulti({ ...game, ...withWall(game, w.orientation, w.row, w.col) }, leader) - base;
    if (g > gain) {
      gain = g;
      best = w;
    }
  }
  return best ?? bestPawnMove(game);
}

function playToEnd(controller: MultiController, maxTurns = 1500): number {
  let turns = 0;
  while (controller.getSnapshot().status.kind === 'playing' && turns < maxTurns) {
    expect(controller.play(chooseAction(controller.getSnapshot().game, turns))).toBe(true);
    turns++;
  }
  return turns;
}

const NAMES = ['가', '나', '다', '라'];
const config = (over: Partial<MultiConfig> = {}): MultiConfig => ({ ...defaultMultiConfig(), names: NAMES, ...over });

describe('MultiController: start and turn order', () => {
  it('starts a four-player game in the initial position with P1 (bottom) to move', () => {
    const s = new MultiController(config()).getSnapshot();
    expect(s.game.pawns).toHaveLength(4);
    expect(s.game.wallsRemaining).toEqual([5, 5, 5, 5]);
    expect(s.game.currentPlayer).toBe(0);
    expect(s.names).toEqual(NAMES);
    expect(s.canUndo).toBe(false);
  });

  it('uses the chosen first player and a random one when asked', () => {
    expect(new MultiController(config({ firstPlayer: 2 })).getSnapshot().game.currentPlayer).toBe(FOUR_PLAYER_RULES.turnOrder[2]);
    const picks = new Set<number>();
    for (const r of [0, 0.3, 0.6, 0.99]) picks.add(new MultiController(config({ firstPlayer: 'random' }), { random: () => r }).getSnapshot().game.currentPlayer);
    expect(picks.size).toBe(4);
  });

  it('falls back to default names for blank ones', () => {
    const s = new MultiController(config({ names: ['', '  ', '다', ''] })).getSnapshot();
    expect(s.names).toEqual(['플레이어 1', '플레이어 2', '다', '플레이어 4']);
  });

  it('rejects illegal actions and leaves everything unchanged', () => {
    const c = new MultiController(config());
    const before = c.getSnapshot();
    expect(c.play({ type: 'move', to: { row: 0, col: 4 } })).toBe(false); // another pawn's cell
    expect(c.play({ type: 'move', to: { row: 6, col: 4 } })).toBe(false); // two steps
    expect(c.play({ type: 'wall', orientation: 'h', row: 8, col: 8 })).toBe(false);
    expect(c.getSnapshot()).toBe(before);
  });

  it('plays seats in clockwise order and records who moved', () => {
    const c = new MultiController(config());
    const moves: Action[] = [
      { type: 'move', to: { row: 7, col: 4 } },
      { type: 'move', to: { row: 4, col: 1 } },
      { type: 'move', to: { row: 1, col: 4 } },
      { type: 'move', to: { row: 4, col: 7 } },
    ];
    moves.forEach((m) => expect(c.play(m)).toBe(true));
    expect(c.getSnapshot().history.map((e) => e.player)).toEqual([0, 2, 1, 3]);
    expect(c.getSnapshot().game.currentPlayer).toBe(nextPlayer(FOUR_PLAYER_RULES, 3));
  });
});

describe('MultiController: undo and restart', () => {
  it('undoes one move at a time and restores position, walls in hand and turn', () => {
    const c = new MultiController(config());
    c.play({ type: 'move', to: { row: 7, col: 4 } });
    const afterOne = c.getSnapshot().game;
    c.play({ type: 'wall', orientation: 'h', row: 3, col: 3 }); // seat 2 (left) places a wall
    expect(c.getSnapshot().game.wallsRemaining).toEqual([5, 5, 4, 5]);
    expect(c.undo()).toBe(true);
    expect(c.getSnapshot().game).toBe(afterOne);
    expect(c.getSnapshot().game.wallsRemaining).toEqual([5, 5, 5, 5]);
    expect(c.getSnapshot().game.currentPlayer).toBe(2);
    expect(c.undo()).toBe(true);
    expect(c.getSnapshot().game.currentPlayer).toBe(0);
    expect(c.undo()).toBe(false);
  });

  it('restarts from scratch with new settings', () => {
    const c = new MultiController(config());
    c.play({ type: 'move', to: { row: 7, col: 4 } });
    const id = c.getSnapshot().gameId;
    c.restart(config({ names: ['a', 'b', 'c', 'd'], firstPlayer: 1 }));
    const s = c.getSnapshot();
    expect(s.gameId).toBe(id + 1);
    expect(s.history).toEqual([]);
    expect(s.game.ply).toBe(0);
    expect(s.names).toEqual(['a', 'b', 'c', 'd']);
    expect(s.game.currentPlayer).toBe(FOUR_PLAYER_RULES.turnOrder[1]);
  });
});

describe('MultiController: a whole four-player game', () => {
  it('runs from the first move to a single winner, then accepts nothing more', () => {
    const c = new MultiController(config());
    const turns = playToEnd(c);
    const s = c.getSnapshot();
    expect(s.status.kind).toBe('win');
    expect(turns).toBe(s.history.length);
    const winner = (s.status as { winner: number }).winner;
    // the winner stands on its own goal line, nobody else is on theirs
    const goals = FOUR_PLAYER_RULES.players.map((p) => p.goal);
    s.game.pawns.forEach((p, i) => {
      const on = (goals[i].axis === 'row' ? p.row : p.col) === goals[i].index;
      expect(on).toBe(i === winner);
    });
    // every move was made by the seat whose turn it was
    s.history.forEach((e, i) => expect(e.player).toBe(i === 0 ? 0 : nextPlayer(FOUR_PLAYER_RULES, s.history[i - 1].player)));
    expect(s.game.wallsRemaining.every((w) => w >= 0 && w <= 5)).toBe(true);
    expect(s.history.some((e) => e.action.type === 'wall')).toBe(true);
    expect(c.play({ type: 'move', to: { row: 4, col: 4 } })).toBe(false);
    expect(c.play({ type: 'wall', orientation: 'h', row: 0, col: 0 })).toBe(false);
  });

  it('can undo the winning move and then continue the game', () => {
    const c = new MultiController(config());
    playToEnd(c);
    const finished = c.getSnapshot();
    const winner = (finished.status as { winner: number }).winner;
    expect(c.undo()).toBe(true);
    const s = c.getSnapshot();
    expect(s.status.kind).toBe('playing');
    expect(s.game.winner).toBeNull();
    expect(s.game.currentPlayer).toBe(winner);
    expect(c.play(finished.history.at(-1)!.action)).toBe(true);
    expect(c.getSnapshot().status).toEqual({ kind: 'win', winner });
  });

  it('undoing every move returns to the exact start', () => {
    const c = new MultiController(config());
    const start = c.getSnapshot().game;
    playToEnd(c);
    while (c.undo());
    expect(c.getSnapshot().game).toBe(start);
  });
});

describe('four-player game record (version 2)', () => {
  function finishedGame() {
    const c = new MultiController(config({ firstPlayer: 1 }));
    playToEnd(c);
    const s = c.getSnapshot();
    const actions = s.history.map((h) => ({ action: h.action, player: h.player }));
    return { s, actions, record: buildMultiRecord(s.setup, actions, { names: s.names }) };
  }

  it('contains mode, participants, start layout, turn order and the moves with their players', () => {
    const { s, record } = finishedGame();
    expect(record.format).toBe(GAME_RECORD_FORMAT);
    expect(record.version).toBe(MULTI_RECORD_VERSION);
    expect(record.mode).toBe('four-player');
    expect(record.rules.turnOrder).toEqual([0, 2, 1, 3]);
    expect(record.rules.players.map((p) => p.start)).toEqual([[8, 4], [0, 4], [4, 0], [4, 8]]);
    expect(record.rules.players.map((p) => p.goal)).toEqual([
      { axis: 'row', index: 0 },
      { axis: 'row', index: 8 },
      { axis: 'col', index: 8 },
      { axis: 'col', index: 0 },
    ]);
    expect(record.wallsPerPlayer).toEqual([5, 5, 5, 5]);
    expect(record.firstPlayer).toBe(2); // slot P2 = the left seat
    expect(record.participants.map((p) => p.name)).toEqual(NAMES);
    expect(record.moves).toHaveLength(s.history.length);
    expect(record.moves[0].player).toBe(2);
    expect(record.result).toEqual({ kind: 'win', winner: (s.status as { winner: number }).winner });
  });

  it('round-trips through JSON: the replay reproduces the game and unfinished games continue', () => {
    const { s, actions, record } = finishedGame();
    const parsed = parseMultiRecord(JSON.stringify(record));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.actions.map((a) => formatAction(a.action))).toEqual(actions.map((a) => formatAction(a.action)));
    expect(parsed.names).toEqual(NAMES);
    const loaded = new MultiController();
    loaded.load(parsed);
    const l = loaded.getSnapshot();
    expect(l.game.pawns).toEqual(s.game.pawns);
    expect(l.game.wallsRemaining).toEqual(s.game.wallsRemaining);
    expect(l.game.winner).toBe(s.game.winner);
    expect(l.history.map((h) => h.player)).toEqual(s.history.map((h) => h.player));
    expect(l.names).toEqual(NAMES);

    const half = parseMultiRecord(JSON.stringify(buildMultiRecord(s.setup, actions.slice(0, 10), { names: NAMES })));
    expect(half.ok).toBe(true);
    if (half.ok) {
      loaded.load(half);
      expect(loaded.getSnapshot().status.kind).toBe('playing');
      expect(loaded.play(actions[10].action)).toBe(true);
    }
  });

  it('rejects tampered records', () => {
    const { record } = finishedGame();
    const tamper = (edit: (r: any) => void) => {
      const copy = JSON.parse(JSON.stringify(record));
      edit(copy);
      return parseMultiRecord(JSON.stringify(copy));
    };
    expect(tamper((r) => (r.moves[1].player = 0))).toMatchObject({ ok: false });
    expect(tamper((r) => (r.moves[0].notation = 'a9'))).toMatchObject({ ok: false });
    expect(tamper((r) => (r.final.wallsRemaining = [0, 0, 0, 0]))).toMatchObject({ ok: false });
    expect(tamper((r) => (r.rules.players[0].start = [0, 4]))).toMatchObject({ ok: false });
    expect(parseMultiRecord('not json')).toMatchObject({ ok: false });
  });

  it('tells the two formats apart instead of misreading one as the other', () => {
    const { record } = finishedGame();
    const asTwo = parseRecord(JSON.stringify(record));
    expect(asTwo.ok).toBe(false);
    if (!asTwo.ok) expect(asTwo.error).toContain('4인전');
    const twoPlayer = { format: GAME_RECORD_FORMAT, version: 1, start: 'standard', moves: [], ply: 0 };
    const asMulti = parseMultiRecord(JSON.stringify(twoPlayer));
    expect(asMulti.ok).toBe(false);
    if (!asMulti.ok) expect(asMulti.error).toContain('2인전');
  });
});
