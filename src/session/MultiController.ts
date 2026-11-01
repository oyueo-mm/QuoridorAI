import { FOUR_PLAYER_RULES, applyActionMulti, isLegalActionMulti, seatSlot } from '../engine';
import type { Action, MultiState } from '../engine';
import { initialMultiState, officialWalls } from '../match/multiRecord';
import type { MultiGameMode, MultiGameSetup, ParsedMultiRecord } from '../match/multiRecord';

/** Settings of a local multi-player game. Names and first player are by slot (P1…Pn in turn order). */
export interface MultiConfig {
  mode: MultiGameMode;
  names: readonly string[];
  /** Slot that moves first, or 'random' (decided anew at every start). */
  firstPlayer: 'random' | number;
}

export const DEFAULT_PLAYER_NAMES: readonly string[] = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4'];

export function defaultMultiConfig(): MultiConfig {
  return { mode: 'four-player', names: [...DEFAULT_PLAYER_NAMES], firstPlayer: 0 };
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
 * Framework-free session of a local (hot-seat) game with 3–4 seats on one device: it owns the
 * game state, accepts an action only from the seat to move, and keeps the record for undo,
 * replay and export. React subscribes via useSyncExternalStore (same contract as GameController).
 */
export class MultiController {
  private snapshot: MultiSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly random: () => number;

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

  /** Starts a new game (optionally with new settings); every piece of state is reset. */
  restart(config: MultiConfig = this.snapshot.config): void {
    this.snapshot = this.freshSnapshot(config, this.snapshot.gameId + 1);
    this.emit();
  }

  /** Replaces the game by an imported (already validated) record; the game can be continued if not over. */
  load(record: Extract<ParsedMultiRecord, { ok: true }>): void {
    const config: MultiConfig = { mode: record.mode, names: record.names, firstPlayer: seatSlot(record.setup.rules, record.setup.firstPlayer) };
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
      names: resolveNames(record.names, record.setup.rules.players.length),
      game,
      history,
    });
    this.emit();
  }

  // ------------------------------------------------------------ internals
  private freshSnapshot(config: MultiConfig, gameId: number): MultiSnapshot {
    const rules = FOUR_PLAYER_RULES;
    const n = rules.players.length;
    const slot = config.firstPlayer === 'random' ? Math.min(n - 1, Math.floor(this.random() * n)) : config.firstPlayer;
    const setup: MultiGameSetup = { rules, wallsPerPlayer: officialWalls(n), firstPlayer: rules.turnOrder[slot] };
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
