import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BUDGET, defaultSpec, workerFactory } from '../arena/agentSpec';
import type { AgentSpec, Budget } from '../arena/agentSpec';
import { parseMoveList, randomOpening } from '../arena/openings';
import { MAX_COMPARE_AGENTS, agreement, runComparison, traceMetrics } from '../compare/compare';
import type { CompareResult } from '../compare/compare';
import { lineOverlay } from '../components/analysis/lineOverlay';
import { TraceDetail } from '../components/analysis/TraceDetail';
import { usePreviewBinder } from '../components/analysis/usePreviewBinder';
import { AgentPicker, BudgetBadge, BudgetPicker } from '../components/arena/AgentPicker';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { boardColumnStyle } from '../components/board/layout';
import type { BoardOverlay } from '../components/board/overlay';
import { Panel } from '../components/panels/Panel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { Collapsible, Segmented, buttonClass, cardClass, inputClass, useBoardOrientation } from '../components/ui';
import { createInitialState, distanceToRow, goalRow } from '../engine';
import type { GameState } from '../engine';
import { NO_WALL_OWNERS, wallOwnersFromMoves } from '../match/wallOwners';
import type { WallOwners } from '../match/wallOwners';
import { NumberRow } from './ArenaView';

export interface CompareSource {
  state: GameState;
  label: string;
  sentAt: number;
  /** Wall owners of `state` from the sender's game record. */
  wallOwners: WallOwners;
}

type SourceMode = 'sent' | 'play' | 'moves' | 'opening';

const SLOT_COLORS = ['#2b6aa3', '#d0612b', '#3a8f5a'];

/** Same GameState → several AIs → their real decisions side by side. */
export function CompareView({ source, playState, playOwners }: { source: CompareSource | null; playState: GameState; playOwners: WallOwners }) {
  const [mode, setMode] = useState<SourceMode>('opening');
  const [moveText, setMoveText] = useState('e2 e8 e3 e7');
  const [moveIndex, setMoveIndex] = useState<number | null>(null);
  const [opening, setOpening] = useState({ seed: 3, plies: 6 });
  const [specs, setSpecs] = useState<AgentSpec[]>([defaultSpec('bfs'), defaultSpec('alphabeta'), defaultSpec('mcts-guided')]);
  const [budget, setBudget] = useState<Budget>(DEFAULT_BUDGET);
  const [seed, setSeed] = useState(1);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [resultState, setResultState] = useState<GameState | null>(null);
  const [resultOwners, setResultOwners] = useState<WallOwners>(NO_WALL_OWNERS);
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState(0);
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const orientation = useBoardOrientation('compare', 0);
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);

  // A position sent from Play/Arena becomes the source.
  useEffect(() => {
    if (source) setMode('sent');
  }, [source]);
  useEffect(() => () => abort.current?.abort(), []);

  const parsed = useMemo(() => parseMoveList(moveText), [moveText]);
  // The position and its wall owners (from the record it came from; random openings have no walls).
  const { state, owners } = useMemo((): { state: GameState | null; owners: WallOwners } => {
    switch (mode) {
      case 'sent':
        return { state: source?.state ?? null, owners: source?.wallOwners ?? NO_WALL_OWNERS };
      case 'play':
        return { state: playState, owners: playOwners };
      case 'moves': {
        const k = moveIndex === null ? parsed.positions.length - 1 : Math.min(moveIndex, parsed.positions.length - 1);
        return { state: parsed.positions[k], owners: wallOwnersFromMoves(parsed.actions.slice(0, k)) };
      }
      case 'opening':
        return { state: randomOpening(opening).state, owners: NO_WALL_OWNERS };
    }
  }, [mode, source, playState, playOwners, parsed, moveIndex, opening]);

  const invalid = !state || state.winner !== null;
  const shownState = resultState ?? state ?? createInitialState();
  const shownOwners = resultState ? resultOwners : owners;
  const bind = usePreviewBinder(setOverlay, `${detail}:${results.map((r) => r.status).join()}`);

  const run = async () => {
    if (!state || invalid) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const id = ++runId.current;
    setRunning(true);
    setResultState(state);
    setResultOwners(owners);
    setDetail(0);
    try {
      await runComparison(state, specs, budget, seed, workerFactory, {
        signal: ac.signal,
        // Updates of an older run are ignored.
        onUpdate: (r) => id === runId.current && setResults(r),
      });
    } finally {
      if (id === runId.current) setRunning(false);
    }
  };
  const cancel = () => {
    abort.current?.abort();
    runId.current++;
    setRunning(false);
    setResults((rs) => rs.map((r) => (r.status === 'running' || r.status === 'pending' ? { ...r, status: 'cancelled' } : r)));
  };

  const groups = agreement(results);
  const done = results.filter((r) => r.status === 'done');
  const d0 = distanceToRow(shownState, shownState.pawns[0], goalRow(0));
  const d1 = distanceToRow(shownState, shownState.pawns[1], goalRow(1));
  const shown = results[detail];

  return (
    <main className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_420px]">
      <aside className="space-y-4">
        <Panel title="비교할 포지션">
          <div className="space-y-3">
            <select
              value={mode}
              onChange={(e) => (setMode(e.target.value as SourceMode), setResults([]), setResultState(null))}
              className={inputClass}
              aria-label="포지션 출처"
            >
              {source && <option value="sent">보낸 포지션: {source.label}</option>}
              <option value="play">Play 탭의 현재 포지션</option>
              <option value="moves">기보의 특정 턴</option>
              <option value="opening">랜덤 오프닝</option>
            </select>
            {mode === 'moves' && (
              <div className="space-y-2">
                <textarea
                  value={moveText}
                  onChange={(e) => (setMoveText(e.target.value), setMoveIndex(null))}
                  rows={3}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder="e2 e8 e3 e7 d6h …"
                  aria-label="기보"
                />
                {parsed.error && <p className="text-[11px] text-danger">{parsed.error.index + 1}번째 수 &lsquo;{parsed.error.notation}&rsquo;에서 멈췄습니다.</p>}
                <label className="block text-xs text-muted">
                  턴 선택: {moveIndex ?? parsed.positions.length - 1}수 후
                  <input
                    type="range"
                    min={0}
                    max={parsed.positions.length - 1}
                    value={moveIndex ?? parsed.positions.length - 1}
                    onChange={(e) => setMoveIndex(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </label>
              </div>
            )}
            {mode === 'opening' && (
              <>
                <NumberRow label="무작위 수" value={opening.plies} min={0} max={12} onChange={(v) => setOpening({ ...opening, plies: v })} />
                <NumberRow label="오프닝 시드" value={opening.seed} min={0} onChange={(v) => setOpening({ ...opening, seed: v })} />
              </>
            )}
            {state && (
              <p className="text-[11px] text-faint">
                {PLAYER_LABEL[state.currentPlayer]} 차례 · ply {state.ply} · 벽 {state.wallsRemaining[0]}:{state.wallsRemaining[1]}
                {state.winner !== null && <span className="text-danger"> · 이미 끝난 포지션</span>}
              </p>
            )}
          </div>
        </Panel>

        <Panel title="비교할 AI" aside={<BudgetBadge budget={budget} />}>
          <div className="space-y-4">
            {specs.map((s, i) => (
              <div key={i} className="space-y-1">
                <AgentPicker label={`AI ${i + 1}`} accent={SLOT_COLORS[i]} value={s} budget={budget} onChange={(n) => setSpecs(specs.map((x, j) => (j === i ? n : x)))} />
                {specs.length > 2 && (
                  <button type="button" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="text-[11px] text-faint hover:text-danger">
                    제거
                  </button>
                )}
              </div>
            ))}
            {specs.length < MAX_COMPARE_AGENTS && (
              <button type="button" onClick={() => setSpecs([...specs, defaultSpec('random')])} className="text-xs text-accent hover:underline">
                + AI 추가 (최대 {MAX_COMPARE_AGENTS})
              </button>
            )}
            <BudgetPicker value={budget} onChange={setBudget} />
            <NumberRow label="시드" value={seed} min={0} onChange={setSeed} />
            {running ? (
              <button type="button" onClick={cancel} className={`${buttonClass.secondary} w-full border-warn/50 text-warn`}>
                계산 취소
              </button>
            ) : (
              <button type="button" disabled={invalid} onClick={run} className={`${buttonClass.primary} w-full`}>
                같은 포지션으로 비교 실행
              </button>
            )}
            <p className="text-[11px] leading-relaxed text-faint">
              모든 AI에 같은 GameState를 순서대로 입력합니다(동시에 돌리지 않아 시간 예산이 왜곡되지 않음).
            </p>
          </div>
        </Panel>
      </aside>

      <section className="flex min-w-0 flex-col items-center gap-4">
        <div className="flex flex-col gap-2" style={boardColumnStyle(12)}>
          <QuoridorBoard state={shownState} flipped={orientation.flipped} interactive={false} showPaths={false} overlay={overlay} wallOwners={shownOwners} idleHint={`${PLAYER_LABEL[shownState.currentPlayer]} 차례 · 결과 카드에 마우스를 올리면 각 AI의 선택이 보드에 표시됩니다`} onAction={() => {}} />
          <div className="flex h-9 items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted">
              {PLAYER_LABEL[shownState.currentPlayer]} 차례 · ply {shownState.ply} · 벽 {shownState.wallsRemaining[0]}:{shownState.wallsRemaining[1]}
            </span>
            <Segmented label="보드 방향" options={COMPARE_ORIENTATION} value={orientation.mode === 'p2' ? 'p2' : 'p1'} onChange={orientation.setMode} />
          </div>
        </div>
        {results.length > 0 && (
          <div className="w-full max-w-[720px] space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {results.map((r, i) => (
                <div
                  key={i}
                  role="button"
                  {...bind(`choice-${i}`, () => lineOverlay(resultState!, r.action ? [r.action] : [], `${r.label}: ${r.notation ?? '…'}`))}
                  onClick={() => setDetail(i)}
                  className={`cursor-pointer rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] outline-none transition-colors ${detail === i ? 'border-accent/60 ring-1 ring-accent/30' : 'border-line-soft hover:border-line'}`}
                >
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                    {r.label}
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-ink">{r.status === 'done' ? r.notation : r.status === 'running' ? '…' : r.status === 'pending' ? '대기' : r.status === 'cancelled' ? '취소' : '오류'}</div>
                  {r.status === 'done' && (
                    <>
                      <div className="text-[11px] text-faint">
                        {r.action!.type === 'move' ? '말 이동' : '벽 설치'} · {r.elapsedMs!.toFixed(0)} ms
                      </div>
                      <dl className="mt-2 space-y-1 text-[11px]">
                        {traceMetrics(r.trace!).map((m) => (
                          <div key={m.label} title={m.note}>
                            <div className="flex justify-between gap-2">
                              <dt className="text-faint">{m.label}</dt>
                              <dd className="truncate font-mono text-ink">{m.value}</dd>
                            </div>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-2 border-t border-line-soft pt-1.5 font-mono text-[10.5px] text-muted">
                        둔 후 거리 P1 {d0}→{r.after!.distances[0]} · P2 {d1}→{r.after!.distances[1]}
                        {r.after!.winner !== null && <span className={PLAYER_TEXT_CLASS[r.after!.winner]}> · 즉시 승리</span>}
                      </p>
                    </>
                  )}
                  {r.error && <p className="mt-1 text-[11px] text-danger">{r.error}</p>}
                </div>
              ))}
            </div>
            {done.length >= 2 && (
              <p className="rounded-xl bg-inset px-4 py-2.5 text-sm text-ink-soft">
                {groups.length === 1
                  ? `모든 AI가 ${groups[0].notation}를 선택했습니다.`
                  : groups.map((g) => `${g.notation}: ${g.labels.join(', ')}`).join(' · ')}
              </p>
            )}
            <Collapsible title="점수를 읽는 법">
              <p className="text-xs leading-relaxed text-muted">
                각 카드의 점수는 알고리즘마다 의미와 척도가 다릅니다(Minimax 평가 = 걸음 단위, MCTS Q = −1~+1, BFS = 1수 휴리스틱). 서로 다른 AI의
                숫자를 직접 비교하지 마세요. 공통 지표는 엔진이 계산한 &lsquo;둔 후 최단 거리&rsquo;뿐입니다.
              </p>
            </Collapsible>
          </div>
        )}
      </section>

      <aside className={`${cardClass} scroll-stable min-w-0 p-5 lg:col-span-2 xl:sticky xl:top-[4.75rem] xl:col-span-1 xl:h-[calc(100svh-6.25rem)]`}>
        <Panel plain title={shown ? `${shown.label} DecisionTrace` : 'DecisionTrace'}>
          {shown?.status === 'done' && shown.trace && resultState ? (
            <TraceDetail key={`${runId.current}-${detail}`} entry={{ player: resultState.currentPlayer, action: shown.action!, stateBefore: resultState, trace: shown.trace }} bind={bind} />
          ) : (
            <p className="py-6 text-center text-sm text-faint">비교를 실행한 뒤 결과 카드를 고르면 그 AI의 실제 계산 기록이 여기에 표시됩니다.</p>
          )}
        </Panel>
      </aside>
    </main>
  );
}

const COMPARE_ORIENTATION = [
  { value: 'p1' as const, label: 'P1 아래' },
  { value: 'p2' as const, label: 'P2 아래' },
];
