import type { Agent, DecisionTrace } from '../ai/types';
import { formatAction } from '../engine';
import type { PlayerId } from '../engine';
import { runMatch } from '../match/runMatch';
import type { MatchStatus } from '../match/outcome';
import { agentLabel, deriveSeed } from './agentSpec';
import type { AgentFactory, AgentSpec, Budget } from './agentSpec';
import { randomOpening } from './openings';
import { mean, median, wilson } from './stats';
import type { Proportion } from './stats';

/**
 * Tournament between two agents A and B: `pairs` openings, each played twice with the seats
 * swapped (paired matches), so first-move advantage cancels out within a pair.
 */

export const MAX_TOURNAMENT_GAMES = 200;
export const MAX_CONCURRENCY = 2;

export interface TournamentConfig {
  /** [A, B]. */
  agents: [AgentSpec, AgentSpec];
  budget: Budget;
  pairs: number;
  seed: number;
  /** Random pawn plies before the game starts (0 = standard start). */
  openingPlies: number;
  maxPlies: number;
  repetitionLimit: number | null;
  /** Wall-clock budget per game (halted as 'time-limit' when exceeded). */
  maxGameMs: number | null;
}

export type GameOutcome =
  | 'a-win'
  | 'b-win'
  | 'halted-repetition'
  | 'halted-max-plies'
  | 'halted-time-limit'
  | 'halted-user-stopped';

export const HALT_OUTCOMES: GameOutcome[] = ['halted-repetition', 'halted-max-plies', 'halted-time-limit', 'halted-user-stopped'];

/** Per-move search work. Units differ by algorithm and must not be compared across them. */
export interface MoveWork {
  ms: number;
  /** Minimax: searched nodes; MCTS: tree nodes; BFS: evaluated candidates; Random: null. */
  nodes: number | null;
  simulations: number | null;
  /** Minimax: completed depth; MCTS: max tree depth. */
  depth: number | null;
}

export interface AgentGameStats {
  moves: MoveWork[];
  wallsUsed: number;
}

export interface ScheduledGame {
  index: number;
  pair: number;
  /** Seat of agent A (0 = moves first). */
  aSeat: PlayerId;
  opening: { seed: number; plies: number; moves: string[] };
  /** Seeds of [A, B]. */
  agentSeeds: [number, number];
}

export interface TournamentGame extends ScheduledGame {
  outcome: GameOutcome;
  plies: number;
  durationMs: number;
  /** [A, B]. */
  agents: [AgentGameStats, AgentGameStats];
  moves: string[];
}

export function traceWork(trace: DecisionTrace, ms: number): MoveWork {
  switch (trace.algorithm) {
    case 'random':
      return { ms, nodes: null, simulations: null, depth: null };
    case 'bfs':
      return { ms, nodes: trace.candidates.length, simulations: null, depth: 1 };
    case 'minimax':
      return { ms, nodes: trace.stats.nodes, simulations: null, depth: trace.completedDepth };
    case 'mcts':
      return { ms, nodes: trace.treeNodes, simulations: trace.simulations, depth: trace.maxTreeDepth };
  }
}

export function schedule(config: TournamentConfig): ScheduledGame[] {
  const pairs = Math.max(1, Math.min(Math.floor(config.pairs), MAX_TOURNAMENT_GAMES / 2));
  const games: ScheduledGame[] = [];
  for (let pair = 0; pair < pairs; pair++) {
    const openingSeed = deriveSeed(config.seed, pair, 1);
    const { moves } = randomOpening({ seed: openingSeed, plies: config.openingPlies });
    for (const aSeat of [0, 1] as const) {
      const index = games.length;
      games.push({
        index,
        pair,
        aSeat,
        opening: { seed: openingSeed, plies: config.openingPlies, moves },
        agentSeeds: [deriveSeed(config.seed, index, 2), deriveSeed(config.seed, index, 3)],
      });
    }
  }
  return games;
}

function outcomeOf(status: MatchStatus, aSeat: PlayerId): GameOutcome {
  if (status.kind === 'win') return status.winner === aSeat ? 'a-win' : 'b-win';
  if (status.kind === 'halted') return `halted-${status.reason}` as GameOutcome;
  return 'halted-user-stopped';
}

/** Plays one scheduled game in-process (agents may still use workers). */
export async function playScheduledGame(
  config: TournamentConfig,
  game: ScheduledGame,
  factory: AgentFactory,
  signal?: AbortSignal,
): Promise<TournamentGame> {
  const [specA, specB] = config.agents;
  const a = factory(specA, config.budget, game.agentSeeds[0]);
  const b = factory(specB, config.budget, game.agentSeeds[1]);
  const seats: [Agent, Agent] = game.aSeat === 0 ? [a, b] : [b, a];
  const start = randomOpening({ seed: game.opening.seed, plies: game.opening.plies }).state;
  const stats: [AgentGameStats, AgentGameStats] = [
    { moves: [], wallsUsed: 0 },
    { moves: [], wallsUsed: 0 },
  ];
  try {
    const record = await runMatch(seats, {
      initialState: start,
      maxPlies: start.ply + config.maxPlies,
      repetitionLimit: config.repetitionLimit,
      maxGameMs: config.maxGameMs,
      signal,
    });
    for (const m of record.moves) {
      const who = m.player === game.aSeat ? 0 : 1;
      stats[who].moves.push(traceWork(m.trace, m.trace.elapsedMs));
      if (m.action.type === 'wall') stats[who].wallsUsed++;
    }
    return {
      ...game,
      outcome: outcomeOf(record.status, game.aSeat),
      plies: record.finalState.ply - start.ply,
      durationMs: record.elapsedMs,
      agents: stats,
      moves: record.moves.map((m) => formatAction(m.action)),
    };
  } finally {
    a.dispose?.();
    b.dispose?.();
  }
}

// ---------------------------------------------------------------- runner

export type TournamentStatus = 'idle' | 'running' | 'paused' | 'finished' | 'stopped';

export interface TournamentSnapshot {
  status: TournamentStatus;
  config: TournamentConfig;
  scheduled: ScheduledGame[];
  games: TournamentGame[];
  inFlight: number[];
  elapsedMs: number;
  error: string | null;
}

/**
 * Runs a tournament with bounded concurrency. Pausing lets running games finish and starts no
 * new ones; stopping aborts running games (recorded as 'halted-user-stopped'). Finished games
 * are reported immediately through `onGame` so callers can persist intermediate results.
 */
export class TournamentRunner {
  private snapshot: TournamentSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly aborts = new Map<number, AbortController>();
  private readonly concurrency: number;
  private startedAt = 0;
  private runToken = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    config: TournamentConfig,
    private readonly factory: AgentFactory,
    private readonly options: { concurrency?: number; onGame?: (game: TournamentGame, snapshot: TournamentSnapshot) => void } = {},
  ) {
    this.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, options.concurrency ?? 1));
    this.snapshot = { status: 'idle', config, scheduled: schedule(config), games: [], inFlight: [], elapsedMs: 0, error: null };
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<TournamentSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, elapsedMs: this.startedAt ? performance.now() - this.startedAt : 0 };
    for (const l of this.listeners) l();
    if (this.snapshot.inFlight.length === 0 && this.snapshot.status !== 'running') {
      this.idleWaiters.splice(0).forEach((r) => r());
    }
  }

  start(): void {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'finished' || this.snapshot.status === 'stopped') return;
    if (!this.startedAt) this.startedAt = performance.now();
    const token = ++this.runToken;
    this.update({ status: 'running' });
    for (let i = this.snapshot.inFlight.length; i < this.concurrency; i++) void this.pump(token);
  }

  pause(): void {
    if (this.snapshot.status === 'running') this.update({ status: 'paused' });
  }

  stop(): void {
    if (this.snapshot.status === 'finished' || this.snapshot.status === 'stopped') return;
    this.runToken++;
    this.update({ status: 'stopped' });
    for (const ac of this.aborts.values()) ac.abort();
  }

  /** Resolves when no game is running and the runner is not scheduling new ones. */
  idle(): Promise<void> {
    if (this.snapshot.inFlight.length === 0 && this.snapshot.status !== 'running') return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private nextGame(): ScheduledGame | undefined {
    const taken = new Set([...this.snapshot.games.map((g) => g.index), ...this.snapshot.inFlight]);
    return this.snapshot.scheduled.find((g) => !taken.has(g.index));
  }

  private async pump(token: number): Promise<void> {
    while (this.snapshot.status === 'running' && token === this.runToken) {
      const game = this.nextGame();
      if (!game) {
        if (this.snapshot.inFlight.length === 0) this.update({ status: 'finished' });
        return;
      }
      const ac = new AbortController();
      this.aborts.set(game.index, ac);
      this.update({ inFlight: [...this.snapshot.inFlight, game.index] });
      try {
        const result = await playScheduledGame(this.snapshot.config, game, this.factory, ac.signal);
        const games = [...this.snapshot.games, result].sort((x, y) => x.index - y.index);
        this.aborts.delete(game.index);
        this.update({ games, inFlight: this.snapshot.inFlight.filter((i) => i !== game.index) });
        this.options.onGame?.(result, this.snapshot);
      } catch (err) {
        this.aborts.delete(game.index);
        this.update({
          inFlight: this.snapshot.inFlight.filter((i) => i !== game.index),
          status: 'stopped',
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }
    if (this.snapshot.status === 'running' && !this.nextGame() && this.snapshot.inFlight.length === 0) this.update({ status: 'finished' });
  }
}

// ---------------------------------------------------------------- summary

export interface AgentSummary {
  label: string;
  wins: number;
  winsAsFirst: number;
  winsAsSecond: number;
  decisionMsMean: number | null;
  decisionMsMedian: number | null;
  wallsUsedMean: number | null;
  nodesMean: number | null;
  simulationsMean: number | null;
  depthMean: number | null;
  moves: number;
}

export interface TournamentSummary {
  budgetMode: Budget['mode'];
  games: number;
  /** Games that ended by the rules (a pawn reached its goal). */
  decisive: number;
  halted: Record<'repetition' | 'max-plies' | 'time-limit' | 'user-stopped', number>;
  /** A's share of the decisive games with a Wilson 95 % interval. */
  aWinRate: Proportion | null;
  /** First-mover share of the decisive games (seat effect). */
  firstMoverWinRate: Proportion | null;
  pairs: { complete: number; aSweeps: number; bSweeps: number; split: number; withHalt: number };
  avgPlies: number | null;
  medianPlies: number | null;
  /** [A, B]. */
  agents: [AgentSummary, AgentSummary];
}

export function summarize(config: TournamentConfig, games: readonly TournamentGame[]): TournamentSummary {
  const decisive = games.filter((g) => g.outcome === 'a-win' || g.outcome === 'b-win');
  const count = (o: GameOutcome) => games.filter((g) => g.outcome === o).length;
  const aWins = games.filter((g) => g.outcome === 'a-win').length;
  const firstWins = decisive.filter((g) => (g.outcome === 'a-win') === (g.aSeat === 0)).length;

  const agentSummary = (who: 0 | 1): AgentSummary => {
    const moves = games.flatMap((g) => g.agents[who].moves);
    const nums = (f: (m: MoveWork) => number | null) => moves.map(f).filter((x): x is number => x !== null);
    const won = (g: TournamentGame) => g.outcome === (who === 0 ? 'a-win' : 'b-win');
    const seat = (g: TournamentGame) => (who === 0 ? g.aSeat : g.aSeat === 0 ? 1 : 0);
    return {
      label: agentLabel(config.agents[who], config.budget),
      wins: games.filter(won).length,
      winsAsFirst: games.filter((g) => won(g) && seat(g) === 0).length,
      winsAsSecond: games.filter((g) => won(g) && seat(g) === 1).length,
      decisionMsMean: mean(moves.map((m) => m.ms)),
      decisionMsMedian: median(moves.map((m) => m.ms)),
      wallsUsedMean: mean(games.map((g) => g.agents[who].wallsUsed)),
      nodesMean: mean(nums((m) => m.nodes)),
      simulationsMean: mean(nums((m) => m.simulations)),
      depthMean: mean(nums((m) => m.depth)),
      moves: moves.length,
    };
  };

  const byPair = new Map<number, TournamentGame[]>();
  for (const g of games) byPair.set(g.pair, [...(byPair.get(g.pair) ?? []), g]);
  const pairs = { complete: 0, aSweeps: 0, bSweeps: 0, split: 0, withHalt: 0 };
  for (const pg of byPair.values()) {
    if (pg.length < 2) continue;
    pairs.complete++;
    if (pg.some((g) => HALT_OUTCOMES.includes(g.outcome))) pairs.withHalt++;
    else if (pg.every((g) => g.outcome === 'a-win')) pairs.aSweeps++;
    else if (pg.every((g) => g.outcome === 'b-win')) pairs.bSweeps++;
    else pairs.split++;
  }

  return {
    budgetMode: config.budget.mode,
    games: games.length,
    decisive: decisive.length,
    halted: {
      repetition: count('halted-repetition'),
      'max-plies': count('halted-max-plies'),
      'time-limit': count('halted-time-limit'),
      'user-stopped': count('halted-user-stopped'),
    },
    aWinRate: wilson(aWins, decisive.length),
    firstMoverWinRate: wilson(firstWins, decisive.length),
    pairs,
    avgPlies: mean(games.map((g) => g.plies)),
    medianPlies: median(games.map((g) => g.plies)),
    agents: [agentSummary(0), agentSummary(1)],
  };
}
