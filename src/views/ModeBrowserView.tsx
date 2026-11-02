import { useEffect, useMemo, useRef, useState } from 'react';
import { agentName } from '../ai/catalog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MultiGameStage } from '../components/board/GameStage';
import { multiBoardRules } from '../components/board/boardRules';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { ModeCards } from '../components/panels/ModeCards';
import { SetupFields, draftsForMode } from '../components/panels/ModeSettings';
import { PlayerChip } from '../components/panels/PlayerStrip';
import { sidePanelGrid } from '../components/panels/SidePanel';
import { OBSTACLE_WALL } from '../components/theme';
import { ORIENTATION_OPTIONS, Segmented, buttonClass, cardClass, useBoardOrientation } from '../components/ui';
import { TEAM_NAMES, goalDistanceMulti, seatSlot, teamOf } from '../engine';
import type { MultiRules } from '../engine';
import { isMultiMode, localSeatName, modeInfo } from '../session/config';
import type { GameMode } from '../session/config';
import { layoutKey, needsObstacleMap, computePreview, obstacleKey, previewBrief } from '../session/modePreview';
import type { ModePreview, PreviewResult } from '../session/modePreview';
import { generateObstacleMap } from '../session/obstacleGen';
import { recommendedConfig, resolveNames, validateMultiConfig } from '../session/MultiController';
import type { MultiConfig } from '../session/MultiController';
import { seatText } from '../session/seatInfo';
import type { PlaySetupApi } from './playSetup';

/** The game that is running behind the browser (it is left untouched until a start is confirmed). */
export interface RunningGame {
  mode: GameMode;
  /** Moves played so far (0 = nothing to lose). */
  plies: number;
  finished: boolean;
}

/**
 * Mode browser: pick a mode, see its real initial board, tune the settings, start. Everything here
 * is a draft — the running game (kept alive by App) is only replaced by "게임 시작" after a
 * confirmation when it has moves, and "현재 게임으로 돌아가기" closes this without touching it.
 * The preview board is built from the same rules data as a real start (see modePreview.ts).
 */
export function ModeBrowserView({ setup, initialMode, running, onClose }: { setup: PlaySetupApi; initialMode: GameMode; running: RunningGame; onClose: () => void }) {
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [draft, setDraft] = useState(setup.config);
  const [multiDraft, setMultiDraft] = useState<MultiConfig>(() => (isMultiMode(initialMode) && initialMode !== setup.multiConfig.mode ? recommendedConfig(initialMode, setup.multiConfig.names) : setup.multiConfig));
  const [confirming, setConfirming] = useState(false);
  const info = modeInfo(mode);
  const multi = isMultiMode(mode);

  const choose = (next: GameMode) => {
    const d = draftsForMode(next, draft, multiDraft);
    setMode(next);
    setDraft(d.draft);
    setMultiDraft(d.multiDraft);
  };

  const { result, pending, shown, obstacleMap } = usePreview(mode, multiDraft);
  const errors = multi ? validateMultiConfig(multiDraft) : [];
  const canStart = result?.ok === true && errors.length === 0;

  const start = () => {
    // The obstacle map the preview already generated is reused, so starting never generates it again on the main thread.
    if (multi) setup.startMulti(multiDraft, obstacleMap ? { obstacleMap } : undefined);
    else setup.startTwoPlayer(mode === 'local-2p' ? { ...draft, opponent: 'human', userSeat: 0 } : { ...draft, opponent: draft.opponent === 'human' ? 'minimax' : draft.opponent });
    onClose();
  };
  const requestStart = () => (running.plies > 0 ? setConfirming(true) : start());

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const runningInfo = modeInfo(running.mode);

  return (
    <main className={sidePanelGrid(true)} data-view="mode-browser" data-mode={mode}>
      <div className="sticky top-14 z-10 -mx-4 flex gap-2 border-b border-line-soft bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden" data-mobile-jump>
        <button type="button" className={`${buttonClass.small} flex-1`} onClick={() => jump('mode-preview')}>
          보드 미리보기
        </button>
        <button type="button" className={`${buttonClass.small} flex-1`} onClick={() => jump('mode-settings')}>
          모드·설정
        </button>
      </div>

      <div id="mode-preview" className="scroll-mt-28">
        {shown ? (
          <PreviewStage
            preview={shown}
            stale={pending || !result?.ok}
            pending={pending}
            names={previewNames(shown.mode, draft, multiDraft, shown)}
            aiSlots={multi ? Array.from({ length: shown.setup.rules.players.length }, (_, i) => multiDraft.controllers?.[i]?.kind === 'ai') : []}
            userSeat={mode === 'vs-ai' ? draft.userSeat : 0}
            running={running}
          />
        ) : (
          <div className="flex aspect-square max-w-[640px] items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted" data-preview-pending>
            미리보기를 만드는 중…
          </div>
        )}
      </div>

      <aside id="mode-settings" aria-label="게임 모드 선택" className={`${cardClass} flex min-w-0 scroll-mt-28 flex-col lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.25rem)]`}>
        <div className="flex items-start justify-between gap-2 border-b border-line-soft p-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">게임 모드 선택</h2>
            <p className="mt-0.5 truncate text-xs text-muted" data-running-info>
              현재 게임: {runningInfo.title}
              {running.plies > 0 ? ` · ${running.plies}수${running.finished ? ' (종료)' : ''}` : ' · 시작 전'}
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${buttonClass.small} shrink-0`} data-back-to-game>
            ← 현재 게임으로
          </button>
        </div>

        {/* pb-24 on small screens: the sticky start button must not cover the last settings */}
        <div className="space-y-4 p-3 pb-24 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-3">
          <ModeCards selected={mode} playing={running.mode} onChoose={choose} />

          {shown && <Brief preview={shown} />}

          <h3 className="border-t border-line-soft pt-3 text-xs font-medium text-muted">{info.title} 설정</h3>
          <SetupFields mode={mode} draft={draft} setDraft={setDraft} multiDraft={multiDraft} setMultiDraft={setMultiDraft} />
        </div>

        <div className="sticky bottom-0 space-y-1.5 rounded-b-2xl border-t border-line-soft bg-card p-3">
          {mode === running.mode && running.plies > 0 && <p className="text-xs text-warn/90">지금 진행 중인 모드입니다. 시작하면 현재 대국이 새로 시작됩니다.</p>}
          <button
            type="button"
            onClick={requestStart}
            disabled={!canStart}
            data-start-game
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            {pending ? '맵 생성 중…' : `${info.title} 시작`}
          </button>
        </div>
      </aside>

      {confirming && (
        <ConfirmDialog title="진행 중인 게임을 끝내고 새로 시작할까요?" confirmLabel="새 게임 시작" cancelLabel="계속 설정하기" onCancel={() => setConfirming(false)} onConfirm={start}>
          {runningInfo.title} {running.finished ? '종료된 대국' : '대국'}({running.plies}수)의 말 위치와 기보가 사라지고 <b>{info.title}</b>가 시작됩니다.
          <br />
          취소하면 이 화면에 남고, 현재 게임은 그대로입니다.
        </ConfirmDialog>
      )}
    </main>
  );
}

/**
 * The preview of the selected mode, computed only when something that changes the board changes.
 * Obstacle maps are generated in a worker; a result that arrives after the settings moved on is
 * dropped. While a new one is pending (or the settings are invalid) the last valid board stays.
 */
function usePreview(mode: GameMode, multiDraft: MultiConfig): { result: PreviewResult | null; pending: boolean; shown: ModePreview | null; obstacleMap: MultiRules | undefined } {
  const key = layoutKey(mode, multiDraft);
  const generated = mode === 'obstacle' && needsObstacleMap(mode, multiDraft);
  const mapKey = obstacleKey(multiDraft);
  const [map, setMap] = useState<{ key: string; rules: MultiRules } | null>(null);

  useEffect(() => {
    if (!generated) return;
    let current = true;
    generateObstacleMap(multiDraft.obstacle!)
      .then((rules) => {
        if (current) setMap({ key: mapKey, rules });
      })
      .catch(() => undefined); // superseded by newer settings
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapKey encodes the obstacle settings
  }, [generated, mapKey]);

  const ready = map?.key === mapKey ? map.rules : undefined;
  const result = useMemo<PreviewResult | null>(
    () => (mode === 'obstacle' && generated && !ready ? null : computePreview(mode, multiDraft, ready)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes every setting the board depends on
    [mode, key, ready, generated],
  );
  const last = useRef<ModePreview | null>(null);
  if (result?.ok) last.current = result.preview;
  return { result, pending: result === null, shown: result?.ok ? result.preview : last.current, obstacleMap: mode === 'obstacle' && generated ? ready : undefined };
}

/** Name shown on each seat's card. */
function previewNames(mode: GameMode, draft: PlaySetupApi['config'], multiDraft: MultiConfig, p: ModePreview): string[] {
  if (mode === 'vs-ai') return [0, 1].map((s) => (s === draft.userSeat ? '나' : `${agentName(draft.opponent === 'human' ? 'minimax' : draft.opponent)} (AI)`));
  if (mode === 'local-2p') return [0, 1].map((s) => localSeatName({ ...draft, opponent: 'human' }, s as 0 | 1));
  return resolveNames(multiDraft.names, p.setup.rules.players.length, multiDraft.controllers);
}

function PreviewStage({ preview, stale, pending, names, aiSlots, userSeat, running }: { preview: ModePreview; stale: boolean; pending: boolean; names: string[]; aiSlots: boolean[]; userSeat: 0 | 1; running: RunningGame }) {
  const { state, setup } = preview;
  const rules = setup.rules;
  const boardRules = useMemo(() => multiBoardRules(rules), [rules]);
  const twoPlayer = preview.mode === 'vs-ai' || preview.mode === 'local-2p';
  // Same remembered orientation as Play: in 사람 vs AI the user's pawn is at the bottom.
  const orientation = useBoardOrientation('play', userSeat);
  const flipped = twoPlayer && orientation.flipped;
  const info = modeInfo(preview.mode);
  const teamed = !!rules.teams;
  const slotOf = (seat: number) => seatSlot(rules, seat);

  const seat = (s: number) => {
    const slot = slotOf(s);
    return (
      <PlayerChip
        player={slot}
        name={names[slot]}
        isAi={!!aiSlots[slot]}
        thinking={false}
        wallsRemaining={state.wallsRemaining[s]}
        wallsTotal={setup.wallsPerPlayer[s]}
        distance={goalDistanceMulti(state, s)}
        active={false}
        winner={false}
        seatHint={seatText(rules.players[s])}
        team={teamed ? { letter: 'AB'[teamOf(rules, s)], name: TEAM_NAMES[teamOf(rules, s)] } : undefined}
      />
    );
  };

  const banner = (
    <p className="flex h-10 items-center gap-2 px-1 text-sm text-ink-soft" data-preview-banner>
      <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn">미리보기</span>
      <span className="truncate">{info.title}</span>
      <span className="truncate text-xs text-faint">· 실제 게임은 아직 시작되지 않았습니다</span>
    </p>
  );

  return (
    <div data-preview-mode={preview.mode} data-preview-stale={stale || undefined}>
      <MultiGameStage
        reserved={30}
        reservedWide={9}
        seats={twoPlayer ? (flipped ? [0, 1] : [1, 0]) : rules.turnOrder}
        seat={seat}
        status={banner}
        side={
          <>
            <p className="text-center text-[11px] font-medium text-muted">
              {info.title}
              <span className="ml-1.5 rounded bg-warn/10 px-1 text-warn">{info.official ? '공식' : '변형'}</span>
            </p>
            <p className="text-center text-xs font-medium text-warn">미리보기</p>
            {boardRules.neutralWalls && (
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted" data-obstacle-legend>
                <span className="inline-block h-2 w-6 rounded-sm" style={{ background: OBSTACLE_WALL.fill, border: `1px solid ${OBSTACLE_WALL.stroke}` }} aria-hidden />
                중립 벽 {boardRules.neutralWalls.size}개
              </p>
            )}
          </>
        }
        board={
          <div className="relative">
            <div className={`rounded-2xl outline-2 -outline-offset-2 outline-dashed outline-warn/35 transition-opacity ${stale ? 'opacity-50' : ''}`}>
              <QuoridorBoard state={state} rules={boardRules} flipped={flipped} interactive={false} showPaths={false} idleHint="미리보기 — 말과 벽을 둘 수 없습니다" onAction={() => undefined} />
            </div>
            {pending && (
              <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-card/95 px-3 py-1 text-xs text-ink-soft shadow-[var(--shadow-soft)]" role="status" data-generating>
                장애물 맵 생성 중…
              </p>
            )}
          </div>
        }
        controls={
          <div className="flex min-h-9 flex-wrap items-center gap-2 px-1">
            <span className="text-xs text-muted">
              진행 중인 {modeInfo(running.mode).title} 대국은 그대로 유지됩니다.
            </span>
            {twoPlayer && (
              <span className="ml-auto">
                <Segmented label="보드 방향" options={ORIENTATION_OPTIONS} value={orientation.mode} onChange={orientation.setMode} />
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}

function Brief({ preview }: { preview: ModePreview }) {
  return (
    <dl className="space-y-1.5 rounded-xl bg-inset px-3 py-2.5 text-xs" data-mode-brief>
      {previewBrief(preview).map((l) => (
        <div key={l.label} className="grid grid-cols-[4.5rem_1fr] gap-x-2">
          <dt className="text-faint">{l.label}</dt>
          <dd className="whitespace-pre-line text-ink-soft">{l.text}</dd>
        </div>
      ))}
    </dl>
  );
}
