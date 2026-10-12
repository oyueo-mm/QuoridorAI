import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  BOARD_SIZE,
  WALL_GRID,
  checkWallPlacement,
  formatAction,
  formatCoord,
  goalRow,
  legalPawnMoves,
  sameCoord,
  shortestPath,
  wallIndex,
} from '../../engine';
import type { Action, Coord, GameState, Orientation, PlayerId, WallAction } from '../../engine';
import { PLAYER_COLOR, PLAYER_LABEL, WALL_COLOR, WALL_RESULT_TEXT } from '../theme';
import {
  BOARD_PX,
  CELL,
  PAD,
  VIEW_PX,
  cellCenter,
  cellFromView,
  cellRect,
  cellToView,
  hitTest,
  wallAnchorFromView,
  wallAnchorToView,
  wallRect,
} from './geometry';
import type { HitTarget } from './geometry';
import type { BoardOverlay } from './overlay';

interface QuoridorBoardProps {
  state: GameState;
  /** Rotate 180° so Player 1 (engine seat 1) is drawn at the bottom. */
  flipped: boolean;
  /** Whether the player to move may act via the mouse. */
  interactive: boolean;
  /** Draw the live BFS shortest paths of both players. */
  showPaths: boolean;
  /** Most recent action, emphasised on the board. */
  lastAction?: { action: Action; player: PlayerId };
  /** Analysis preview drawn instead of the live position (board becomes read-only). */
  overlay?: BoardOverlay | null;
  /** Shown under the board when idle (e.g. "AI is thinking"). */
  idleHint?: string;
  onAction: (action: Action) => void;
}

const FILES = 'abcdefghi';

export function QuoridorBoard(props: QuoridorBoardProps) {
  const { flipped, showPaths, overlay, onAction } = props;
  const state = overlay?.state ?? props.state;
  const interactive = props.interactive && !overlay;
  const [hover, setHover] = useState<HitTarget | null>(null);

  const legalMoves = useMemo(() => (interactive ? legalPawnMoves(state) : []), [state, interactive]);
  const livePaths = useMemo(
    () =>
      showPaths && !overlay
        ? ([0, 1] as const).flatMap((p) => {
            const path = shortestPath(state, state.pawns[p], goalRow(p));
            return path ? [{ player: p as PlayerId, path }] : [];
          })
        : [],
    [state, showPaths, overlay],
  );

  const placedWalls = useMemo(() => {
    const walls: { orientation: Orientation; row: number; col: number }[] = [];
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        if (state.hWalls[wallIndex(row, col)]) walls.push({ orientation: 'h', row, col });
        if (state.vWalls[wallIndex(row, col)]) walls.push({ orientation: 'v', row, col });
      }
    }
    return walls;
  }, [state]);

  // Resolve the hovered target into an engine-level candidate action (if any).
  const candidate = useMemo(() => {
    if (!interactive || !hover) return null;
    if (hover.kind === 'cell') {
      const to = cellFromView(hover.view, flipped);
      const legal = legalMoves.some((m) => sameCoord(m, to));
      return legal ? { action: { type: 'move', to } as Action, ok: true, hint: `${formatCoord(to)}로 이동` } : null;
    }
    const anchor = wallAnchorFromView(hover.view.row, hover.view.col, flipped);
    const action: WallAction = { type: 'wall', orientation: hover.orientation, ...anchor };
    const result = checkWallPlacement(state, action);
    return {
      action: action as Action,
      ok: result === 'ok',
      hint: `벽 ${formatAction(action)} — ${WALL_RESULT_TEXT[result]}`,
    };
  }, [hover, interactive, flipped, legalMoves, state]);

  const toBoardSpace = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = VIEW_PX / rect.width;
    return { x: (e.clientX - rect.left) * scale - PAD, y: (e.clientY - rect.top) * scale - PAD };
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const { x, y } = toBoardSpace(e);
    const next = hitTest(x, y);
    setHover((prev) => (sameTarget(prev, next) ? prev : next));
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive || e.button !== 0) return;
    // Recompute from the event so taps on touch screens (no hover) work too.
    const { x, y } = toBoardSpace(e);
    const target = hitTest(x, y);
    setHover(target);
    if (!target) return;
    if (target.kind === 'cell') {
      const to = cellFromView(target.view, flipped);
      if (legalMoves.some((m) => sameCoord(m, to))) onAction({ type: 'move', to });
      return;
    }
    const anchor = wallAnchorFromView(target.view.row, target.view.col, flipped);
    const action: WallAction = { type: 'wall', orientation: target.orientation, ...anchor };
    if (checkWallPlacement(state, action) === 'ok') onAction(action);
  };

  const mover = state.currentPlayer;
  const hoverCell = hover?.kind === 'cell' ? hover.view : null;
  const highlight = overlay ? overlay.highlight : props.lastAction;
  const paths = overlay ? overlay.paths : livePaths;

  let hint = '';
  if (overlay) hint = '분석 미리보기 중 — 패널에서 마우스를 떼면 실제 보드로 돌아갑니다';
  else if (candidate) hint = candidate.hint;
  else if (interactive) hint = '칸을 클릭해 이동하거나, 칸 사이 홈을 클릭해 벽을 설치하세요';
  else hint = props.idleHint ?? '';

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="relative w-full max-w-[640px]">
        {overlay && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="mt-1.5 rounded-full border border-amber-400/40 bg-slate-950/90 px-3 py-1 text-xs text-amber-200 shadow">
              {overlay.title}
            </span>
          </div>
        )}
        <svg
          viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`}
          className={`w-full touch-none select-none ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={handlePointerUp}
          role="img"
          aria-label="쿼리도 보드"
        >
          <rect
            x={0}
            y={0}
            width={VIEW_PX}
            height={VIEW_PX}
            rx={18}
            className="fill-slate-900"
            stroke={overlay ? '#fbbf24' : 'none'}
            strokeOpacity={0.5}
            strokeWidth={2}
          />
          <CoordinateLabels flipped={flipped} />
          <g transform={`translate(${PAD} ${PAD})`}>
            {/* Cells, outlined on each player's goal row. */}
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
              const view = { row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE };
              const cell = cellFromView(view, flipped);
              const goalOf: PlayerId | null =
                cell.row === goalRow(0) ? 0 : cell.row === goalRow(1) ? 1 : null;
              return (
                <rect
                  key={i}
                  {...cellRect(view)}
                  rx={6}
                  className="fill-slate-800"
                  stroke={goalOf === null ? 'none' : PLAYER_COLOR[goalOf]}
                  strokeOpacity={0.45}
                  strokeWidth={goalOf === null ? 0 : 1.5}
                />
              );
            })}

            {/* Shortest paths: live BFS (dashed) or the AI's evaluated paths (solid). */}
            {paths.map(({ player, path }) =>
              path.length > 1 ? (
                <polyline
                  key={player}
                  points={path
                    .map((c) => cellCenter(cellToView(c, flipped)))
                    .map(({ x, y }) => `${x + (player === 0 ? -5 : 5)},${y + (player === 0 ? -5 : 5)}`)
                    .join(' ')}
                  fill="none"
                  stroke={PLAYER_COLOR[player]}
                  strokeOpacity={overlay ? 0.9 : 0.6}
                  strokeWidth={overlay ? 4 : 3}
                  strokeDasharray={overlay ? undefined : '6 6'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null,
            )}

            {/* Legal move markers for the player to move. */}
            {legalMoves.map((m) => {
              const view = cellToView(m, flipped);
              const { x, y } = cellCenter(view);
              const hovered = hoverCell !== null && sameCoord(hoverCell, view);
              return (
                <g key={`${m.row},${m.col}`} pointerEvents="none">
                  {hovered && <rect {...cellRect(view)} rx={6} fill={PLAYER_COLOR[mover]} fillOpacity={0.2} />}
                  <circle cx={x} cy={y} r={hovered ? 9 : 6} fill={PLAYER_COLOR[mover]} fillOpacity={hovered ? 0.95 : 0.55} />
                </g>
              );
            })}

            {/* Placed walls. */}
            {placedWalls.map((w) => (
              <rect
                key={`${w.orientation}${w.row},${w.col}`}
                {...wallRect(w.orientation, wallAnchorToView(w.row, w.col, flipped))}
                rx={3}
                fill={WALL_COLOR}
                pointerEvents="none"
              />
            ))}

            {/* Highlighted action (last move, or the previewed candidate). */}
            {highlight && <ActionHighlight {...highlight} flipped={flipped} strong={Boolean(overlay)} />}

            {/* Wall placement preview. */}
            {candidate && candidate.action.type === 'wall' && hover?.kind === 'wall' && (
              <rect
                {...wallRect(hover.orientation, hover.view)}
                rx={3}
                fill={candidate.ok ? PLAYER_COLOR[mover] : '#ef4444'}
                fillOpacity={candidate.ok ? 0.8 : 0.45}
                pointerEvents="none"
              />
            )}

            {/* Pawns. */}
            {([0, 1] as const).map((p) => {
              const { x, y } = cellCenter(cellToView(state.pawns[p], flipped));
              const active = state.winner === null && p === mover;
              return (
                <g key={p} pointerEvents="none">
                  {active && (
                    <circle cx={x} cy={y} r={CELL * 0.4} fill="none" stroke={PLAYER_COLOR[p]} strokeOpacity={0.6} strokeWidth={2} />
                  )}
                  <circle cx={x} cy={y} r={CELL * 0.32} fill={PLAYER_COLOR[p]} stroke="#0f172a" strokeWidth={2} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-white text-[15px] font-bold">
                    {PLAYER_LABEL[p]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="min-h-5 text-center font-mono text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function ActionHighlight({
  action,
  player,
  flipped,
  strong,
}: {
  action: Action;
  player: PlayerId;
  flipped: boolean;
  strong: boolean;
}) {
  if (action.type === 'wall') {
    const r = wallRect(action.orientation, wallAnchorToView(action.row, action.col, flipped));
    return (
      <rect
        x={r.x - 3}
        y={r.y - 3}
        width={r.width + 6}
        height={r.height + 6}
        rx={5}
        fill="none"
        stroke={strong ? '#ffffff' : PLAYER_COLOR[player]}
        strokeWidth={strong ? 2.5 : 2}
        strokeDasharray={strong ? undefined : '4 3'}
        pointerEvents="none"
      />
    );
  }
  const view = cellToView(action.to, flipped);
  const r = cellRect(view);
  return (
    <rect
      x={r.x + 2}
      y={r.y + 2}
      width={r.width - 4}
      height={r.height - 4}
      rx={6}
      fill="none"
      stroke={strong ? '#ffffff' : PLAYER_COLOR[player]}
      strokeWidth={2}
      strokeDasharray={strong ? undefined : '4 3'}
      pointerEvents="none"
    />
  );
}

function sameTarget(a: HitTarget | null, b: HitTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind || !sameCoord(a.view, b.view)) return false;
  return a.kind === 'cell' || (b.kind === 'wall' && a.orientation === b.orientation);
}

function CoordinateLabels({ flipped }: { flipped: boolean }) {
  const labels = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const engine: Coord = cellFromView({ row: i, col: i }, flipped);
    const { x, y } = cellCenter({ row: i, col: i });
    labels.push(
      <text key={`f${i}`} x={PAD + x} y={PAD + BOARD_PX + PAD / 2 + 1} textAnchor="middle" dominantBaseline="central" className="fill-slate-500 font-mono text-[11px]">
        {FILES[engine.col]}
      </text>,
      <text key={`r${i}`} x={PAD / 2} y={PAD + y} textAnchor="middle" dominantBaseline="central" className="fill-slate-500 font-mono text-[11px]">
        {BOARD_SIZE - engine.row}
      </text>,
    );
  }
  return <g pointerEvents="none">{labels}</g>;
}
