/**
 * Batch tournaments for reproducible AI-vs-AI experiments (Node only).
 *
 * Layout of one matchup directory:
 *   config.json                 the TournamentConfig, its hash and the schedule size
 *   sessions.jsonl              one line per run session (provenance: commit, machine, shard)
 *   games.s<i>of<n>.jsonl       raw games, one JSON line each, appended as they finish
 *   summary.json / games.csv / summary.md   derived reports (regenerated from the raw lines)
 *
 * Raw lines are never rewritten. A run resumes by skipping game indices already present
 * with the same config hash; a different config in an existing directory is refused.
 * Shards split the schedule by pair (both games of a pair always run in the same process),
 * so several processes can share one matchup.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inProcessFactory, agentLabel } from '../../src/arena/agentSpec';
import { analyzeGame, mergeSides } from '../../src/arena/gameAnalysis';
import type { GameAnalysis, SideAnalysis } from '../../src/arena/gameAnalysis';
import { formatElo, formatProportion, mean, median, percentile } from '../../src/arena/stats';
import { openingState, playScheduledGame, schedule, summarize } from '../../src/arena/tournament';
import type { ScheduledGame, TournamentConfig, TournamentGame, TournamentSummary } from '../../src/arena/tournament';
import { collectProvenance, hashOf } from './provenance';
import type { Provenance } from './provenance';

export interface Matchup {
  id: string;
  question: string;
  config: TournamentConfig;
}

export interface RecordedGame extends TournamentGame {
  configHash: string;
  session: string;
  analysis: GameAnalysis;
  /** Equal-time decisions that took more than 3× the budget (machine stalls, GC, contention). */
  overBudgetMoves: number;
}

export interface Shard {
  index: number;
  count: number;
}

export const parseShard = (s: string | undefined): Shard => {
  const m = /^(\d+)\/(\d+)$/.exec(s ?? '');
  if (!m) return { index: 0, count: 1 };
  const shard = { index: Number(m[1]), count: Number(m[2]) };
  if (shard.count < 1 || shard.index < 0 || shard.index >= shard.count) throw new Error(`Bad SHARD ${s}`);
  return shard;
};

export const inShard = (g: ScheduledGame, shard: Shard) => g.pair % shard.count === shard.index;

export function readGames(dir: string): RecordedGame[] {
  if (!existsSync(dir)) return [];
  const out: RecordedGame[] = [];
  for (const f of readdirSync(dir).filter((n) => n.startsWith('games.') && n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line) as RecordedGame);
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export interface RunOptions {
  root: string;
  shard: Shard;
  maxGames: number;
  /** Stop this process after this many new games (staged execution); Infinity = all. */
  limit?: number;
  log?: (line: string) => void;
}

/** Runs (or resumes) one matchup's games for this shard. Returns the number of new games. */
export async function runMatchup(m: Matchup, opts: RunOptions): Promise<number> {
  const dir = join(opts.root, m.id);
  mkdirSync(dir, { recursive: true });
  const configHash = hashOf(m.config);
  const scheduled = schedule(m.config, opts.maxGames);
  const configPath = join(dir, 'config.json');
  if (existsSync(configPath)) {
    const prev = JSON.parse(readFileSync(configPath, 'utf8')) as { configHash: string };
    if (prev.configHash !== configHash) {
      throw new Error(`${dir} holds results for a different config (${prev.configHash} ≠ ${configHash}); use a new matchup id`);
    }
  } else {
    writeFileSync(configPath, JSON.stringify({ id: m.id, question: m.question, configHash, games: scheduled.length, config: m.config }, null, 1) + '\n');
  }

  const provenance = collectProvenance();
  const session = hashOf({ t: provenance.timestamp, shard: opts.shard, r: Math.random() });
  appendFileSync(join(dir, 'sessions.jsonl'), JSON.stringify({ session, shard: opts.shard, provenance }) + '\n');

  const done = new Set(readGames(dir).filter((g) => g.configHash === configHash).map((g) => g.index));
  const todo = scheduled.filter((g) => inShard(g, opts.shard) && !done.has(g.index));
  const file = join(dir, `games.s${opts.shard.index}of${opts.shard.count}.jsonl`);
  const limit = opts.limit ?? Infinity;
  const budgetMs = m.config.budget.mode === 'equal-time' ? m.config.budget.timeMs : null;
  let played = 0;
  opts.log?.(`[${m.id}] shard ${opts.shard.index}/${opts.shard.count}: ${done.size} done, ${todo.length} to play`);
  for (const g of todo) {
    if (played >= limit) break;
    const t0 = performance.now();
    const result = await playScheduledGame(m.config, g, inProcessFactory);
    const analysis = analyzeGame(openingState(g.opening), result.moves);
    const overBudgetMoves =
      budgetMs === null ? 0 : result.agents.flatMap((a) => a.moves).filter((mv) => mv.ms > 3 * budgetMs).length;
    const rec: RecordedGame = { ...result, configHash, session, analysis, overBudgetMoves };
    appendFileSync(file, JSON.stringify(rec) + '\n');
    played++;
    opts.log?.(
      `[${m.id}] game ${g.index} (pair ${g.pair}, A seat ${g.aSeat}) → ${result.outcome} in ${result.plies} plies, ` +
        `${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
  }
  return played;
}

// ---------------------------------------------------------------- reports

export interface MatchupReport {
  id: string;
  question: string;
  configHash: string;
  labels: [string, string];
  scheduled: number;
  completed: number;
  summary: TournamentSummary;
  /** Per agent [A, B]: strategy facts summed over its games. */
  strategy: [StrategySummary, StrategySummary];
  repetition: { gamesWithRepeats: number; maxRepetitions: number };
  overBudgetMoves: number;
  sessions: { session: string; shard: Shard; provenance: Provenance }[];
  /** Per opening pair: A's results with A first and A second. */
  openings: { pair: number; moves: string; aFirst: string | null; aSecond: string | null }[];
}

export interface StrategySummary {
  totals: SideAnalysis;
  wallShare: number | null;
  wallsPerGame: number | null;
  firstWallPlyMedian: number | null;
  wallPlyQuartiles: [number | null, number | null, number | null];
  wallsLeftAtEndMean: number | null;
  oppGainPerWall: number | null;
  missedWinRate: number | null;
  avoidableAllowedRate: number | null;
}

function strategyOf(games: readonly RecordedGame[], who: 0 | 1): StrategySummary {
  const sides = games.map((g) => {
    const seat = who === 0 ? g.aSeat : g.aSeat === 0 ? 1 : 0;
    return g.analysis.seats[seat];
  });
  const t = mergeSides(sides);
  const firstWalls = sides.filter((s) => s.wallPlies.length > 0).map((s) => s.wallPlies[0]);
  return {
    totals: t,
    wallShare: t.moves > 0 ? t.walls / t.moves : null,
    wallsPerGame: mean(sides.map((s) => s.walls)),
    firstWallPlyMedian: median(firstWalls),
    wallPlyQuartiles: [percentile(t.wallPlies, 0.25), percentile(t.wallPlies, 0.5), percentile(t.wallPlies, 0.75)],
    wallsLeftAtEndMean: mean(sides.map((s) => s.wallsLeftAtEnd)),
    oppGainPerWall: t.walls > 0 ? t.wallOppGain / t.walls : null,
    missedWinRate: t.winIn1Available > 0 ? t.missedWinIn1 / t.winIn1Available : null,
    avoidableAllowedRate: t.moves > 0 ? t.allowedWinIn1Avoidable / t.moves : null,
  };
}

export function buildReport(m: Matchup, root: string, maxGames: number): MatchupReport {
  const dir = join(root, m.id);
  const configHash = hashOf(m.config);
  const games = readGames(dir).filter((g) => g.configHash === configHash);
  // A resumed shard can never write an index twice, but guard against manual merges.
  const unique = [...new Map(games.map((g) => [g.index, g])).values()];
  const sessions = existsSync(join(dir, 'sessions.jsonl'))
    ? readFileSync(join(dir, 'sessions.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const byPair = new Map<number, RecordedGame[]>();
  for (const g of unique) byPair.set(g.pair, [...(byPair.get(g.pair) ?? []), g]);
  const res = (g: RecordedGame | undefined) => (g ? (g.outcome === 'a-win' ? 'W' : g.outcome === 'b-win' ? 'L' : 'H') : null);
  return {
    id: m.id,
    question: m.question,
    configHash,
    labels: [agentLabel(m.config.agents[0], m.config.budget), agentLabel(m.config.agents[1], m.config.budget)],
    scheduled: schedule(m.config, maxGames).length,
    completed: unique.length,
    summary: summarize(m.config, unique),
    strategy: [strategyOf(unique, 0), strategyOf(unique, 1)],
    repetition: {
      gamesWithRepeats: unique.filter((g) => g.analysis.repeatedPositions > 0).length,
      maxRepetitions: Math.max(1, ...unique.map((g) => g.analysis.maxRepetitions)),
    },
    overBudgetMoves: unique.reduce((s, g) => s + g.overBudgetMoves, 0),
    sessions,
    openings: [...byPair.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pair, pg]) => ({
        pair,
        moves: pg[0].opening.moves.join(' '),
        aFirst: res(pg.find((g) => g.aSeat === 0)),
        aSecond: res(pg.find((g) => g.aSeat === 1)),
      })),
  };
}

const CSV_COLUMNS = [
  'index', 'pair', 'a_seat', 'opening', 'outcome', 'plies', 'duration_ms',
  'a_moves', 'a_ms_mean', 'a_ms_p95', 'a_nodes_mean', 'a_depth_mean', 'a_walls', 'a_missed_win', 'a_allowed_win',
  'b_moves', 'b_ms_mean', 'b_ms_p95', 'b_nodes_mean', 'b_depth_mean', 'b_walls', 'b_missed_win', 'b_allowed_win',
  'repeated_positions', 'over_budget_moves', 'session', 'moves',
];

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fx = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '' : x.toFixed(d));

export function gamesCsv(games: readonly RecordedGame[]): string {
  const rows = games.map((g) => {
    const side = (who: 0 | 1) => {
      const moves = g.agents[who].moves;
      const seat = who === 0 ? g.aSeat : g.aSeat === 0 ? 1 : 0;
      const an = g.analysis.seats[seat];
      const nodes = moves.map((m) => m.nodes).filter((x): x is number => x !== null);
      const depth = moves.map((m) => m.depth).filter((x): x is number => x !== null);
      return [
        moves.length, fx(mean(moves.map((m) => m.ms))), fx(percentile(moves.map((m) => m.ms), 0.95)),
        fx(mean(nodes), 0), fx(mean(depth), 2), g.agents[who].wallsUsed, an.missedWinIn1, an.allowedWinIn1Avoidable,
      ];
    };
    return [
      g.index, g.pair, g.aSeat === 0 ? 'first' : 'second', g.opening.moves.join(' '), g.outcome, g.plies, g.durationMs.toFixed(0),
      ...side(0), ...side(1), g.analysis.repeatedPositions, g.overBudgetMoves, g.session, g.moves.join(' '),
    ].map(esc).join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

const f = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '—' : x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const pc = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '—' : `${(100 * x).toFixed(d)}%`);

export function reportMarkdown(r: MatchupReport): string {
  const s = r.summary;
  const [a, b] = s.agents;
  const [sa, sb] = r.strategy;
  const L: string[] = [];
  L.push(`## ${r.id}`);
  L.push('');
  L.push(`${r.question}`);
  L.push('');
  L.push(`- Completed ${r.completed} / ${r.scheduled} scheduled games · config \`${r.configHash}\` · budget ${s.budgetMode}`);
  L.push(`- Decisive ${s.decisive}; halted: repetition ${s.halted.repetition}, max plies ${s.halted['max-plies']}, game time ${s.halted['time-limit']}, user ${s.halted['user-stopped']}`);
  L.push(`- Distinct start positions ${s.uniqueOpenings ?? '—'} · games duplicating an earlier game move-for-move ${s.duplicateGames ?? '—'}`);
  L.push(`- **A (${r.labels[0]}) win rate: ${formatProportion(s.aWinRate)}** · Elo(A−B) ${formatElo(s.aElo ?? null)}`);
  const ps = s.aPairScore;
  L.push(`- Pair score of A (unit = opening pair, halt-free pairs): ${ps ? `${ps.mean.toFixed(3)} (95% CI ${ps.low.toFixed(3)}–${ps.high.toFixed(3)}, n=${ps.n})` : '—'} · sweeps A ${s.pairs.aSweeps} / B ${s.pairs.bSweeps}, split ${s.pairs.split}, with halt ${s.pairs.withHalt}`);
  L.push(`- A as first: ${formatProportion(s.aWinRateAsFirst ?? null)} · A as second: ${formatProportion(s.aWinRateAsSecond ?? null)} · first mover overall: ${formatProportion(s.firstMoverWinRate)}`);
  L.push(`- Plies mean / median: ${f(s.avgPlies, 1)} / ${f(s.medianPlies, 1)} · games with a repeated position ${r.repetition.gamesWithRepeats} (max ${r.repetition.maxRepetitions}×) · over-budget moves (>3× time) ${r.overBudgetMoves}`);
  L.push('');
  L.push(`| Search | ${r.labels[0]} (A) | ${r.labels[1]} (B) |`);
  L.push('|---|---:|---:|');
  L.push(`| Wins (as first / as second) | ${a.wins} (${a.winsAsFirst}/${a.winsAsSecond}) | ${b.wins} (${b.winsAsFirst}/${b.winsAsSecond}) |`);
  L.push(`| Decision ms mean / median / P95 / max | ${f(a.decisionMsMean)} / ${f(a.decisionMsMedian)} / ${f(a.decisionMsP95)} / ${f(a.decisionMsMax)} | ${f(b.decisionMsMean)} / ${f(b.decisionMsMedian)} / ${f(b.decisionMsP95)} / ${f(b.decisionMsMax)} |`);
  L.push(`| Nodes per move (mean) · nodes/s | ${f(a.nodesMean)} · ${f(a.nodesPerSecond)} | ${f(b.nodesMean)} · ${f(b.nodesPerSecond)} |`);
  L.push(`| Simulations per move · sims/s | ${f(a.simulationsMean)} · ${f(a.simulationsPerSecond)} | ${f(b.simulationsMean)} · ${f(b.simulationsPerSecond)} |`);
  L.push(`| Depth mean / median (AB: completed; MCTS: max tree) | ${f(a.depthMean, 2)} / ${f(a.depthMedian, 1)} | ${f(b.depthMean, 2)} / ${f(b.depthMedian, 1)} |`);
  L.push(`| TT hit rate · cutoffs per move | ${pc(a.ttHitRate)} · ${f(a.cutoffsMean)} | ${pc(b.ttHitRate)} · ${f(b.cutoffsMean)} |`);
  L.push(`| Last iteration timed out · proven result | ${pc(a.timedOutShare)} · ${pc(a.decidedShare)} | ${pc(b.timedOutShare)} · ${pc(b.decidedShare)} |`);
  L.push(`| MCTS top-move visit share · visit entropy (bits) | ${pc(a.topShareMean)} · ${f(a.entropyBitsMean, 2)} | ${pc(b.topShareMean)} · ${f(b.entropyBitsMean, 2)} |`);
  L.push('');
  L.push(`| Strategy | A | B |`);
  L.push('|---|---:|---:|');
  L.push(`| Wall share of moves · walls per game | ${pc(sa.wallShare)} · ${f(sa.wallsPerGame, 2)} | ${pc(sb.wallShare)} · ${f(sb.wallsPerGame, 2)} |`);
  L.push(`| First wall ply (median) · wall ply Q1/Q2/Q3 | ${f(sa.firstWallPlyMedian, 1)} · ${sa.wallPlyQuartiles.map((x) => f(x, 0)).join('/')} | ${f(sb.firstWallPlyMedian, 1)} · ${sb.wallPlyQuartiles.map((x) => f(x, 0)).join('/')} |`);
  L.push(`| Walls left at end (mean) | ${f(sa.wallsLeftAtEndMean, 2)} | ${f(sb.wallsLeftAtEndMean, 2)} |`);
  L.push(`| Opponent path gain per wall · walls without gain · self-harm walls | ${f(sa.oppGainPerWall, 2)} · ${sa.totals.wallsWithoutGain} · ${sa.totals.selfHarmWalls} | ${f(sb.oppGainPerWall, 2)} · ${sb.totals.wallsWithoutGain} · ${sb.totals.selfHarmWalls} |`);
  L.push(`| Pawn moves away from goal · backtracks | ${sa.totals.pawnMovesAway} · ${sa.totals.backtracks} | ${sb.totals.pawnMovesAway} · ${sb.totals.backtracks} |`);
  L.push(`| Missed win-in-1 / available | ${sa.totals.missedWinIn1} / ${sa.totals.winIn1Available} | ${sb.totals.missedWinIn1} / ${sb.totals.winIn1Available} |`);
  L.push(`| Allowed opponent win-in-1: avoidable · forced | ${sa.totals.allowedWinIn1Avoidable} · ${sa.totals.allowedWinIn1Forced} | ${sb.totals.allowedWinIn1Avoidable} · ${sb.totals.allowedWinIn1Forced} |`);
  L.push('');
  const sess = r.sessions.map((x) => x.provenance);
  const commits = [...new Set(sess.map((p) => `${p.git.commit?.slice(0, 10) ?? '?'}${p.git.srcDirty ? '+dirty-src' : ''}`))];
  const machines = [...new Set(sess.map((p) => `${p.cpu} · ${p.logicalCores} threads · Node ${p.node}`))];
  L.push(`- Sessions ${r.sessions.length} · commits ${commits.join(', ') || '—'} · ${machines.join(' | ') || '—'}`);
  L.push('');
  return L.join('\n');
}

export function writeReports(m: Matchup, root: string, maxGames: number): MatchupReport {
  const report = buildReport(m, root, maxGames);
  const dir = join(root, m.id);
  const games = readGames(dir).filter((g) => g.configHash === report.configHash);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(report, null, 1) + '\n');
  writeFileSync(join(dir, 'games.csv'), gamesCsv(games));
  writeFileSync(join(dir, 'summary.md'), reportMarkdown(report) + '\n');
  return report;
}
