import type { Agent, AgentProgress, DecisionTrace } from '../ai/types';
import { applyAction, formatAction, hashState, isLegalAction } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import { matchStatus } from '../match/outcome';
import type { MatchStatus } from '../match/outcome';
import { deriveSeed } from './agentSpec';
import type { AgentFactory, AgentSpec, Budget } from './agentSpec';
import { parseMoveList, randomOpening } from './openings';
import type { OpeningSpec } from './openings';

/**
 * A live AI vs AI game for the Arena view: play / pause / single step / stop / restart with
 * an adjustable delay between moves. Framework-free (React subscribes to snapshots).
 *
 * Stale results are impossible to apply: every decision carries the match id and the move
 * number it was started for, and stop/restart aborts the in-flight decision (search workers
 * are terminated).
 */

export interface ArenaConfig {
  /** Agents by seat: [P1 (moves first), P2]. */
  agents: [AgentSpec, AgentSpec];
  budget: Budget;
  seed: number;
  opening: OpeningSpec | { moves: string };
  maxPlies: number;
  repetitionLimit: number | null;
  /** Limit on total thinking time of the game (pauses excluded). */
  maxComputeMs: number | null;
}

export interface ArenaMove {
  ply: number;
  player: PlayerId;
  action: Action;
  notation: string;
  stateBefore: GameState;
  trace: DecisionTrace;
  elapsedMs: number;
}

export type ArenaPhase = 'idle' | 'running' | 'paused' | 'finished';

export interface ArenaSnapshot {
  matchId: number;
  config: ArenaConfig;
  phase: ArenaPhase;
  status: MatchStatus;
  start: GameState;
  game: GameState;
  moves: readonly ArenaMove[];
  thinking: boolean;
  progress: AgentProgress | null;
  computeMs: number;
  error: string | null;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

export function startPosition(opening: ArenaConfig['opening']): GameState {
  if ('moves' in opening) {
    const parsed = parseMoveList(opening.moves);
    return parsed.positions[parsed.positions.length - 1];
  }
  return randomOpening(opening).state;
}

export class MatchSession {
  private snapshot: ArenaSnapshot;
  private readonly listeners = new Set<() => void>();
  private agents: [Agent, Agent] | null = null;
  private abort: AbortController | null = null;
  private loopRunning = false;
  private seen = new Map<string, number>();

  constructor(
    config: ArenaConfig,
    private readonly factory: AgentFactory,
    private delayMs = 400,
  ) {
    this.snapshot = this.fresh(config, 0);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.snapshot;

  setDelay(ms: number): void {
    this.delayMs = Math.max(0, ms);
  }

  play(): void {
    if (this.snapshot.phase === 'finished') return;
    this.update({ phase: 'running' });
    void this.loop(false);
  }

  pause(): void {
    if (this.snapshot.phase === 'running') this.update({ phase: 'paused' });
  }

  /** Plays exactly one move, then pauses. */
  step(): void {
    if (this.snapshot.phase === 'finished' || this.loopRunning) return;
    this.update({ phase: 'paused' });
    void this.loop(true);
  }

  /** Ends the game as an experimental halt ('user-stopped'); never counted as a win. */
  stop(): void {
    if (this.snapshot.phase === 'finished') return;
    this.cancel();
    this.update({ phase: 'finished', status: { kind: 'halted', reason: 'user-stopped' }, thinking: false, progress: null });
  }

  restart(config: ArenaConfig = this.snapshot.config): void {
    this.cancel();
    this.snapshot = this.fresh(config, this.snapshot.matchId + 1);
    this.emit();
  }

  dispose(): void {
    this.cancel();
    this.agents?.forEach((a) => a.dispose?.());
    this.agents = null;
  }

  // ------------------------------------------------------------ internals
  /** Agents are (re)created lazily, so a disposed session (React StrictMode remount) still works. */
  private ensureAgents(): [Agent, Agent] {
    const c = this.snapshot.config;
    this.agents ??= [
      this.factory(c.agents[0], c.budget, deriveSeed(c.seed, 0)),
      this.factory(c.agents[1], c.budget, deriveSeed(c.seed, 1)),
    ];
    return this.agents;
  }

  private fresh(config: ArenaConfig, matchId: number): ArenaSnapshot {
    this.agents?.forEach((a) => a.dispose?.());
    this.agents = null;
    const start = startPosition(config.opening);
    this.seen = new Map();
    this.visit(start);
    return {
      matchId,
      config,
      phase: 'idle',
      status: matchStatus(start, start.ply + config.maxPlies),
      start,
      game: start,
      moves: [],
      thinking: false,
      progress: null,
      computeMs: 0,
      error: null,
    };
  }

  private visit(s: GameState): number {
    const h = hashState(s);
    const key = `${h.key}:${h.check}`;
    const n = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, n);
    return n;
  }

  private cancel(): void {
    this.abort?.abort();
    this.abort = null;
  }

  private update(patch: Partial<ArenaSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private async loop(single: boolean): Promise<void> {
    if (this.loopRunning) return;
    this.loopRunning = true;
    const matchId = this.snapshot.matchId;
    try {
      while (this.snapshot.matchId === matchId && this.snapshot.status.kind === 'playing') {
        if (!single && this.snapshot.phase !== 'running') break;
        const moved = await this.playOne(matchId);
        if (!moved || single) break;
        const ac = this.abort ?? new AbortController();
        await sleep(this.delayMs, ac.signal);
      }
    } finally {
      this.loopRunning = false;
    }
  }

  /** Returns true if a move was applied to the current match. */
  private async playOne(matchId: number): Promise<boolean> {
    const s = this.snapshot;
    const state = s.game;
    const player = state.currentPlayer;
    const agent = this.ensureAgents()[player];
    const ac = new AbortController();
    this.abort = ac;
    this.update({ thinking: true, progress: null });
    const onProgress = (progress: AgentProgress) => {
      if (!ac.signal.aborted && this.snapshot.matchId === matchId && this.snapshot.game === state) this.update({ progress });
    };
    const t0 = performance.now();
    let decision;
    try {
      decision = await agent.decide(state, { signal: ac.signal, onProgress });
    } catch (err) {
      if (ac.signal.aborted || this.snapshot.matchId !== matchId) return false;
      this.update({ thinking: false, phase: 'paused', error: err instanceof Error ? err.message : String(err) });
      return false;
    }
    // Ignore anything that belongs to an older match or position.
    if (ac.signal.aborted || this.snapshot.matchId !== matchId || this.snapshot.game !== state) return false;
    const elapsedMs = performance.now() - t0;
    if (!isLegalAction(state, decision.action)) {
      this.update({ thinking: false, phase: 'finished', error: `${agent.id}가 불법 행동을 선택했습니다: ${JSON.stringify(decision.action)}` });
      return false;
    }
    const next = applyAction(state, decision.action);
    const move: ArenaMove = {
      ply: state.ply + 1,
      player,
      action: decision.action,
      notation: formatAction(decision.action),
      stateBefore: state,
      trace: decision.trace,
      elapsedMs,
    };
    const computeMs = s.computeMs + elapsedMs;
    let status = matchStatus(next, this.snapshot.start.ply + s.config.maxPlies);
    const repeats = this.visit(next);
    if (status.kind === 'playing' && s.config.repetitionLimit !== null && repeats >= s.config.repetitionLimit) {
      status = { kind: 'halted', reason: 'repetition', repeats };
    }
    if (status.kind === 'playing' && s.config.maxComputeMs !== null && computeMs >= s.config.maxComputeMs) {
      status = { kind: 'halted', reason: 'time-limit', limitMs: s.config.maxComputeMs };
    }
    this.update({
      game: next,
      moves: [...this.snapshot.moves, move],
      thinking: false,
      progress: null,
      computeMs,
      status,
      phase: status.kind === 'playing' ? this.snapshot.phase : 'finished',
    });
    return true;
  }
}
