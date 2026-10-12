import { agentLabel } from './agentSpec';
import { summarize } from './tournament';
import type { TournamentConfig, TournamentGame } from './tournament';

/** Self-contained experiment record: settings, seeds, every game and the summary. */
export function tournamentToJson(config: TournamentConfig, games: readonly TournamentGame[], meta: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      format: 'quoridor-ai-tournament/1',
      exportedAt: new Date().toISOString(),
      ...meta,
      config,
      labels: config.agents.map((a) => agentLabel(a, config.budget)),
      summary: summarize(config, games),
      games,
    },
    null,
    1,
  );
}

const CSV_COLUMNS = [
  'index',
  'pair',
  'budget_mode',
  'agent_a',
  'agent_b',
  'a_seat',
  'opening_seed',
  'opening_plies',
  'opening_moves',
  'seed_a',
  'seed_b',
  'outcome',
  'plies',
  'duration_ms',
  'a_moves',
  'a_ms_mean',
  'a_walls',
  'b_moves',
  'b_ms_mean',
  'b_walls',
  'moves',
] as const;

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per game (for spreadsheets / pandas). */
export function tournamentToCsv(config: TournamentConfig, games: readonly TournamentGame[]): string {
  const [la, lb] = config.agents.map((a) => agentLabel(a, config.budget));
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '');
  const rows = games.map((g) =>
    [
      g.index,
      g.pair,
      config.budget.mode,
      la,
      lb,
      g.aSeat === 0 ? 'P1' : 'P2',
      g.opening.seed,
      g.opening.plies,
      g.opening.moves.join(' '),
      g.agentSeeds[0],
      g.agentSeeds[1],
      g.outcome,
      g.plies,
      g.durationMs.toFixed(0),
      g.agents[0].moves.length,
      avg(g.agents[0].moves.map((m) => m.ms)),
      g.agents[0].wallsUsed,
      g.agents[1].moves.length,
      avg(g.agents[1].moves.map((m) => m.ms)),
      g.agents[1].wallsUsed,
      g.moves.join(' '),
    ]
      .map(esc)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}
