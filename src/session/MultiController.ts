import {
  FOUR_PLAYER_RULES,
  MAX_WALLS,
  applyActionMulti,
  asymmetricRules,
  defaultAsymmetricPlayers,
  fixedRules,
  goalDistanceMulti,
  isLegalActionMulti,
  legalActionsMulti,
  legalPawnMovesMulti,
  obstacleRules,
  seatSlot,
  validateAsymmetric,
} from '../engine';
import type { Action, AsymmetricPlayer, MultiGameMode, MultiRules, MultiState, ObstaclePreset } from '../engine';
import { MultiCancelledError, agentSeatName, createMultiEngine, resolveSpec } from '../ai/multiAgent';
import type { MultiAgentSpec, MultiAiEngine, MultiProgress, MultiSeatController, MultiTrace } from '../ai/multiAgent';
import { randomSeed } from '../ai/rng';
import { defaultWalls, initialMultiState } from '../match/multiRecord';
import type { MultiGameSetup, ParsedMultiRecord } from '../match/multiRecord';

/** Settings of a local multi-player game. Names and first player are by slot (P1…Pn in turn order). */
export type { MultiSeatController };

export const HUMAN: MultiSeatController = { kind: 'human' };

export interface MultiConfig {
  mode: MultiGameMode;
  names: readonly string[];
  /** Who plays each slot (P1…Pn); absent or short = people. Never changes the board, only who moves. */
  controllers?: readonly MultiSeatController[];
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
  for (const c of config.controllers ?? []) if (c.kind === 'ai' && resolveSpec(c.agent) === null) errors.push('AI 설정이 올바르지 않습니다.');
  return errors;
}

/**
 * The rules and wall counts a configuration plays with. Throws on an invalid configuration.
 * `obstacleMap` = the map already generated for the same obstacle settings (the mode preview
 * generates it off the main thread); omitted, it is generated here.
 */
export function buildMultiSetup(config: MultiConfig, random: () => number = Math.random, obstacleMap?: MultiRules): MultiGameSetup {
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
    // A map generated elsewhere (the mode preview) is reused only if it is the one these settings describe.
    const reusable = obstacleMap && obstacleMap.seed === o.seed && obstacleMap.preset === o.preset && obstacleMap.players.length === o.players;
    rules = reusable ? obstacleMap : obstacleRules(o.players, o.preset, o.seed);
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
  /** Present when an AI chose the action: what it actually computed. */
  trace?: MultiTrace;
}

export type MultiStatus = { kind: 'playing' } | { kind: 'win'; winner: number };

export interface MultiSnapshot {
  /** Increments on every restart / load; lets the UI reset per-game state. */
  gameId: number;
  config: MultiConfig;
  setup: MultiGameSetup;
  /** Display names by slot (blank names replaced by the defaults, AI seats by the AI's name). */
  names: readonly string[];
  game: MultiState;
  history: readonly MultiHistoryEntry[];
  status: MultiStatus;
  /** undo() would take back a move. */
  canUndo: boolean;
  /** Who plays each seat (indexed by seat, not slot). */
  controllers: readonly MultiSeatController[];
  aiPresent: boolean;
  /** Every seat is an AI: the game plays itself (pause / step / speed apply). */
  allAi: boolean;
  /** The seat to move is a person and the game is not over. */
  humanToMove: boolean;
  /** An AI is computing its move. */
  thinking: { seat: number; progress: MultiProgress | null } | null;
  /** AI turns are held (nothing is computed until resumed or stepped). */
  paused: boolean;
  /** Minimum time an AI turn takes, so people can follow the game. */
  delayMs: number;
  /** Last AI problem (a safe substitute move was played instead), else null. */
  notice: string | null;
}

export interface MultiControllerOptions {
  /** Random source for the 'random' first player (default Math.random). */
  random?: () => number;
  /** Where AI decisions run (default: a Web Worker, created on first use). */
  engineFactory?: () => MultiAiEngine;
  /** Minimum duration of an AI turn in ms (default 0 = as fast as the AI answers). */
  aiDelayMs?: number;
}

type Listener = () => void;
type DerivedKeys = 'status' | 'canUndo' | 'controllers' | 'aiPresent' | 'allAi' | 'humanToMove';
type ImportedStart = { setup: MultiGameSetup; controllers?: readonly MultiSeatController[] };

/** Name shown for a slot: the entered one, else the default (or the AI's name for an AI seat). */
export function resolveNames(names: readonly string[], count: number, controllers?: readonly MultiSeatController[]): string[] {
  return Array.from({ length: count }, (_, i) => {
    const typed = names[i]?.trim().slice(0, 20);
    const c = controllers?.[i];
    if (c?.kind === 'ai' && (!typed || typed === DEFAULT_PLAYER_NAMES[i])) return agentSeatName(c.agent);
    return typed || DEFAULT_PLAYER_NAMES[i];
  });
}

/** Controllers by seat from the controllers by slot. */
export function controllersBySeat(rules: MultiRules, bySlot: readonly MultiSeatController[] | undefined): MultiSeatController[] {
  return rules.players.map((_, seat) => bySlot?.[seatSlot(rules, seat)] ?? HUMAN);
}

/** A legal action that is safe whatever went wrong: the pawn move that gets closest to the goal. */
export function safeFallbackAction(state: MultiState): Action | null {
  const me = state.currentPlayer;
  let best: Action | null = null;
  let bestDist = Infinity;
  for (const to of legalPawnMovesMulti(state)) {
    const pawns = state.pawns.map((p, i) => (i === me ? to : p));
    const d = goalDistanceMulti({ ...state, pawns }, me);
    if (d < bestDist) {
      bestDist = d;
      best = { type: 'move', to };
    }
  }
  return best ?? legalActionsMulti(state)[0] ?? null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Framework-free session of a local game with 2–4 seats on one device. It owns the game state,
 * accepts a person's action only from a human seat that is to move, and drives the AI seats:
 * for an AI turn it asks the engine (a Web Worker) for a decision, re-validates the answer against
 * the rules, then applies it and records the AI's trace with the move. React subscribes via
 * useSyncExternalStore (same contract as GameController). Every mode runs through here; what
 * differs between them is only the rule set (`setup.rules`).
 *
 * Stale results: every restart / load / undo / pause / dispose bumps an epoch and cancels the
 * engine; a decision is applied only if it still belongs to the same epoch AND the very position
 * it was computed for, so a late answer can never reach another game or move twice.
 */
export class MultiController {
  private snapshot: MultiSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly random: () => number;
  private readonly engineFactory: () => MultiAiEngine;
  private engine: MultiAiEngine | null = null;
  private active = false;
  private epoch = 0;
  private run: { abort: AbortController; done: Promise<void> } | null = null;
  private stepRequested = false;
  /** Start of the last imported record, replayed by restart() without new settings. */
  private imported: ImportedStart | null = null;

  constructor(config: MultiConfig = defaultMultiConfig(), options: MultiControllerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.engineFactory = options.engineFactory ?? (() => createMultiEngine());
    this.snapshot = this.freshSnapshot(config, 0, null, options.aiDelayMs ?? 0);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MultiSnapshot => this.snapshot;

  // ------------------------------------------------------------ lifecycle
  /** Starts driving AI turns (call once mounted). */
  activate(): void {
    this.active = true;
    this.scheduleAi();
  }

  /** Stops driving AI turns and cancels any in-flight decision. */
  deactivate(): void {
    this.active = false;
    this.cancelAi();
  }

  /** Cancels the AI computation and releases the worker. */
  dispose(): void {
    this.deactivate();
    this.engine?.dispose();
    this.engine = null;
  }

  /** Resolves once no AI turn is running (AI seats keep playing until a person is to move or the game ends). */
  async idle(): Promise<void> {
    while (this.run) await this.run.done;
  }

  // ------------------------------------------------------------ commands
  /** Applies a person's action for the seat to move. Returns false (and changes nothing) if it is not allowed. */
  play(action: Action): boolean {
    const s = this.snapshot;
    if (!s.humanToMove || !isLegalActionMulti(s.game, action)) return false;
    this.commit(action);
    this.scheduleAi();
    return true;
  }

  /**
   * Takes back moves so that a person is to move again: the last move, plus any AI moves before it
   * back to the person's previous move (an AI would otherwise just repeat its answer). In a game of
   * only AIs it takes back one move and pauses. Works after the game ended too. A running AI
   * computation is cancelled. Position, turn, walls in hand and winner are restored exactly.
   */
  undo(): boolean {
    const s = this.snapshot;
    if (s.history.length === 0) return false;
    this.cancelAi();
    let k = s.history.length - 1;
    if (!s.allAi) while (k > 0 && s.controllers[s.history[k].player].kind === 'ai') k--;
    this.update({ game: s.history[k].stateBefore, history: s.history.slice(0, k), notice: null, ...(s.allAi ? { paused: true } : {}) });
    this.scheduleAi();
    return true;
  }

  /**
   * Starts a new game (optionally with new settings); every piece of state is reset and any AI
   * computation is cancelled. Restarting with the same settings replays the same map (the obstacle
   * seed is part of the settings). `obstacleMap` = the map the mode preview already generated for the
   * same settings (reused instead of generating it again). An invalid configuration changes nothing
   * and returns false.
   */
  restart(config?: MultiConfig, options: { obstacleMap?: MultiRules } = {}): boolean {
    if (config && validateMultiConfig(config).length > 0) return false;
    this.cancelAi();
    // After an import, a plain restart replays the imported start exactly (whatever generated it).
    const reuse = config === undefined ? this.imported : null;
    this.imported = null;
    this.snapshot = this.freshSnapshot(config ?? this.snapshot.config, this.snapshot.gameId + 1, reuse, this.snapshot.delayMs, options.obstacleMap);
    this.imported = reuse;
    this.emit();
    this.scheduleAi();
    return true;
  }

  /** Replaces the game by an imported (already validated) record; the game can be continued if not over. */
  load(record: Extract<ParsedMultiRecord, { ok: true }>): void {
    this.cancelAi();
    const rules = record.setup.rules;
    const config = configOfRecord(record);
    const history: MultiHistoryEntry[] = [];
    let game = initialMultiState(record.setup);
    for (const { action, player } of record.actions) {
      history.push({ player, action, stateBefore: game });
      game = applyActionMulti(game, action);
    }
    const bySeat = controllersBySeat(rules, config.controllers);
    this.snapshot = this.derive({
      gameId: this.snapshot.gameId + 1,
      config,
      setup: record.setup,
      names: resolveNames(record.names, rules.players.length, config.controllers),
      game,
      history,
      thinking: null,
      // An imported game with AI seats waits for the user instead of moving on its own.
      paused: bySeat.some((c) => c.kind === 'ai'),
      delayMs: this.snapshot.delayMs,
      notice: null,
    });
    this.imported = { setup: record.setup, controllers: config.controllers };
    this.emit();
    this.scheduleAi();
  }

  /** Holds (true) or resumes (false) the AI turns. Pausing cancels a running computation; resuming restarts it. */
  setPaused(paused: boolean): void {
    if (paused === this.snapshot.paused) return;
    if (paused) this.cancelAi();
    this.update({ paused });
    this.scheduleAi();
  }

  /** While paused: lets the AI seat to move play exactly one move. */
  step(): boolean {
    const s = this.snapshot;
    if (s.status.kind !== 'playing' || s.humanToMove || this.run || !s.aiPresent) return false;
    if (s.controllers[s.game.currentPlayer].kind !== 'ai') return false;
    this.stepRequested = true;
    this.scheduleAi();
    return true;
  }

  setDelay(ms: number): void {
    this.update({ delayMs: Math.max(0, Math.min(5000, Math.round(ms))) });
  }

  // ------------------------------------------------------------ internals
  private freshSnapshot(config: MultiConfig, gameId: number, reuse: ImportedStart | null, delayMs: number, obstacleMap?: MultiRules): MultiSnapshot {
    const setup = reuse?.setup ?? buildMultiSetup(config, this.random, obstacleMap);
    const n = setup.rules.players.length;
    const slotControllers = reuse?.controllers ?? config.controllers;
    return this.derive({
      gameId,
      config: reuse?.controllers ? { ...config, controllers: reuse.controllers } : config,
      setup,
      names: resolveNames(config.names, n, slotControllers),
      game: initialMultiState(setup),
      history: [],
      thinking: null,
      paused: false,
      delayMs,
      notice: null,
    });
  }

  private derive(base: Omit<MultiSnapshot, DerivedKeys>): MultiSnapshot {
    const controllers = controllersBySeat(base.game.rules, base.config.controllers);
    const status: MultiStatus = base.game.winner === null ? { kind: 'playing' } : { kind: 'win', winner: base.game.winner };
    return {
      ...base,
      status,
      canUndo: base.history.length > 0,
      controllers,
      aiPresent: controllers.some((c) => c.kind === 'ai'),
      allAi: controllers.every((c) => c.kind === 'ai'),
      humanToMove: status.kind === 'playing' && controllers[base.game.currentPlayer].kind === 'human',
    };
  }

  private update(patch: Partial<Omit<MultiSnapshot, DerivedKeys>>): void {
    this.snapshot = this.derive({ ...this.snapshot, ...patch });
    this.emit();
  }

  private commit(action: Action, trace?: MultiTrace): void {
    const s = this.snapshot;
    const entry: MultiHistoryEntry = { player: s.game.currentPlayer, action, stateBefore: s.game, ...(trace ? { trace } : {}) };
    this.update({ game: applyActionMulti(s.game, action), history: [...s.history, entry], thinking: null });
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Invalidates every running decision: its result can no longer be applied. */
  private cancelAi(): void {
    this.epoch++;
    this.stepRequested = false;
    if (this.run) {
      this.run.abort.abort();
      this.run = null;
    }
    this.engine?.cancel();
    if (this.snapshot.thinking) this.update({ thinking: null });
  }

  private scheduleAi(): void {
    if (!this.active || this.run) return;
    const s = this.snapshot;
    if (s.status.kind !== 'playing') return;
    const seat = s.game.currentPlayer;
    const controller = s.controllers[seat];
    if (controller.kind !== 'ai') return;
    if (s.paused && !this.stepRequested) return;
    this.engine ??= this.engineFactory();
    const abort = new AbortController();
    const token = this.epoch;
    const run = { abort, done: Promise.resolve() };
    run.done = this.runAiTurn(seat, controller.agent, s.game, token, abort.signal).finally(() => {
      if (this.run === run) {
        this.run = null;
        this.stepRequested = false;
        this.scheduleAi(); // next AI seat, or nothing when a person is up / paused / over
      }
    });
    this.run = run;
  }

  private async runAiTurn(seat: number, spec: MultiAgentSpec, state: MultiState, token: number, signal: AbortSignal): Promise<void> {
    const stale = () => signal.aborted || token !== this.epoch || this.snapshot.game !== state;
    this.update({ thinking: { seat, progress: null }, notice: null });
    const decisionIndex = this.snapshot.history.filter((h) => h.player === seat).length;
    const wallsTotal = this.snapshot.setup.wallsPerPlayer;
    try {
      const [decision] = await Promise.all([
        this.engine!.decide({ spec, state, decisionIndex, wallsTotal }, (progress) => {
          if (!stale()) this.update({ thinking: { seat, progress } });
        }),
        sleep(this.snapshot.delayMs, signal),
      ]);
      if (stale()) return;
      if (isLegalActionMulti(state, decision.action)) {
        this.commit(decision.action, decision.trace);
      } else {
        this.playFallback(state, `${agentSeatName(spec)}가 불법 행동을 선택해 대신 가장 가까운 말 이동을 두었습니다.`);
      }
    } catch (err) {
      if (stale() || err instanceof MultiCancelledError || (err as { name?: string })?.name === 'AbortError') return;
      this.playFallback(state, `${agentSeatName(spec)} 오류: ${err instanceof Error ? err.message : String(err)} — 대신 가장 가까운 말 이동을 두었습니다.`);
    }
  }

  /** An AI failed: play the safest legal move and tell the user; if there is none, hold the game. */
  private playFallback(state: MultiState, notice: string): void {
    const action = safeFallbackAction(state);
    if (!action) {
      this.update({ thinking: null, paused: true, notice: `${notice} 둘 수 있는 수가 없어 멈췄습니다.` });
      return;
    }
    this.commit(action);
    this.update({ notice });
  }
}

/** The setup form's settings that reproduce a loaded record (so "게임 재시작" replays it). */
function configOfRecord(record: Extract<ParsedMultiRecord, { ok: true }>): MultiConfig {
  const { rules, wallsPerPlayer, firstPlayer } = record.setup;
  const base = { mode: record.mode, names: record.names, firstPlayer: seatSlot(rules, firstPlayer), ...(record.controllers ? { controllers: record.controllers } : {}) };
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
