import { createAgent } from '../ai/registry';
import type { Agent, AgentProgress, DecisionTrace } from '../ai/types';
import { applyAction, createInitialState, isLegalAction } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import { isMatchOver, matchStatus } from '../match/outcome';
import type { MatchStatus } from '../match/outcome';
import { seatControllers } from './config';
import type { GameConfig, SeatController } from './config';

export interface HistoryEntry {
  player: PlayerId;
  action: Action;
  /** Position the action was chosen in (for replaying an AI's analysis). */
  stateBefore: GameState;
  /** Present when an AI chose the action. */
  trace?: DecisionTrace;
}

export interface SessionSnapshot {
  /** Increments on every restart; lets the UI reset per-game state. */
  gameId: number;
  config: GameConfig;
  controllers: [SeatController, SeatController];
  game: GameState;
  status: MatchStatus;
  history: readonly HistoryEntry[];
  /** An AI is computing its move. */
  thinking: boolean;
  /** Latest progress report of the AI that is thinking (search agents only). */
  progress: AgentProgress | null;
  /** The player to move is a person on this device and the game is not over. */
  humanToMove: boolean;
  /** undo() would change something (there is a human move to take back). */
  canUndo: boolean;
  error: string | null;
}

export interface GameControllerOptions {
  /** Minimum time an AI turn takes, so the user can follow the game. */
  aiDelayMs?: number;
  agentFactory?: typeof createAgent;
}

type Listener = () => void;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Framework-free game session: owns the game state, enforces whose turn it is,
 * and drives AI seats automatically. React subscribes via useSyncExternalStore.
 */
export class GameController {
  private snapshot: SessionSnapshot;
  private agents: [Agent | null, Agent | null] = [null, null];
  private readonly listeners = new Set<Listener>();
  private readonly aiDelayMs: number;
  private readonly agentFactory: typeof createAgent;
  private active = false;
  private aiRun: { abort: AbortController; done: Promise<void> } | null = null;

  constructor(config: GameConfig, options: GameControllerOptions = {}) {
    this.aiDelayMs = options.aiDelayMs ?? 0;
    this.agentFactory = options.agentFactory ?? createAgent;
    this.snapshot = this.freshSnapshot(config, 0);
  }

  // ------------------------------------------------------------ store API
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

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

  /** Cancels the AI computation and releases agent resources (workers). */
  dispose(): void {
    this.deactivate();
    for (const agent of this.agents) agent?.dispose?.();
  }

  /** Resolves once no AI turn is pending (AI seats keep playing until a human is to move). */
  async idle(): Promise<void> {
    while (this.aiRun) await this.aiRun.done;
  }

  // ------------------------------------------------------------ commands
  /** Applies a human move. Returns false (and changes nothing) if it is not allowed. */
  playHuman(action: Action): boolean {
    const s = this.snapshot;
    if (!s.humanToMove || !isLegalAction(s.game, action)) return false;
    this.commit(action);
    this.scheduleAi();
    return true;
  }

  /**
   * Takes back moves so that a person is to move again:
   *  - Human vs Human: the last move.
   *  - Human vs AI: the AI replies at the end of the record and the human move before them
   *    (if the AI has not answered yet, just the human move).
   * Works after the game ended too. A running AI computation is cancelled and its result can
   * no longer be applied (runAiTurn only commits for the position it started from). Position,
   * turn, walls in hand, winner and the record are restored exactly from the record; wall
   * owners follow from the shortened record. Returns false if there is nothing to undo.
   */
  undo(): boolean {
    const s = this.snapshot;
    const k = undoTarget(s.history, s.controllers);
    if (k === null) return false;
    this.cancelAi();
    const game = s.history[k].stateBefore;
    this.update({ game, history: s.history.slice(0, k), thinking: false, progress: null, error: null });
    this.scheduleAi();
    return true;
  }

  /** Starts a new game, optionally with a new configuration. Cancels any AI computation. */
  restart(config: GameConfig = this.snapshot.config): void {
    this.cancelAi();
    this.snapshot = this.freshSnapshot(config, this.snapshot.gameId + 1);
    this.emit();
    this.scheduleAi();
  }

  // ------------------------------------------------------------ internals
  private freshSnapshot(config: GameConfig, gameId: number): SessionSnapshot {
    const controllers = seatControllers(config);
    for (const old of this.agents) old?.dispose?.();
    this.agents = controllers.map((c) =>
      c.kind === 'ai'
        ? this.agentFactory(c.agentId, {
            seed: config.seed,
            bfsWeights: config.bfsWeights,
            minimax: config.minimax,
            mcts: config.mcts,
            mctsGuided: config.mctsGuided,
          })
        : null,
    ) as [Agent | null, Agent | null];
    const game = createInitialState();
    return this.derive({
      gameId,
      config,
      controllers,
      game,
      history: [],
      thinking: false,
      progress: null,
      error: null,
    });
  }

  private derive(base: Omit<SessionSnapshot, 'status' | 'humanToMove' | 'canUndo'>): SessionSnapshot {
    const status = matchStatus(base.game, base.config.maxPlies);
    return {
      ...base,
      status,
      humanToMove: !isMatchOver(status) && base.controllers[base.game.currentPlayer].kind === 'human',
      canUndo: undoTarget(base.history, base.controllers) !== null,
    };
  }

  private update(patch: Partial<Omit<SessionSnapshot, 'status' | 'humanToMove' | 'canUndo'>>): void {
    this.snapshot = this.derive({ ...this.snapshot, ...patch });
    this.emit();
  }

  private commit(action: Action, trace?: DecisionTrace): void {
    const s = this.snapshot;
    const entry: HistoryEntry = { player: s.game.currentPlayer, action, stateBefore: s.game, trace };
    this.update({ game: applyAction(s.game, action), history: [...s.history, entry] });
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private cancelAi(): void {
    if (!this.aiRun) return;
    this.aiRun.abort.abort();
    this.aiRun = null;
    if (this.snapshot.thinking) this.update({ thinking: false, progress: null });
  }

  private scheduleAi(): void {
    if (!this.active || this.aiRun) return;
    const s = this.snapshot;
    if (isMatchOver(s.status) || s.error) return;
    const agent = this.agents[s.game.currentPlayer];
    if (!agent) return;

    const abort = new AbortController();
    const run = { abort, done: Promise.resolve() };
    run.done = this.runAiTurn(agent, s.game, abort.signal).finally(() => {
      if (this.aiRun === run) {
        this.aiRun = null;
        this.scheduleAi(); // next AI seat (AI vs AI) or nothing
      }
    });
    this.aiRun = run;
  }

  private async runAiTurn(agent: Agent, state: GameState, signal: AbortSignal): Promise<void> {
    this.update({ thinking: true, progress: null });
    // Progress from a cancelled or superseded search must never reach the current game.
    const onProgress = (progress: AgentProgress) => {
      if (!signal.aborted && this.snapshot.game === state) this.update({ progress });
    };
    try {
      const [decision] = await Promise.all([agent.decide(state, { signal, onProgress }), sleep(this.aiDelayMs, signal)]);
      if (signal.aborted || this.snapshot.game !== state) return;
      if (!isLegalAction(state, decision.action)) {
        this.update({ thinking: false, progress: null, error: `AI(${agent.id})가 불법 행동을 선택했습니다: ${JSON.stringify(decision.action)}` });
        return;
      }
      this.snapshot = { ...this.snapshot, thinking: false, progress: null };
      this.commit(decision.action, decision.trace);
    } catch (err) {
      if (signal.aborted) return;
      this.update({ thinking: false, progress: null, error: `AI(${agent.id}) 오류: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}

/**
 * Length the record is cut back to by undo(): drop trailing AI moves and the human move before
 * them. null = nothing to undo (no human move in the record).
 */
export function undoTarget(history: readonly HistoryEntry[], controllers: readonly [SeatController, SeatController]): number | null {
  let k = history.length;
  while (k > 0 && controllers[history[k - 1].player].kind === 'ai') k--;
  if (k === 0) return null;
  return k - 1;
}
