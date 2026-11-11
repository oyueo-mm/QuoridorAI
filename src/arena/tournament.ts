import type { Agent, DecisionTrace } from '../ai/types';
import { formatAction, hashState } from '../engine';
import type { GameState, PlayerId } from '../engine';
import { runMatch } from '../match/runMatch';
import type { MatchStatus } from '../match/outcome';
import { agentLabel, deriveSeed } from './agentSpec';
import type { AgentFactory, AgentSpec, Budget } from './agentSpec';
import { parseMoveList, randomMixedOpening, randomOpening } from './openings';
import { eloEstimate, mean, meanInterval, median, percentile, wilson } from './stats';
import type { EloEstimate, MeanInterval, Proportion } from './stats';

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
  /**
   * How start positions are drawn (default 'pawn': `openingPlies` random pawn moves, the
   * original behaviour). 'mixed': random pawn moves or walls (see randomMixedOpening).
   * 'book': the move lists of `openingBook`, one per pair (cycled).
   */
  openingMode?: OpeningMode;
  /** 'mixed' only: probability of a wall per opening ply (default 0.25). */
  openingWallProbability?: number;
  /** 'mixed' only: largest accepted |shortest-path difference| after the opening (default 2). */
  openingMaxImbalance?: number;
  /** 'book' only: opening move lists in notation ("e2 e8 e3h"). */
  openingBook?: string[];
  /**
   * Re-draw random openings whose position already occurred in this schedule, so
   * deterministic agents never replay an identical game (default false = original behaviour).
   */
  uniqueOpenings?: boolean;
}

export type OpeningMode = 'pawn' | 'mixed' | 'book';

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
  /** Algorithm-specific details (absent in records written before they were collected). */
  detail?: MoveDetail;
}

export interface MoveDetail {
  /** Legal actions at the root and actions the agent actually considered there. */
  legal?: number;
  searched?: number;
  /** Alpha-Beta / Minimax. */
  ttProbes?: number;
  ttHits?: number;
  cutoffs?: number;
  leaves?: number;
  timedOut?: boolean;
  /** Search stopped early on a proven result. */
  decided?: boolean;
  /** MCTS: share of root visits of the most visited move, and the visit entropy in bits. */
  topShare?: number;
  entropyBits?: number;
  stopReason?: string;
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
  /** `mode` is absent for the original pawn-only openings. */
  opening: { seed: number; plies: number; moves: string[]; mode?: OpeningMode };
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
      return { ms, nodes: null, simulations: null, depth: null, detail: { legal: trace.candidateCount, searched: 1 } };
    case 'bfs':
      return {
        ms,
        nodes: trace.candidates.length,
        simulations: null,
        depth: 1,
        detail: { legal: trace.candidates.length, searched: trace.candidates.length },
      };
    case 'minimax':
      return {
        ms,
        nodes: trace.stats.nodes,
        simulations: null,
        depth: trace.completedDepth,
        detail: {
          legal: trace.legalActionCount,
          searched: trace.searchedActionCount,
          ttProbes: trace.stats.ttProbes,
          ttHits: trace.stats.ttHits,
          cutoffs: trace.stats.cutoffs,
          leaves: trace.stats.leaves,
          timedOut: trace.timedOut,
          decided: trace.decided,
        },
      };
    case 'mcts': {
      const total = trace.candidates.reduce((sum, c) => sum + c.visits, 0);
      let entropy = 0;
      for (const c of trace.candidates) {
        if (c.visits > 0 && total > 0) entropy -= (c.visits / total) * Math.log2(c.visits / total);
      }
      return {
        ms,
        nodes: trace.treeNodes,
        simulations: trace.simulations,
        depth: trace.maxTreeDepth,
        detail: {
          legal: trace.legalActionCount,
          searched: trace.searchedActionCount,
          topShare: total > 0 ? Math.max(...trace.candidates.map((c) => c.visits)) / total : undefined,
          entropyBits: total > 0 ? entropy : undefined,
          stopReason: trace.stopReason,
          decided: trace.stopReason === 'proven-win' || trace.stopReason === 'proven-loss',
        },
      };
    }
  }
}

const positionKey = (state: GameState) => {
  const h = hashState(state);
  return `${h.key}:${h.check}`;
};

/** Start position of a scheduled game (pawn openings are regenerated, the others replayed). */
export function openingState(opening: ScheduledGame['opening']): GameState {
  if (!opening.mode || opening.mode === 'pawn') return randomOpening({ seed: opening.seed, plies: opening.plies }).state;
  const parsed = parseMoveList(opening.moves.join(' '));
  if (parsed.error) throw new Error(`Illegal opening move ${parsed.error.notation} in "${opening.moves.join(' ')}"`);
  return parsed.positions[parsed.positions.length - 1];
}

/** Opening of one pair; `attempt` > 0 is an independent re-draw (used for uniqueness). */
function drawOpening(config: TournamentConfig, pair: number, attempt: number): ScheduledGame['opening'] {
  const mode = config.openingMode ?? 'pawn';
  const seed = attempt === 0 ? deriveSeed(config.seed, pair, 1) : deriveSeed(config.seed, pair, 1, attempt);
  if (mode === 'book') {
    const book = config.openingBook ?? [];
    if (book.length === 0) throw new Error('openingMode "book" needs a non-empty openingBook');
    const parsed = parseMoveList(book[(pair + attempt * 7919) % book.length]);
    if (parsed.error) throw new Error(`Illegal book move ${parsed.error.notation}`);
    return { seed: 0, plies: parsed.moves.length, moves: parsed.moves, mode };
  }
  if (mode === 'mixed') {
    const { moves } = randomMixedOpening({
      seed,
      plies: config.openingPlies,
      wallProbability: config.openingWallProbability ?? 0.25,
      maxImbalance: config.openingMaxImbalance ?? 2,
    });
    return { seed, plies: moves.length, moves, mode };
  }
  const { moves } = randomOpening({ seed, plies: config.openingPlies });
  return { seed, plies: config.openingPlies, moves };
}

/**
 * Paired schedule: one opening per pair, played once with A first and once with A second.
 * `maxGames` caps the size (the browser Arena keeps MAX_TOURNAMENT_GAMES; batch runs may
 * ask for more).
 */
export function schedule(config: TournamentConfig, maxGames: number = MAX_TOURNAMENT_GAMES): ScheduledGame[] {
  const pairs = Math.max(1, Math.min(Math.floor(config.pairs), Math.floor(maxGames / 2)));
  const games: ScheduledGame[] = [];
  const seen = new Set<string>();
  for (let pair = 0; pair < pairs; pair++) {
    let opening = drawOpening(config, pair, 0);
    if (config.uniqueOpenings) {
      for (let attempt = 1; seen.has(positionKey(openingState(opening))) && attempt <= 200; attempt++) {
        opening = drawOpening(config, pair, attempt);
      }
      seen.add(positionKey(openingState(opening)));
    }
    for (const aSeat of [0, 1] as const) {
      const index = games.length;
      games.push({
        index,
        pair,
        aSeat,
        opening,
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
  const start = openingState(game.opening);
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
  decisionMsP95?: number | null;
  decisionMsMax?: number | null;
  wallsUsedMean: number | null;
  nodesMean: number | null;
  simulationsMean: number | null;
  depthMean: number | null;
  /** Median completed depth (Minimax) / max tree depth (MCTS). */
  depthMedian?: number | null;
  moves: number;
  /** Σ nodes / Σ seconds over moves that report nodes (algorithm-specific unit). */
  nodesPerSecond?: number | null;
  /** Σ simulations / Σ seconds (MCTS). */
  simulationsPerSecond?: number | null;
  /** Σ TT hits / Σ TT probes (Alpha-Beta). */
  ttHitRate?: number | null;
  cutoffsMean?: number | null;
  /** Share of moves whose last iteration was interrupted by the time limit. */
  timedOutShare?: number | null;
  /** Share of moves that stopped on a proven result. */
  decidedShare?: number | null;
  /** MCTS root visit concentration. */
  topShareMean?: number | null;
  entropyBitsMean?: number | null;
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
  /** A's Elo relative to B from the decisive games (halts excluded). */
  aElo?: EloEstimate | null;
  /** A's mean score per complete, halt-free pair (0 / 0.5 / 1), with a pair-level interval. */
  aPairScore?: MeanInterval | null;
  /** A's win rate split by seat (decisive games only). */
  aWinRateAsFirst?: Proportion | null;
  aWinRateAsSecond?: Proportion | null;
  /** Distinct start positions, and games whose full move list duplicates an earlier game. */
  uniqueOpenings?: number;
  duplicateGames?: number;
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
      decisionMsP95: percentile(moves.map((m) => m.ms), 0.95),
      decisionMsMax: moves.length ? Math.max(...moves.map((m) => m.ms)) : null,
      wallsUsedMean: mean(games.map((g) => g.agents[who].wallsUsed)),
      nodesMean: mean(nums((m) => m.nodes)),
      simulationsMean: mean(nums((m) => m.simulations)),
      depthMean: mean(nums((m) => m.depth)),
      depthMedian: median(nums((m) => m.depth)),
      moves: moves.length,
      nodesPerSecond: rate(moves, (m) => m.nodes),
      simulationsPerSecond: rate(moves, (m) => m.simulations),
      ttHitRate: ratio(moves, (d) => d.ttHits, (d) => d.ttProbes),
      cutoffsMean: mean(details(moves, (d) => d.cutoffs)),
      timedOutShare: share(moves, (d) => d.timedOut),
      decidedShare: share(moves, (d) => d.decided),
      topShareMean: mean(details(moves, (d) => d.topShare)),
      entropyBitsMean: mean(details(moves, (d) => d.entropyBits)),
    };
  };

  const byPair = new Map<number, TournamentGame[]>();
  for (const g of games) byPair.set(g.pair, [...(byPair.get(g.pair) ?? []), g]);
  const pairs = { complete: 0, aSweeps: 0, bSweeps: 0, split: 0, withHalt: 0 };
  const pairScores: number[] = [];
  for (const pg of byPair.values()) {
    if (pg.length < 2) continue;
    pairs.complete++;
    if (pg.some((g) => HALT_OUTCOMES.includes(g.outcome))) pairs.withHalt++;
    else {
      if (pg.every((g) => g.outcome === 'a-win')) pairs.aSweeps++;
      else if (pg.every((g) => g.outcome === 'b-win')) pairs.bSweeps++;
      else pairs.split++;
      pairScores.push(pg.filter((g) => g.outcome === 'a-win').length / pg.length);
    }
  }
  const aSeatRate = (seat: PlayerId) => {
    const d = decisive.filter((g) => g.aSeat === seat);
    return wilson(d.filter((g) => g.outcome === 'a-win').length, d.length);
  };
  const startKeys = new Set<string>();
  for (const g of games) startKeys.add(positionKey(openingState(g.opening)));
  const seenGames = new Set<string>();
  let duplicateGames = 0;
  for (const g of games) {
    const key = `${g.aSeat}|${g.opening.moves.join(' ')}|${g.moves.join(' ')}`;
    if (seenGames.has(key)) duplicateGames++;
    else seenGames.add(key);
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
    aElo: eloEstimate(aWins, decisive.length),
    aPairScore: meanInterval(pairScores),
    aWinRateAsFirst: aSeatRate(0),
    aWinRateAsSecond: aSeatRate(1),
    uniqueOpenings: startKeys.size,
    duplicateGames,
  };
}

function details(moves: readonly MoveWork[], f: (d: MoveDetail) => number | undefined): number[] {
  const out: number[] = [];
  for (const m of moves) {
    const v = m.detail ? f(m.detail) : undefined;
    if (v !== undefined && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Σ f / Σ seconds over moves where f is reported and time was spent. */
function rate(moves: readonly MoveWork[], f: (m: MoveWork) => number | null): number | null {
  let work = 0;
  let ms = 0;
  for (const m of moves) {
    const v = f(m);
    if (v === null || m.ms <= 0) continue;
    work += v;
    ms += m.ms;
  }
  return ms > 0 ? (work * 1000) / ms : null;
}

function ratio(moves: readonly MoveWork[], num: (d: MoveDetail) => number | undefined, den: (d: MoveDetail) => number | undefined): number | null {
  const n = details(moves, num).reduce((a, b) => a + b, 0);
  const d = details(moves, den).reduce((a, b) => a + b, 0);
  return d > 0 ? n / d : null;
}

function share(moves: readonly MoveWork[], f: (d: MoveDetail) => boolean | undefined): number | null {
  const xs = moves.map((m) => (m.detail ? f(m.detail) : undefined)).filter((x): x is boolean => x !== undefined);
  return xs.length ? xs.filter(Boolean).length / xs.length : null;
}
