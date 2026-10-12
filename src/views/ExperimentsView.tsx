import { useEffect, useMemo, useState } from 'react';
import { agentLabel, defaultSpec, workerFactory } from '../arena/agentSpec';
import type { AgentSpec, Budget } from '../arena/agentSpec';
import { tournamentToCsv, tournamentToJson } from '../arena/exportResults';
import { formatProportion } from '../arena/stats';
import { HALT_OUTCOMES, MAX_TOURNAMENT_GAMES, TournamentRunner, summarize } from '../arena/tournament';
import type { TournamentConfig, TournamentGame, TournamentSnapshot } from '../arena/tournament';
import { AgentPicker, BudgetBadge, BudgetPicker } from '../components/arena/AgentPicker';
import { downloadText, safeStorage } from '../components/download';
import { Panel } from '../components/panels/Panel';
import { Collapsible, buttonClass, cardClass, inputClass } from '../components/ui';
import { NumberRow } from './ArenaView';

interface Preset {
  id: string;
  name: string;
  config: TournamentConfig;
}

const base = (agents: [AgentSpec, AgentSpec], budget: Budget, seed: number): TournamentConfig => ({
  agents,
  budget,
  pairs: 3,
  seed,
  openingPlies: 4,
  maxPlies: 200,
  repetitionLimit: 3,
  maxGameMs: 90_000,
});

/** Stage-5 experiments with fresh seeds (not used in any earlier tuning). */
const PRESETS: Preset[] = [
  {
    id: 'pure-vs-guided',
    name: 'Pure MCTS vs Guided MCTS (Equal Time 300 ms)',
    config: base([defaultSpec('mcts'), defaultSpec('mcts-guided')], { mode: 'equal-time', timeMs: 300 }, 5001),
  },
  {
    id: 'bfs-vs-ab',
    name: 'BFS vs Alpha-Beta (Fixed: 깊이 3)',
    config: base([defaultSpec('bfs'), { ...defaultSpec('alphabeta'), depth: 3 }], { mode: 'fixed', timeMs: 300 }, 5002),
  },
  {
    id: 'ab-vs-guided',
    name: 'Alpha-Beta vs Guided MCTS (Equal Time 300 ms)',
    config: base([defaultSpec('alphabeta'), defaultSpec('mcts-guided')], { mode: 'equal-time', timeMs: 300 }, 5003),
  },
];

interface SavedRun {
  id: string;
  savedAt: string;
  status: TournamentSnapshot['status'];
  config: TournamentConfig;
  games: TournamentGame[];
}

const STORAGE_KEY = 'quoridor-ai/experiments/v1';
const MAX_SAVED = 10;

function loadSaved(): SavedRun[] {
  try {
    return JSON.parse(safeStorage.get(STORAGE_KEY) ?? '[]') as SavedRun[];
  } catch {
    return [];
  }
}

const fmt = (x: number | null, d = 0) => (x === null ? '—' : x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const OUTCOME_LABEL: Record<TournamentGame['outcome'], string> = {
  'a-win': 'A 승',
  'b-win': 'B 승',
  'halted-repetition': '중단: 반복',
  'halted-max-plies': '중단: 최대 ply',
  'halted-time-limit': '중단: 시간 제한',
  'halted-user-stopped': '중단: 사용자',
};

/** Automatic paired matches between two agents, with statistics and export. */
export function ExperimentsView() {
  const [config, setConfig] = useState<TournamentConfig>(PRESETS[0].config);
  const [concurrency, setConcurrency] = useState(1);
  const [runner, setRunner] = useState<TournamentRunner | null>(null);
  const [snap, setSnap] = useState<TournamentSnapshot | null>(null);
  const [runId, setRunId] = useState('');
  const [saved, setSaved] = useState<SavedRun[]>(loadSaved);
  const [viewSaved, setViewSaved] = useState<SavedRun | null>(null);

  useEffect(() => {
    if (!runner) return;
    setSnap(runner.getSnapshot());
    return runner.subscribe(() => setSnap(runner.getSnapshot()));
  }, [runner]);
  useEffect(() => () => runner?.stop(), [runner]);

  const persist = (id: string, s: TournamentSnapshot) => {
    const entry: SavedRun = { id, savedAt: new Date().toISOString(), status: s.status, config: s.config, games: s.games };
    const next = [entry, ...loadSaved().filter((r) => r.id !== id)].slice(0, MAX_SAVED);
    if (!safeStorage.set(STORAGE_KEY, JSON.stringify(next))) {
      // Storage full: keep only this run.
      safeStorage.set(STORAGE_KEY, JSON.stringify([entry]));
    }
    setSaved(loadSaved());
  };

  // Persist every status change (pause / stop / finish) as well as every game.
  useEffect(() => {
    if (snap && runId && snap.status !== 'running') persist(runId, snap);
  }, [snap?.status]);

  const start = () => {
    runner?.stop();
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const r = new TournamentRunner(config, workerFactory, { concurrency, onGame: (_g, s) => persist(id, s) });
    setRunId(id);
    setViewSaved(null);
    setRunner(r);
    r.start();
  };

  const active = viewSaved ?? (snap ? { config: snap.config, games: snap.games, status: snap.status } : null);
  const summary = useMemo(() => (active ? summarize(active.config, active.games) : null), [active]);
  const total = Math.min(MAX_TOURNAMENT_GAMES, config.pairs * 2);
  const running = snap?.status === 'running';
  const labels = config.agents.map((a) => agentLabel(a, config.budget));

  const exportAs = (kind: 'json' | 'csv') => {
    if (!active) return;
    const name = `quoridor-${active.config.agents.map((a) => a.kind).join('-vs-')}-${active.config.budget.mode}-${active.config.seed}`;
    if (kind === 'json') downloadText(`${name}.json`, tournamentToJson(active.config, active.games, { status: active.status }), 'application/json');
    else downloadText(`${name}.csv`, tournamentToCsv(active.config, active.games), 'text/csv');
  };

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Panel title="실험 설정" aside={<BudgetBadge budget={config.budget} />}>
          <div className="space-y-4">
            <label className="block text-xs text-muted">
              <span className="mb-1 block">프리셋</span>
              <select
                onChange={(e) => {
                  const p = PRESETS.find((x) => x.id === e.target.value);
                  if (p) setConfig(p.config);
                }}
                className={inputClass}
                aria-label="프리셋"
                defaultValue={PRESETS[0].id}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <AgentPicker label="Agent A" accent={AB_COLORS[0]} value={config.agents[0]} budget={config.budget} onChange={(a) => setConfig({ ...config, agents: [a, config.agents[1]] })} />
            <AgentPicker label="Agent B" accent={AB_COLORS[1]} value={config.agents[1]} budget={config.budget} onChange={(b) => setConfig({ ...config, agents: [config.agents[0], b] })} />
            <BudgetPicker value={config.budget} onChange={(budget) => setConfig({ ...config, budget })} />
            <NumberRow label="오프닝 쌍 수 (대국 = ×2)" value={config.pairs} min={1} max={MAX_TOURNAMENT_GAMES / 2} onChange={(pairs) => setConfig({ ...config, pairs })} />
            <Collapsible title="대국 조건 · 시드">
              <div className="space-y-2">
              <NumberRow label="실험 시드" value={config.seed} min={0} onChange={(seed) => setConfig({ ...config, seed })} />
              <NumberRow label="오프닝 무작위 수" value={config.openingPlies} min={0} max={12} onChange={(openingPlies) => setConfig({ ...config, openingPlies })} />
              <NumberRow label="최대 ply" value={config.maxPlies} min={10} onChange={(maxPlies) => setConfig({ ...config, maxPlies })} />
              <NumberRow label="반복 포지션 횟수 (0 = 끔)" value={config.repetitionLimit ?? 0} min={0} onChange={(v) => setConfig({ ...config, repetitionLimit: v > 0 ? v : null })} />
              <NumberRow label="대국당 시간 제한 (초, 0 = 끔)" value={(config.maxGameMs ?? 0) / 1000} min={0} onChange={(v) => setConfig({ ...config, maxGameMs: v > 0 ? v * 1000 : null })} />
              <NumberRow label="동시 대국 수 (1–2)" value={concurrency} min={1} max={2} onChange={setConcurrency} />
              </div>
            </Collapsible>
            {total > 20 && <p className="text-[11px] text-warn/80">{total}판은 오래 걸릴 수 있습니다. 브라우저 탭을 닫거나 절전하면 중단되며, 끝난 대국은 자동 저장됩니다.</p>}
            <div className="grid grid-cols-2 gap-2">
              {!snap || snap.status === 'finished' || snap.status === 'stopped' ? (
                <button type="button" onClick={start} className={`${buttonClass.primary} col-span-2`}>
                  실험 시작 ({total}판)
                </button>
              ) : (
                <>
                  {running ? (
                    <button type="button" onClick={() => runner?.pause()} className={buttonClass.secondary}>
                      일시 정지
                    </button>
                  ) : (
                    <button type="button" onClick={() => runner?.start()} className={buttonClass.primary}>
                      계속
                    </button>
                  )}
                  <button type="button" onClick={() => runner?.stop()} className={`${buttonClass.secondary} border-warn/50 text-warn`}>
                    중단
                  </button>
                </>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-faint">
              Paired Matches: 오프닝마다 A가 선공·후공을 한 번씩 둡니다. 일시 정지는 진행 중인 대국을 끝까지 둔 뒤 멈추고, 중단은 진행 중인 대국을
              &lsquo;사용자 중단&rsquo;으로 기록합니다.
            </p>
          </div>
        </Panel>

        <Panel title="저장된 실험">
          {saved.length === 0 ? (
            <p className="text-xs text-faint">실험 결과는 대국이 끝날 때마다 이 브라우저에 자동 저장됩니다.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {saved.map((r) => {
                const s = summarize(r.config, r.games);
                return (
                  <li key={r.id} className="flex items-center gap-2">
                    <button type="button" onClick={() => setViewSaved(r)} className={`flex-1 rounded-lg px-2.5 py-1.5 text-left hover:bg-inset ${viewSaved?.id === r.id ? 'bg-inset' : ''}`}>
                      <span className="text-ink-soft">{r.config.agents.map((a) => agentLabel(a, r.config.budget)).join(' vs ')}</span>
                      <span className="ml-1 text-faint">
                        · {r.config.budget.mode === 'equal-time' ? 'ET' : 'FB'} · {s.games}판 · {r.status}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="삭제"
                      onClick={() => {
                        const next = loadSaved().filter((x) => x.id !== r.id);
                        safeStorage.set(STORAGE_KEY, JSON.stringify(next));
                        setSaved(next);
                        if (viewSaved?.id === r.id) setViewSaved(null);
                      }}
                      className="text-faint hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </aside>

      <section className="space-y-4">
        {active && summary ? (
          <>
            <Panel
              title={viewSaved ? '저장된 실험' : '진행 상황'}
              aside={
                <div className="flex items-center gap-2">
                  <BudgetBadge budget={active.config.budget} />
                  <button type="button" onClick={() => exportAs('json')} className={buttonClass.small}>
                    JSON
                  </button>
                  <button type="button" onClick={() => exportAs('csv')} className={buttonClass.small}>
                    CSV
                  </button>
                </div>
              }
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <AbLabel i={0} /> {agentLabel(active.config.agents[0], active.config.budget)} <span className="text-faint">vs</span> <AbLabel i={1} />{' '}
                    {agentLabel(active.config.agents[1], active.config.budget)}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {active.games.length}/{Math.min(MAX_TOURNAMENT_GAMES, active.config.pairs * 2)}판 · {active.status}
                    {!viewSaved && snap && ` · ${(snap.elapsedMs / 1000).toFixed(0)}s`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-inset">
                  <div className="h-1.5 rounded-full bg-accent transition-[width]" style={{ width: `${(100 * active.games.length) / Math.max(1, active.config.pairs * 2)}%` }} />
                </div>
                {!viewSaved && snap?.error && <p className="text-xs text-danger">{snap.error}</p>}
              </div>
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="A 승률 (결판난 대국)" value={summary.aWinRate ? `${Math.round(summary.aWinRate.p * 100)}%` : '—'} note={formatProportion(summary.aWinRate)} />
              <Tile label="결판 / 전체" value={`${summary.decisive} / ${summary.games}`} note={`실험 중단 ${summary.games - summary.decisive}판`} />
              <Tile label="선공 승률" value={summary.firstMoverWinRate ? `${Math.round(summary.firstMoverWinRate.p * 100)}%` : '—'} note="좌석 효과" />
              <Tile label="평균 대국 길이" value={`${fmt(summary.avgPlies, 0)} ply`} note={`중앙값 ${fmt(summary.medianPlies, 0)}`} />
            </div>

            <Panel title="세부 통계">
              <div className="space-y-3 text-xs">
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  <Stat label="A 승률 (결판난 대국 기준)" value={formatProportion(summary.aWinRate)} />
                  <Stat label="결판 / 전체" value={`${summary.decisive} / ${summary.games}`} />
                  <Stat
                    label="실험 중단 (반복 / 최대 ply / 시간 / 사용자)"
                    value={`${summary.halted.repetition} / ${summary.halted['max-plies']} / ${summary.halted['time-limit']} / ${summary.halted['user-stopped']}`}
                  />
                  <Stat label="선공 승률 (좌석 효과)" value={formatProportion(summary.firstMoverWinRate)} />
                  <Stat label="쌍 결과 (A 2승 / B 2승 / 1:1 / 중단 포함)" value={`${summary.pairs.aSweeps} / ${summary.pairs.bSweeps} / ${summary.pairs.split} / ${summary.pairs.withHalt}`} />
                  <Stat label="대국 길이 평균 / 중앙값 (ply)" value={`${fmt(summary.avgPlies, 1)} / ${fmt(summary.medianPlies, 1)}`} />
                </dl>
                {summary.decisive < 20 && (
                  <p className="rounded-md bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
                    결판난 대국이 {summary.decisive}판뿐이라 승률의 불확실성이 큽니다 (95% 신뢰구간 참고). 실험 중단은 승패에 포함하지 않았습니다.
                  </p>
                )}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] text-faint">
                      <th className="py-1 text-left font-normal">AI</th>
                      <th className="py-1 text-right font-normal">승 (선공/후공)</th>
                      <th className="py-1 text-right font-normal">결정 ms 평균/중앙</th>
                      <th className="py-1 text-right font-normal">벽 사용/대국</th>
                      <th className="py-1 text-right font-normal">노드/수</th>
                      <th className="py-1 text-right font-normal">시뮬레이션/수</th>
                      <th className="py-1 text-right font-normal">깊이</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {summary.agents.map((a, i) => (
                      <tr key={i}>
                        <td className="py-1 font-sans text-ink">
                          <AbLabel i={i} /> {a.label}
                        </td>
                        <td className="py-1 text-right text-ink">
                          {a.wins} ({a.winsAsFirst}/{a.winsAsSecond})
                        </td>
                        <td className="py-1 text-right text-ink-soft">
                          {fmt(a.decisionMsMean)}/{fmt(a.decisionMsMedian)}
                        </td>
                        <td className="py-1 text-right text-ink-soft">{fmt(a.wallsUsedMean, 1)}</td>
                        <td className="py-1 text-right text-ink-soft">{fmt(a.nodesMean)}</td>
                        <td className="py-1 text-right text-ink-soft">{fmt(a.simulationsMean)}</td>
                        <td className="py-1 text-right text-ink-soft">{fmt(a.depthMean, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-faint">
                  노드·깊이의 단위는 알고리즘마다 다릅니다 (Minimax: 탐색 노드·완료 깊이, MCTS: 트리 노드·최대 트리 깊이, BFS: 평가한 후보).
                </p>
              </div>
            </Panel>

            <Panel title="대국별 결과">
              <div className="scroll-stable max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-[11px] text-faint">
                      <th className="py-1 text-left font-normal">#</th>
                      <th className="py-1 text-left font-normal">쌍</th>
                      <th className="py-1 text-left font-normal">A 좌석</th>
                      <th className="py-1 text-left font-normal">오프닝</th>
                      <th className="py-1 text-left font-normal">결과</th>
                      <th className="py-1 text-right font-normal">ply</th>
                      <th className="py-1 text-right font-normal">초</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {active.games.map((g) => (
                      <tr key={g.index} className="odd:bg-inset/30">
                        <td className="py-0.5 text-faint">{g.index + 1}</td>
                        <td className="py-0.5 text-faint">{g.pair + 1}</td>
                        <td className="py-0.5 text-ink-soft">{g.aSeat === 0 ? '선공' : '후공'}</td>
                        <td className="py-0.5 text-muted">{g.opening.moves.join(' ') || '기본'}</td>
                        <td className={`py-0.5 font-sans ${HALT_OUTCOMES.includes(g.outcome) ? 'text-warn' : 'text-ink'}`} style={g.outcome === 'a-win' ? { color: AB_COLORS[0] } : g.outcome === 'b-win' ? { color: AB_COLORS[1] } : undefined}>
                          {OUTCOME_LABEL[g.outcome]}
                          {HALT_OUTCOMES.includes(g.outcome) && <span className="text-faint"> (승패 없음)</span>}
                        </td>
                        <td className="py-0.5 text-right text-ink-soft">{g.plies}</td>
                        <td className="py-0.5 text-right text-muted">{(g.durationMs / 1000).toFixed(1)}</td>
                      </tr>
                    ))}
                    {!viewSaved &&
                      snap?.inFlight.map((i) => (
                        <tr key={`f${i}`}>
                          <td className="py-0.5 text-faint">{i + 1}</td>
                          <td colSpan={6} className="py-0.5 font-sans text-think">
                            진행 중…
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="Experiments">
            <div className="space-y-2 text-xs leading-relaxed text-muted">
              <p>
                두 AI 사이에서 여러 대국을 자동으로 두고 결과를 집계합니다. 기본은 소규모(오프닝 3쌍 = 6판)이며, 실제 승률을 주 지표로, 실험 중단을 별도로
                보고합니다.
              </p>
              <p>
                <b className="text-ink-soft">Equal Time</b>과 <b className="text-ink-soft">Fixed Budget</b> 결과는 서로 다른 실험으로 저장되며 섞어서
                집계하지 않습니다. 현재 설정: {labels.join(' vs ')}.
              </p>
              <p>재현 가능한 대규모 평가는 Node 벤치마크(npm run bench:arena)를 사용하세요.</p>
            </div>
          </Panel>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right font-mono text-ink">{value}</dd>
    </div>
  );
}

/** Agent A / B series colours (validated light-surface categorical slots 1–2). */
const AB_COLORS = ['#2b6aa3', '#d0612b'] as const;

function AbLabel({ i }: { i: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium" style={{ color: AB_COLORS[i] }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: AB_COLORS[i] }} />
      {i === 0 ? 'A' : 'B'}
    </span>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink">{value}</p>
      {note && <p className="mt-1 truncate text-[11px] text-faint" title={note}>{note}</p>}
    </div>
  );
}
