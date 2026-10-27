import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ARENA_AGENTS, DEFAULT_BUDGET, agentLabel, defaultSpec, workerFactory } from '../arena/agentSpec';
import type { AgentSpec, Budget } from '../arena/agentSpec';
import { openingRecord } from '../arena/openings';
import { branchAt, gotoPly, loadLine, playMove, redoMove, resetToBase, undoMove } from '../compare/analysisLine';
import type { AnalysisLine } from '../compare/analysisLine';
import { MAX_COMPARE_AGENTS, agreement, traceMetrics } from '../compare/compare';
import type { CompareResult } from '../compare/compare';
import { EvalStore } from '../compare/evalStore';
import { VALUE_INFO, aiValue, positionKey, raceMargin } from '../compare/positionEval';
import { EvalChart } from '../components/analysis/EvalChart';
import type { EvalPoint } from '../components/analysis/EvalChart';
import { lineOverlay } from '../components/analysis/lineOverlay';
import { TraceDetail } from '../components/analysis/TraceDetail';
import { usePreviewBinder } from '../components/analysis/usePreviewBinder';
import { AgentPicker, BudgetBadge, BudgetPicker } from '../components/arena/AgentPicker';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { boardColumnStyle } from '../components/board/layout';
import type { BoardOverlay } from '../components/board/overlay';
import { copyText, downloadText } from '../components/download';
import { MoveLog } from '../components/panels/MoveLog';
import { Panel } from '../components/panels/Panel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { Segmented, Tabs, buttonClass, cardClass, inputClass, useBoardOrientation } from '../components/ui';
import { formatAction } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import { buildRecord, parseRecord, recordToText, replayActions } from '../match/gameRecord';
import type { GameLine } from '../match/gameRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import { NumberRow } from './ArenaView';

/** A game record sent from Play or Arena (the sender's game is never modified). */
export interface CompareSource {
  line: GameLine;
  label: string;
  sentAt: number;
}

type SourceMode = 'sent' | 'play' | 'moves' | 'file' | 'opening';
type SideTab = 'advice' | 'trace' | 'load' | 'settings';
type BottomTab = 'chart' | 'moves';

/** Validated light-surface categorical slots (all pairs pass with labels). */
const SLOT_COLORS = ['#2b6aa3', '#d0612b', '#3a8f5a'];
const MARGIN_COLOUR = '#4e6876';
const AUTO_BUDGETS = ['150', '300', '1000'] as const;

/**
 * Compare = analysis board. A record (from Play, Arena, a move list, a JSON file or a random
 * opening) is loaded as a copy; moves can be played on the board (both sides), taken back,
 * replayed, or branched into variations. Every position on screen is evaluated automatically by
 * the chosen AIs (Web Workers, cached per position and setting, stale answers ignored) and the
 * evaluation along the line is charted. A precise run uses the larger comparison budget.
 */
export function CompareView({ source, playLine, onArena }: { source: CompareSource | null; playLine: GameLine; onArena: (line: GameLine, label: string) => void }) {
  const [mode, setMode] = useState<SourceMode>('opening');
  const [sourceLabel, setSourceLabel] = useState('랜덤 오프닝 (시드 3, 6수)');
  const [moveText, setMoveText] = useState('e2 e8 e3 e7');
  const [importText, setImportText] = useState('');
  const [opening, setOpening] = useState({ seed: 3, plies: 6 });
  const [loadError, setLoadError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisLine>(() => loadLine({ actions: openingRecord({ seed: 3, plies: 6 }), ply: 6 }));
  const [specs, setSpecs] = useState<AgentSpec[]>([defaultSpec('bfs'), defaultSpec('alphabeta'), defaultSpec('mcts-guided')]);
  const [budget, setBudget] = useState<Budget>(DEFAULT_BUDGET);
  const [autoMs, setAutoMs] = useState(150);
  const [autoOn, setAutoOn] = useState(true);
  const [seed, setSeed] = useState(1);
  const [selectedAi, setSelectedAi] = useState(0);
  const [series, setSeries] = useState('margin');
  const [view, setView] = useState<'p1' | 'p2'>('p1');
  const [sideTab, setSideTab] = useState<SideTab>('advice');
  const [bottomTab, setBottomTab] = useState<BottomTab>('chart');
  const [notice, setNotice] = useState('');
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const orientation = useBoardOrientation('compare', 0);
  const storeRef = useRef<EvalStore | null>(null);
  storeRef.current ??= new EvalStore(workerFactory);
  const store = storeRef.current;
  useSyncExternalStore(store.subscribe, store.getVersion);
  const autoBudget: Budget = { mode: 'equal-time', timeMs: autoMs };

  // ------------------------------------------------------------ the line on the board
  const positions = useMemo(() => replayActions(analysis.line), [analysis.line]);
  const keys = useMemo(() => positions.map(positionKey), [positions]);
  const cursor = analysis.cursor;
  const state = positions[cursor];
  const posKey = keys[cursor];
  const owners = useMemo(() => wallOwnersFromMoves(analysis.line.slice(0, cursor)), [analysis.line, cursor]);
  const last = cursor > 0 ? analysis.line[cursor - 1] : undefined;
  const branch = branchAt(analysis);
  const branched = branch < analysis.line.length || analysis.line.length !== analysis.base.length;
  const bind = usePreviewBinder(setOverlay, `${posKey}:${sideTab}`);

  const load = (line: GameLine, label: string) => {
    setAnalysis(loadLine(line));
    setSourceLabel(label);
    setLoadError('');
  };
  // A record sent from Play / Arena replaces the analysis (as a copy).
  useEffect(() => {
    if (!source) return;
    setMode('sent');
    load(source.line, source.label);
  }, [source?.sentAt]);
  useEffect(() => () => store.cancel(), [store]);

  const loadFromMode = () => {
    if (mode === 'sent' && source) return load(source.line, source.label);
    if (mode === 'play') return load(playLine, `플레이 대국 (${playLine.actions.length}수)`);
    if (mode === 'opening') {
      const actions = openingRecord(opening);
      return load({ actions, ply: actions.length }, `랜덤 오프닝 (시드 ${opening.seed}, ${opening.plies}수)`);
    }
    const parsed = parseRecord(mode === 'moves' ? moveText : importText);
    if (!parsed.ok) return setLoadError(parsed.error);
    load(parsed.line, mode === 'moves' ? `기보 입력 (${parsed.line.actions.length}수)` : `JSON 기보 (${parsed.line.actions.length}수)`);
  };

  // ------------------------------------------------------------ automatic evaluation
  const specsKey = JSON.stringify(specs);
  useEffect(() => {
    if (!autoOn || state.winner !== null) {
      store.cancel();
      return;
    }
    store.request([{ state, key: posKey }], specs, autoBudget, seed);
  }, [posKey, autoOn, specsKey, autoMs, seed]);

  const evaluateLine = () => {
    const order = [cursor, ...positions.map((_, i) => i).filter((i) => i !== cursor)];
    store.request(order.map((i) => ({ state: positions[i], key: keys[i] })), specs, autoBudget, seed, 0);
  };
  const runPrecise = () => store.request([{ state, key: posKey }], specs, budget, seed, 0);

  // Result per AI for the position on screen: the precise run if there is one, else automatic.
  const shown = specs.map((spec, i) => {
    const precise = store.get(posKey, spec, i, budget, seed);
    const auto = store.get(posKey, spec, i, autoBudget, seed);
    const running = store.running?.posKey === posKey && store.running.specIndex === i;
    return { spec, index: i, result: precise ?? auto, precise: Boolean(precise), running };
  });
  const groups = agreement(shown.flatMap((s) => (s.result ? [s.result] : [])));
  const selected = shown[Math.min(selectedAi, shown.length - 1)];

  // ------------------------------------------------------------ chart
  const sign = view === 'p1' ? 1 : -1;
  const seriesIndex = series.startsWith('ai-') ? Number(series.slice(3)) : -1;
  const seriesSpec = seriesIndex >= 0 ? specs[seriesIndex] : undefined;
  const points: EvalPoint[] = positions.map((p, i) => {
    const move = i > 0 ? formatAction(analysis.line[i - 1].action) : undefined;
    if (!seriesSpec) return { ply: i, value: sign * raceMargin(p), move };
    const r = store.get(keys[i], seriesSpec, seriesIndex, autoBudget, seed);
    const v = r?.trace ? aiValue(r.trace, p.currentPlayer) : null;
    if (!v) return { ply: i, value: null, move };
    return { ply: i, value: sign * v.value, move, ...(v.forced ? { forced: (v.forced * sign) as 1 | -1 } : {}) };
  });
  const seriesOptions = [{ value: 'margin', label: '거리 차' }, ...specs.flatMap((s, i) => (s.kind === 'random' ? [] : [{ value: `ai-${i}`, label: ARENA_AGENTS[s.kind].name }]))];
  const valueKind = seriesSpec ? (seriesSpec.kind === 'bfs' ? 'bfs' : seriesSpec.kind.startsWith('mcts') ? 'mcts' : 'minimax') : null;
  const fmt = (v: number) => {
    if (!valueKind) return `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}걸음`;
    if (valueKind === 'mcts') return `Q ${v > 0 ? '+' : ''}${v.toFixed(2)}`;
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  };
  const viewer = view === 'p1' ? 'P1' : 'P2';
  const other = view === 'p1' ? 'P2' : 'P1';

  // ------------------------------------------------------------ actions
  const play = (action: Action) => setAnalysis((a) => playMove(a, positions[a.cursor], action));
  const currentLine: GameLine = { actions: [...analysis.line], ply: cursor };
  const exportJson = () => {
    const rec = buildRecord(currentLine, { source: 'compare', meta: { source: sourceLabel, branchAt: branch, baseLength: analysis.base.length } });
    downloadText(`quoridor-analysis-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(rec, null, 2), 'application/json');
    setNotice('JSON 파일을 저장했습니다.');
  };

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ------------------------------------------------ board column (fixed geometry) */}
      <section className="flex min-w-0 flex-col items-center gap-4">
        <div className="flex flex-col gap-2" style={boardColumnStyle(22)}>
          {/* Loaded record + AIs: one fixed row. */}
          <div className="flex h-10 items-center gap-2 overflow-hidden px-1">
            <span className="min-w-0 truncate text-sm text-ink-soft" title={sourceLabel}>
              {sourceLabel}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {specs.map((s, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                  <span className="hidden sm:inline">{ARENA_AGENTS[s.kind].name}</span>
                </span>
              ))}
            </span>
          </div>

          {/* Status: one fixed row. */}
          <div className="flex h-10 items-center justify-between gap-3 px-1 text-sm">
            <span className="min-w-0 truncate text-ink-soft">
              {state.winner !== null ? (
                <span className={PLAYER_TEXT_CLASS[state.winner]}>{PLAYER_LABEL[state.winner]} 승리 — 끝난 포지션</span>
              ) : (
                <>
                  <span className={`font-semibold ${PLAYER_TEXT_CLASS[state.currentPlayer]}`}>{PLAYER_LABEL[state.currentPlayer]}</span> 차례
                </>
              )}
              <span className="ml-2 font-mono text-xs text-faint">
                {cursor}/{analysis.line.length}수{branched ? ` · ${branch + 1}수부터 변형` : ''}
              </span>
            </span>
            <span className="w-32 shrink-0 truncate text-right text-xs text-think" data-eval-status="">
              {store.running?.posKey === posKey ? `평가 중 · ${ARENA_AGENTS[specs[store.running.specIndex]?.kind ?? 'bfs'].name}` : ''}
            </span>
          </div>

          <QuoridorBoard
            state={state}
            flipped={orientation.flipped}
            interactive={state.winner === null}
            showPaths={false}
            overlay={overlay}
            wallOwners={owners}
            lastAction={last && { action: last.action, player: last.player, from: positions[cursor - 1].pawns[last.player] }}
            idleHint={state.winner !== null ? '끝난 포지션입니다 — 무르기나 수순 목록으로 이전 포지션을 고르세요' : ''}
            onAction={play}
          />

          {/* Navigation + analysis: one fixed row. */}
          <div className="flex h-10 items-center gap-1.5 overflow-x-auto px-1 whitespace-nowrap">
            <button type="button" className={buttonClass.ghost} onClick={() => setAnalysis((a) => gotoPly(a, 0))} disabled={cursor === 0} aria-label="처음">
              ⏮
            </button>
            <button type="button" className={`${buttonClass.small} shrink-0`} onClick={() => setAnalysis(undoMove)} disabled={cursor === 0}>
              ↶ 무르기
            </button>
            <button type="button" className={`${buttonClass.small} shrink-0`} onClick={() => setAnalysis(redoMove)} disabled={cursor >= analysis.line.length}>
              다시 적용 ↷
            </button>
            <button type="button" className={buttonClass.ghost} onClick={() => setAnalysis((a) => gotoPly(a, a.line.length))} disabled={cursor >= analysis.line.length} aria-label="마지막">
              ⏭
            </button>
            {branched && (
              <button type="button" className={buttonClass.ghost} onClick={() => setAnalysis(resetToBase)} title="불러온 원래 수순으로 되돌립니다">
                원본으로
              </button>
            )}
            <button type="button" className={`${buttonClass.small} ml-auto shrink-0`} onClick={runPrecise} disabled={state.winner !== null} title="설정 탭의 정밀 분석 예산으로 다시 분석합니다">
              정밀 분석
            </button>
            <Segmented label="보드 방향" options={COMPARE_ORIENTATION} value={orientation.mode === 'p2' ? 'p2' : 'p1'} onChange={orientation.setMode} />
          </div>
        </div>

        {/* Chart / move list: fixed height under the board. */}
        <div className={`${cardClass} w-full max-w-[720px] p-3`}>
          <Tabs
            label="분석 하단"
            value={bottomTab}
            onChange={setBottomTab}
            items={[
              { id: 'chart', label: '평가 추이' },
              { id: 'moves', label: '수순', badge: analysis.line.length },
            ]}
          />
          <div className="mt-3 h-[290px]">
            <div hidden={bottomTab !== 'chart'}>
              <div className="flex h-9 items-center gap-2 overflow-x-auto whitespace-nowrap">
                <Segmented label="평가 계열" options={seriesOptions} value={series} onChange={setSeries} />
                <Segmented
                  label="관점"
                  options={[
                    { value: 'p1' as const, label: 'P1 기준' },
                    { value: 'p2' as const, label: 'P2 기준' },
                  ]}
                  value={view}
                  onChange={setView}
                />
                <button type="button" className={`${buttonClass.ghost} ml-auto`} onClick={evaluateLine} disabled={!seriesSpec} title="자동 분석 예산으로 수순의 모든 포지션을 평가합니다">
                  수순 전체 평가
                </button>
              </div>
              <EvalChart
                points={points}
                currentPly={cursor}
                onSelect={(p) => setAnalysis((a) => gotoPly(a, p))}
                colour={seriesSpec ? SLOT_COLORS[seriesIndex] : MARGIN_COLOUR}
                format={fmt}
                upLabel={`${viewer} 유리`}
                downLabel={`${other} 유리`}
                fixedMax={valueKind === 'mcts' ? 1 : undefined}
                emptyText={seriesSpec ? '아직 평가한 포지션이 없습니다 — 수를 두거나 "수순 전체 평가"' : '포지션이 없습니다'}
              />
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-faint">
                {seriesSpec && valueKind
                  ? `${agentLabel(seriesSpec, autoBudget)} · ${VALUE_INFO[valueKind].unit}: ${VALUE_INFO[valueKind].meaning}. 자동 분석 예산 ${autoMs} ms로 계산한 값만 잇습니다(평가 안 된 포지션은 빈칸).`
                  : `공통 지표 = ${other} 최단 거리 − ${viewer} 최단 거리. 모든 포지션에서 같은 방식으로 계산하는 대략적 지표이며 승률이 아닙니다.`}
              </p>
            </div>
            <div hidden={bottomTab !== 'moves'} className="h-full">
              <MoveLog
                moves={analysis.line}
                selectedPly={cursor === analysis.line.length ? null : cursor}
                onSelect={(p) => setAnalysis((a) => gotoPly(a, p ?? a.line.length))}
                variationFrom={branch < analysis.line.length ? branch : undefined}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ side tabs (fixed height, inner scroll) */}
      <aside className={`${cardClass} flex h-[36rem] min-w-0 flex-col gap-3 p-3 lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.25rem)]`}>
        <Tabs
          label="AI 비교 패널"
          value={sideTab}
          onChange={setSideTab}
          items={[
            { id: 'advice', label: '추천' },
            { id: 'trace', label: 'Trace' },
            { id: 'load', label: '불러오기' },
            { id: 'settings', label: '설정' },
          ]}
        />
        <div className="scroll-stable min-h-0 flex-1 px-2">
          <div hidden={sideTab !== 'advice'} className="space-y-3">
            <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs text-muted">
              {autoOn ? `자동 분석 ${autoMs} ms` : '자동 분석 꺼짐'} · 정밀 <BudgetBadge budget={budget} />
            </div>
            {state.winner !== null && <p className="py-6 text-center text-sm text-faint">끝난 포지션은 분석하지 않습니다.</p>}
            {state.winner === null &&
              shown.map((s) => (
                <AdviceCard
                  key={s.index}
                  index={s.index}
                  spec={s.spec}
                  result={s.result}
                  precise={s.precise}
                  running={s.running}
                  colour={SLOT_COLORS[s.index]}
                  state={state}
                  budgetLabel={agentLabel(s.spec, s.precise ? budget : autoBudget)}
                  bind={bind}
                  onOpen={() => (setSelectedAi(s.index), setSideTab('trace'))}
                />
              ))}
            {groups.length > 0 && state.winner === null && (
              <p className="rounded-xl bg-inset px-3 py-2 text-xs text-ink-soft">
                {groups.length === 1 ? `모든 AI가 ${groups[0].notation}를 추천합니다.` : groups.map((g) => `${g.notation}: ${g.labels.join(', ')}`).join(' · ')}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-faint">
              카드에 마우스를 올리면 추천 수가 보드에 표시됩니다. 점수는 알고리즘마다 의미와 척도가 달라 서로 비교하거나 승률로 읽으면 안 되며, 카드의 값은 차례인 플레이어 기준입니다.
            </p>
          </div>

          <div hidden={sideTab !== 'trace'}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {specs.map((s, i) => (
                <button key={i} type="button" onClick={() => setSelectedAi(i)} className={`${buttonClass.small} ${selectedAi === i ? 'border-accent/60 text-ink' : ''}`}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                  {ARENA_AGENTS[s.kind].name}
                </button>
              ))}
            </div>
            <Panel plain title={selected?.result ? `${selected.result.label} DecisionTrace${selected.precise ? ' (정밀)' : ''}` : 'DecisionTrace'}>
              {selected?.result?.trace && selected.result.action ? (
                <TraceDetail key={`${posKey}-${selected.index}-${selected.precise}`} entry={{ player: state.currentPlayer, action: selected.result.action, stateBefore: state, trace: selected.result.trace }} bind={bind} />
              ) : (
                <p className="py-6 text-center text-sm text-faint">{selected?.running ? '계산 중…' : '이 포지션의 평가가 아직 없습니다.'}</p>
              )}
            </Panel>
          </div>

          <div hidden={sideTab !== 'load'} className="space-y-4">
            <Panel plain title="기보 불러오기">
              <div className="space-y-3">
                <select value={mode} onChange={(e) => (setMode(e.target.value as SourceMode), setLoadError(''))} className={inputClass} aria-label="포지션 출처">
                  {source && <option value="sent">보낸 기보: {source.label}</option>}
                  <option value="play">플레이 화면의 대국</option>
                  <option value="moves">기보 직접 입력</option>
                  <option value="file">JSON 기보 파일</option>
                  <option value="opening">랜덤 오프닝</option>
                </select>
                {mode === 'moves' && <textarea value={moveText} onChange={(e) => setMoveText(e.target.value)} rows={3} className={`${inputClass} font-mono text-xs`} placeholder="1. e2 e8 2. e3 e7 …" aria-label="기보" />}
                {mode === 'file' && (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".json,application/json,text/plain"
                      aria-label="기보 파일"
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:py-1.5 file:text-xs file:text-ink-soft"
                      onChange={async (e) => setImportText((await e.target.files?.[0]?.text()) ?? '')}
                    />
                    <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} className={`${inputClass} font-mono text-[11px]`} placeholder="또는 JSON을 붙여 넣기" aria-label="JSON 기보" />
                  </div>
                )}
                {mode === 'opening' && (
                  <>
                    <NumberRow label="무작위 수" value={opening.plies} min={0} max={12} onChange={(v) => setOpening({ ...opening, plies: v })} />
                    <NumberRow label="오프닝 시드" value={opening.seed} min={0} onChange={(v) => setOpening({ ...opening, seed: v })} />
                  </>
                )}
                <button type="button" className={`${buttonClass.primary} w-full`} onClick={loadFromMode}>
                  분석 보드로 불러오기
                </button>
                {loadError && <p className="text-xs text-danger">{loadError}</p>}
                <p className="text-[11px] leading-relaxed text-faint">불러온 기보는 복사본으로 분석합니다. 분석 중 둔 수는 플레이 대국이나 원본 기보를 바꾸지 않습니다.</p>
              </div>
            </Panel>
            <Panel plain title="현재 수순 내보내기">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={buttonClass.small} onClick={async () => setNotice((await copyText(recordToText(analysis.line))) ? '수순을 복사했습니다.' : '복사하지 못했습니다.')}>
                    복사
                  </button>
                  <button type="button" className={buttonClass.small} onClick={exportJson}>
                    JSON
                  </button>
                  <button
                    type="button"
                    className={buttonClass.small}
                    disabled={state.winner !== null}
                    onClick={() => onArena(currentLine, `AI 비교 · ${cursor}수 후`)}
                    title={state.winner !== null ? '끝난 포지션입니다 — 종료 전의 수를 선택하세요' : '이 포지션에서 AI 대 AI로 이어 둡니다'}
                  >
                    AI 관전에서 이어두기
                  </button>
                </div>
                <p className="min-h-4 text-[11px] text-faint">{state.winner !== null ? '끝난 포지션은 AI 관전으로 보낼 수 없습니다 — 이전 수를 고르세요.' : notice || `보드의 포지션(${cursor}수 후)과 전체 수순을 내보냅니다.`}</p>
              </div>
            </Panel>
          </div>

          <div hidden={sideTab !== 'settings'} className="space-y-5">
            <Panel plain title="분석할 AI">
              <div className="space-y-4">
                {specs.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <AgentPicker label={`AI ${i + 1}`} accent={SLOT_COLORS[i]} value={s} budget={budget} onChange={(n) => setSpecs(specs.map((x, j) => (j === i ? n : x)))} />
                    {specs.length > 1 && (
                      <button type="button" onClick={() => (setSpecs(specs.filter((_, j) => j !== i)), setSeries('margin'), setSelectedAi(0))} className="text-[11px] text-faint hover:text-danger">
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
              </div>
            </Panel>
            <Panel plain title="자동 분석">
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs text-muted">
                  포지션이 바뀔 때마다 평가
                  <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="accent-accent" aria-label="자동 분석" />
                </label>
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  수당 시간
                  <Segmented label="자동 분석 예산" options={AUTO_BUDGETS.map((ms) => ({ value: ms, label: `${ms}ms` }))} value={String(autoMs) as (typeof AUTO_BUDGETS)[number]} onChange={(v) => setAutoMs(Number(v))} />
                </div>
                <p className="text-[11px] leading-relaxed text-faint">
                  탐색 AI는 Web Worker에서 계산합니다. 새 수를 두면 진행 중인 계산을 취소하고, 결과는 포지션·설정별로 저장해 무르기와 수순 이동 때 다시 씁니다. 가벼운 자동 분석과 정밀 분석의 값은 섞지 않습니다.
                </p>
              </div>
            </Panel>
            <Panel plain title="정밀 분석 예산" aside={<BudgetBadge budget={budget} />}>
              <div className="space-y-2">
                <BudgetPicker value={budget} onChange={setBudget} />
                <NumberRow label="시드" value={seed} min={0} onChange={setSeed} />
              </div>
            </Panel>
          </div>
        </div>
      </aside>
    </main>
  );
}

interface AdviceCardProps {
  index: number;
  spec: AgentSpec;
  result: CompareResult | undefined;
  precise: boolean;
  running: boolean;
  colour: string;
  state: GameState;
  budgetLabel: string;
  bind: ReturnType<typeof usePreviewBinder>;
  onOpen: () => void;
}

/** One AI's recommendation for the position on screen (values from the mover's view). */
function AdviceCard({ index, spec, result, precise, running, colour, state, budgetLabel, bind, onOpen }: AdviceCardProps) {
  const mover: PlayerId = state.currentPlayer;
  const value = result?.trace ? aiValue(result.trace, mover) : null;
  const own = value ? value.value * (mover === 0 ? 1 : -1) : null;
  const metrics = result?.trace ? traceMetrics(result.trace).slice(1, 3) : [];
  const binding = result?.action ? bind(`advice-${index}`, () => lineOverlay(state, [result.action!], `${result.label}: ${result.notation}`)) : {};
  return (
    <div role="button" tabIndex={0} {...binding} onClick={onOpen} data-advice={index} className="cursor-pointer rounded-2xl border border-line-soft bg-card p-4 shadow-[var(--shadow-soft)] outline-none transition-colors hover:border-line">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
        <span className="truncate">{budgetLabel}</span>
        {precise && <span className="ml-auto rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">정밀</span>}
      </div>
      <div className="mt-1 flex h-9 items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold text-ink">{result?.notation ?? (running ? '…' : '–')}</span>
        {result ? (
          <span className="text-[11px] text-faint">
            {result.action?.type === 'move' ? '말 이동' : '벽 설치'} · {result.elapsedMs?.toFixed(0)} ms
          </span>
        ) : (
          <span className="text-[11px] text-think">{running ? '계산 중' : '대기'}</span>
        )}
      </div>
      <dl className="mt-1 space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-faint">{value ? `${VALUE_INFO[value.kind].unit} (${PLAYER_LABEL[mover]} 기준)` : spec.kind === 'random' ? '평가 없음 (무작위)' : '평가값'}</dt>
          <dd className="font-mono text-ink">{own === null || !value ? '–' : value.forced ? '강제 승패' : `${own > 0 ? '+' : ''}${value.kind === 'mcts' ? own.toFixed(3) : own.toFixed(2)}`}</dd>
        </div>
        {metrics.map((m) => (
          <div key={m.label} className="flex justify-between gap-2" title={m.note}>
            <dt className="text-faint">{m.label}</dt>
            <dd className="truncate font-mono text-ink">{m.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const COMPARE_ORIENTATION = [
  { value: 'p1' as const, label: 'P1 아래' },
  { value: 'p2' as const, label: 'P2 아래' },
];
