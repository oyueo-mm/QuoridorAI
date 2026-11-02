import {
  FOUR_PLAYER_RULES,
  MAX_WALLS,
  applyActionMulti,
  asymmetricRules,
  defaultAsymmetricPlayers,
  fixedRules,
  isLegalActionMulti,
  obstacleRules,
  seatSlot,
  validateAsymmetric,
} from '../engine';
import type { Action, AsymmetricPlayer, MultiGameMode, MultiRules, MultiState, ObstaclePreset } from '../engine';
import { randomSeed } from '../ai/rng';
import { defaultWalls, initialMultiState } from '../match/multiRecord';
import type { MultiGameSetup, ParsedMultiRecord } from '../match/multiRecord';

/** Settings of a local multi-player game. Names and first player are by slot (P1…Pn in turn order). */
export interface MultiConfig {
  mode: MultiGameMode;
  names: readonly string[];
  /** Slot that moves first, or 'random' (decided anew at every start). */
  firstPlayer: 'random' | number;
  /** Walls per player in the modes with one shared count; absent = the mode's default. */
  walls?: number;
  /** 장애물 경주: number of players, difficulty preset and the seed the map is generated from. */
  obstacle?: { players: 2 | 3 | 4; preset: ObstaclePreset; seed: number };
  /** 비대칭 대전: every player's start, goal and walls, in turn order. */
  asymmetric?: AsymmetricPlayer[];
}

export const DEFAULT_PLAYER_NAMES: readonly string[] = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4'];

/** Players seated in a mode (obstacle races and asymmetric games choose their own count). */
export function playerCountOf(config: MultiConfig): number {
  if (config.mode === 'obstacle') return config.obstacle?.players ?? 2;
  if (config.mode === 'asymmetric') return config.asymmetric?.length ?? 2;
  return fixedRules(config.mode)!.players.length;
}

export function defaultMultiConfig(): MultiConfig {
  return { mode: 'four-player', names: [...DEFAULT_PLAYER_NAMES], firstPlayer: 0 };
}

/** The recommended settings of `mode` (applied when the player picks a mode); names are kept. */
export function recommendedConfig(mode: MultiGameMode, names: readonly string[] = DEFAULT_PLAYER_NAMES): MultiConfig {
  const base: MultiConfig = { mode, names: [...names], firstPlayer: 0 };
  if (mode === 'obstacle') return { ...base, obstacle: { players: 2, preset: 'normal', seed: randomSeed() }, walls: defaultWalls(mode, 2)[0] };
  if (mode === 'asymmetric') return { ...base, asymmetric: defaultAsymmetricPlayers(2) };
  if (mode === 'four-player') return base;
  return { ...base, walls: defaultWalls(mode, fixedRules(mode)!.players.length)[0] };
}

/** Why `config` cannot start a game (Korean, for the setup form); empty = it can. */
export function validateMultiConfig(config: MultiConfig): string[] {
  const errors: string[] = [];
  if (config.mode === 'asymmetric') errors.push(...validateAsymmetric(config.asymmetric ?? []));
  else if (config.walls !== undefined && (!Number.isInteger(config.walls) || config.walls < 0 || config.walls > MAX_WALLS)) errors.push(`벽 개수는 0~${MAX_WALLS}개여야 합니다.`);
  if (config.mode === 'obstacle' && (!config.obstacle || !Number.isInteger(config.obstacle.seed))) errors.push('시드는 정수여야 합니다.');
  return errors;
}

/** The rules and wall counts a configuration plays with. Throws on an invalid configuration. */
export function buildMultiSetup(config: MultiConfig, random: () => number = Math.random): MultiGameSetup {
  const errors = validateMultiConfig(config);
  if (errors.length > 0) throw new Error(errors[0]);
  let rules: MultiRules;
  let wallsPerPlayer: number[];
  if (config.mode === 'asymmetric') {
    const players = config.asymmetric!;
    rules = asymmetricRules(players);
    wallsPerPlayer = players.map((p) => p.walls);
  } else if (config.mode === 'obstacle') {
    const o = config.obstacle!;
    rules = obstacleRules(o.players, o.preset, o.seed);
    wallsPerPlayer = Array.from({ length: o.players }, () => config.walls ?? defaultWalls('obstacle', o.players)[0]);
  } else {
    rules = fixedRules(config.mode) ?? FOUR_PLAYER_RULES;
    const n = rules.players.length;
    wallsPerPlayer = Array.from({ length: n }, () => (config.mode === 'four-player' ? defaultWalls('four-player', n)[0] : (config.walls ?? defaultWalls(config.mode, n)[0])));
  }
  const n = rules.players.length;
  const slot = config.firstPlayer === 'random' ? Math.min(n - 1, Math.floor(random() * n)) : Math.min(n - 1, Math.max(0, config.firstPlayer));
  return { rules, wallsPerPlayer, firstPlayer: rules.turnOrder[slot] };
}

export interface MultiHistoryEntry {
  /** Seat that moved. */
  player: number;
  action: Action;
  stateBefore: MultiState;
}

export type MultiStatus = { kind: 'playing' } | { kind: 'win'; winner: number };

export interface MultiSnapshot {
  /** Increments on every restart / load; lets the UI reset per-game state. */
  gameId: number;
  config: MultiConfig;
  setup: MultiGameSetup;
  /** Display names by slot (blank names replaced by the defaults). */
  names: readonly string[];
  game: MultiState;
  history: readonly MultiHistoryEntry[];
  status: MultiStatus;
  /** undo() would take back a move. */
  canUndo: boolean;
}

export interface MultiControllerOptions {
  /** Random source for the 'random' first player (default Math.random). */
  random?: () => number;
}

type Listener = () => void;

/** Name shown for a slot: the entered one, else the default. */
export function resolveNames(names: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => names[i]?.trim().slice(0, 20) || DEFAULT_PLAYER_NAMES[i]);
}

/**
 * Framework-free session of a local (hot-seat) game with 2–4 seats on one device: it owns the
 * game state, accepts an action only from the seat to move, and keeps the record for undo,
 * replay and export. React subscribes via useSyncExternalStore (same contract as GameController).
 * Every mode runs through here; what differs between them is only the rule set (`setup.rules`).
 */
export class MultiController {
  private snapshot: MultiSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly random: () => number;
  /** Start of the last imported record, replayed by restart() without new settings. */
  private imported: MultiGameSetup | null = null;

  constructor(config: MultiConfig = defaultMultiConfig(), options: MultiControllerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.snapshot = this.freshSnapshot(config, 0);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MultiSnapshot => this.snapshot;

  /** Applies the action for the seat to move. Returns false (and changes nothing) if it is not allowed. */
  play(action: Action): boolean {
    const s = this.snapshot;
    if (s.status.kind !== 'playing' || !isLegalActionMulti(s.game, action)) return false;
    const entry: MultiHistoryEntry = { player: s.game.currentPlayer, action, stateBefore: s.game };
    this.set({ game: applyActionMulti(s.game, action), history: [...s.history, entry] });
    return true;
  }

  /**
   * Takes back the last move: pawn, walls in hand, whose turn it is and the winner are restored
   * exactly (they are the position before that move). Works after the game ended too.
   */
  undo(): boolean {
    const s = this.snapshot;
    if (s.history.length === 0) return false;
    const last = s.history[s.history.length - 1];
    this.set({ game: last.stateBefore, history: s.history.slice(0, -1) });
    return true;
  }

  /**
   * Starts a new game (optionally with new settings); every piece of state is reset. Restarting
   * with the same settings replays the same map (the obstacle seed is part of the settings).
   * An invalid configuration changes nothing and returns false.
   */
  restart(config?: MultiConfig): boolean {
    if (config && validateMultiConfig(config).length > 0) return false;
    // After an import, a plain restart replays the imported start exactly (whatever generated it).
    const reuse = config === undefined ? this.imported : null;
    this.imported = null;
    this.snapshot = this.freshSnapshot(config ?? this.snapshot.config, this.snapshot.gameId + 1, reuse);
    this.imported = reuse;
    this.emit();
    return true;
  }

  /** Replaces the game by an imported (already validated) record; the game can be continued if not over. */
  load(record: Extract<ParsedMultiRecord, { ok: true }>): void {
    const rules = record.setup.rules;
    const config = configOfRecord(record);
    const history: MultiHistoryEntry[] = [];
    let game = initialMultiState(record.setup);
    for (const { action, player } of record.actions) {
      history.push({ player, action, stateBefore: game });
      game = applyActionMulti(game, action);
    }
    this.snapshot = this.derive({
      gameId: this.snapshot.gameId + 1,
      config,
      setup: record.setup,
      names: resolveNames(record.names, rules.players.length),
      game,
      history,
    });
    this.imported = record.setup;
    this.emit();
  }

  // ------------------------------------------------------------ internals
  private freshSnapshot(config: MultiConfig, gameId: number, reuse: MultiGameSetup | null = null): MultiSnapshot {
    const setup = reuse ?? buildMultiSetup(config, this.random);
    const n = setup.rules.players.length;
    return this.derive({ gameId, config, setup, names: resolveNames(config.names, n), game: initialMultiState(setup), history: [] });
  }

  private derive(base: Omit<MultiSnapshot, 'status' | 'canUndo'>): MultiSnapshot {
    return {
      ...base,
      status: base.game.winner === null ? { kind: 'playing' } : { kind: 'win', winner: base.game.winner },
      canUndo: base.history.length > 0,
    };
  }

  private set(patch: Partial<Omit<MultiSnapshot, 'status' | 'canUndo'>>): void {
    this.snapshot = this.derive({ ...this.snapshot, ...patch });
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

/** The setup form's settings that reproduce a loaded record (so "게임 재시작" replays it). */
function configOfRecord(record: Extract<ParsedMultiRecord, { ok: true }>): MultiConfig {
  const { rules, wallsPerPlayer, firstPlayer } = record.setup;
  const base = { mode: record.mode, names: record.names, firstPlayer: seatSlot(rules, firstPlayer) };
  if (record.mode === 'asymmetric') {
    return { ...base, asymmetric: rules.players.map((p, i) => ({ start: { ...p.start }, goal: { ...p.goal }, walls: wallsPerPlayer[i] })) };
  }
  if (record.mode === 'obstacle') {
    const players = rules.players.length as 2 | 3 | 4;
    const preset = (['easy', 'normal', 'hard', 'random'] as const).find((p) => p === rules.preset) ?? 'random';
    return { ...base, walls: wallsPerPlayer[0], obstacle: { players, preset, seed: rules.seed ?? 0 } };
  }
  return record.mode === 'four-player' ? base : { ...base, walls: wallsPerPlayer[0] };
}
