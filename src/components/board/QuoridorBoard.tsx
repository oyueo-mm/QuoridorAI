import { useId, useMemo, useState } from 'react';
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
import { wallKey } from '../../match/wallOwners';
import type { WallOwners } from '../../match/wallOwners';
import { BOARD_COLORS, NEUTRAL_WALL, PLAYER_COLOR, PLAYER_LABEL, WALL_COLORS, WALL_RESULT_TEXT } from '../theme';
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
  /** Rotate 180° so Player 2 (engine seat 1) is drawn at the bottom. */
  flipped: boolean;
  /** Whether the player to move may act via the mouse. */
  interactive: boolean;
  /** Draw the live BFS shortest paths of both players. */
  showPaths: boolean;
  /** Most recent action, emphasised on the board. */
  lastAction?: LastMove;
  /** Analysis preview drawn instead of the live position (board becomes read-only). */
  overlay?: BoardOverlay | null;
  /** Shown under the board when idle (e.g. "AI is thinking"). */
  idleHint?: string;
  /** Who placed each wall of `state` (from the game record). Walls without an entry are neutral. */
  wallOwners?: WallOwners;
  onAction: (action: Action) => void;
}

const FILES = 'abcdefghi';

/**
 * The board. Its box is a fixed square (aspect-ratio) and the hint line below has a fixed
 * height, so nothing on the page moves when the position, the hint or the overlay changes.
 */
export function QuoridorBoard(props: QuoridorBoardProps) {
  const { flipped, showPaths, overlay, onAction } = props;
  const state = overlay?.state ?? props.state;
  const interactive = props.interactive && !overlay;
  const [hover, setHover] = useState<HitTarget | null>(null);
  const stripesId = `qz-stripes-${useId().replace(/:/g, '')}`;

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

  // Walls of the drawn position. Only walls that exist in the real position (props.state) are
  // confirmed; walls that appear only in an analysis overlay are hypothetical and drawn as such.
  const placedWalls = useMemo(() => {
    const real = props.state;
    const previewOwner = new Map<string, PlayerId>();
    for (const m of [...(overlay?.marks ?? []), ...(overlay?.highlight ? [overlay.highlight] : [])]) {
      if (m.action.type === 'wall') previewOwner.set(wallKey(m.action.orientation, m.action.row, m.action.col), m.player);
    }
    const walls: PlacedWall[] = [];
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        const i = wallIndex(row, col);
        for (const orientation of ['h', 'v'] as const) {
          if (!(orientation === 'h' ? state.hWalls[i] : state.vWalls[i])) continue;
          const key = wallKey(orientation, row, col);
          const confirmed = (orientation === 'h' ? real.hWalls[i] : real.vWalls[i]) !== 0;
          const owner = confirmed ? (props.wallOwners?.get(key) ?? null) : (previewOwner.get(key) ?? null);
          walls.push({ orientation, row, col, key, confirmed, owner });
        }
      }
    }
    return walls;
  }, [state, props.state, props.wallOwners, overlay]);

  // Hovering a placed wall names its owner (also when the board is read-only).
  const wallInfo = useMemo(() => {
    if (!hover || hover.kind !== 'wall') return null;
    const anchor = wallAnchorFromView(hover.view.row, hover.view.col, flipped);
    const w = placedWalls.find((x) => x.orientation === hover.orientation && x.row === anchor.row && x.col === anchor.col);
    if (!w) return null;
    const name = formatAction({ type: 'wall', orientation: w.orientation, row: w.row, col: w.col });
    if (!w.confirmed) return `벽 ${name} — 분석 미리보기의 가상 벽 (실제로 놓이지 않음)`;
    return `벽 ${name} — ${w.owner === null ? '설치한 플레이어 기록 없음' : `${PLAYER_LABEL[w.owner]}가 설치`}`;
  }, [hover, flipped, placedWalls]);

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
  const paths = overlay ? overlay.paths : livePaths;

  let hint = '';
  if (wallInfo) hint = wallInfo;
  else if (overlay) hint = '분석 미리보기 중 — 패널에서 마우스를 떼면 실제 보드로 돌아갑니다';
  else if (candidate) hint = candidate.hint;
  else if (interactive) hint = '칸을 눌러 이동하거나, 칸 사이 홈을 눌러 벽을 놓으세요';
  else hint = props.idleHint ?? '';

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="relative aspect-square w-full">
        {overlay && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="mt-2 max-w-[90%] truncate rounded-full border border-warn/30 bg-card/95 px-3 py-1 text-xs text-warn shadow-[var(--shadow-soft)]">
              {overlay.title}
            </span>
          </div>
        )}
        <svg
          viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`}
          className={`absolute inset-0 h-full w-full touch-none select-none ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={handlePointerUp}
          role="img"
          aria-label="쿼리도 보드"
        >
          <defs>
            {/* Texture for P2 walls (unique id: several boards are mounted at once). */}
            <pattern id={stripesId} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              <rect width={2.2} height={6} fill="#fbf9f5" fillOpacity={0.35} />
            </pattern>
          </defs>
          <rect
            x={0}
            y={0}
            width={VIEW_PX}
            height={VIEW_PX}
            rx={22}
            fill={BOARD_COLORS.frame}
            stroke={overlay ? BOARD_COLORS.preview : 'none'}
            strokeOpacity={0.55}
            strokeWidth={3}
          />
          <rect x={PAD - 6} y={PAD - 6} width={BOARD_PX + 12} height={BOARD_PX + 12} rx={14} fill={BOARD_COLORS.groove} />
          {/* Goal markers: a bar in each player's colour along the edge that player must reach. */}
          {([0, 1] as const).map((p) => {
            const atTop = cellToView({ row: goalRow(p), col: 0 }, flipped).row === 0;
            return <rect key={p} x={PAD + 8} y={atTop ? PAD - 12 : PAD + BOARD_PX + 8} width={BOARD_PX - 16} height={4} rx={2} fill={PLAYER_COLOR[p]} fillOpacity={0.55} pointerEvents="none" />;
          })}
          <CoordinateLabels flipped={flipped} />
          <g transform={`translate(${PAD} ${PAD})`}>
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => (
              <rect key={i} {...cellRect({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE })} rx={8} fill={BOARD_COLORS.cell} />
            ))}

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
                  strokeOpacity={overlay ? 0.85 : 0.4}
                  strokeWidth={overlay ? 3.5 : 2.5}
                  strokeDasharray={overlay ? undefined : '5 7'}
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
                  {hovered && <rect {...cellRect(view)} rx={8} fill={PLAYER_COLOR[mover]} fillOpacity={0.14} />}
                  <circle cx={x} cy={y} r={hovered ? 8 : 5.5} fill={PLAYER_COLOR[mover]} fillOpacity={hovered ? 0.8 : 0.35} />
                </g>
              );
            })}

            {/* Placed walls in their owner's colour (hypothetical ones from previews are see-through). */}
            {placedWalls.map((w) => (
              <WallShape key={w.key} wall={w} rect={wallRect(w.orientation, wallAnchorToView(w.row, w.col, flipped))} stripesId={stripesId} />
            ))}

            {/* Highlighted action (last move, or the previewed candidate). */}
            {overlay?.marks?.map((m, i) => (
              <ActionHighlight key={i} {...m} flipped={flipped} variant="mark" />
            ))}
            {overlay
              ? overlay.highlight && <ActionHighlight {...overlay.highlight} flipped={flipped} variant="strong" />
              : props.lastAction && <LastMoveMark key={lastMoveKey(props.lastAction)} last={props.lastAction} flipped={flipped} />}

            {/* Wall placement preview. */}
            {candidate && candidate.action.type === 'wall' && hover?.kind === 'wall' && (
              <rect
                {...wallRect(hover.orientation, hover.view)}
                rx={4}
                fill={candidate.ok ? WALL_COLORS[mover] : BOARD_COLORS.invalid}
                fillOpacity={candidate.ok ? 0.55 : 0.35}
                pointerEvents="none"
              />
            )}

            {/* Pawns. */}
            {([0, 1] as const).map((p) => {
              const { x, y } = cellCenter(cellToView(state.pawns[p], flipped));
              const active = state.winner === null && p === mover;
              return (
                <g key={p} pointerEvents="none">
                  {active && <circle cx={x} cy={y} r={CELL * 0.43} fill="none" stroke={PLAYER_COLOR[p]} strokeOpacity={0.35} strokeWidth={2.5} />}
                  <circle cx={x} cy={y + 1.5} r={CELL * 0.31} fill={BOARD_COLORS.ink} fillOpacity={0.12} />
                  <circle cx={x} cy={y} r={CELL * 0.31} fill={PLAYER_COLOR[p]} stroke={BOARD_COLORS.cell} strokeWidth={2.5} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fbf9f5" className="text-[14px] font-semibold">
                    {PLAYER_LABEL[p]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="h-5 w-full truncate text-center text-xs leading-5 text-muted" title={hint}>
        {hint}
      </p>
    </div>
  );
}

/**
 * Outline of an action: 'last' = previous move (dashed, player colour), 'strong' = previewed
 * action (solid ink), 'mark' = other step of a previewed line (translucent, dashed, numbered).
 */
function ActionHighlight({
  action,
  player,
  label,
  flipped,
  variant,
}: {
  action: Action;
  player: PlayerId;
  label?: string;
  flipped: boolean;
  variant: 'last' | 'strong' | 'mark';
}) {
  const stroke = variant === 'strong' ? BOARD_COLORS.ink : PLAYER_COLOR[player];
  const dash = variant === 'strong' ? undefined : '4 3';
  let shape;
  let badge: { x: number; y: number };
  if (action.type === 'wall') {
    const r = wallRect(action.orientation, wallAnchorToView(action.row, action.col, flipped));
    shape = (
      <rect
        x={r.x - 3}
        y={r.y - 3}
        width={r.width + 6}
        height={r.height + 6}
        rx={6}
        fill={variant === 'mark' ? PLAYER_COLOR[player] : 'none'}
        fillOpacity={0.25}
        stroke={stroke}
        strokeOpacity={variant === 'last' ? 0.7 : 1}
        strokeWidth={variant === 'strong' ? 2.5 : 2}
        strokeDasharray={dash}
      />
    );
    badge = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  } else {
    const r = cellRect(cellToView(action.to, flipped));
    shape = (
      <rect
        x={r.x + 2}
        y={r.y + 2}
        width={r.width - 4}
        height={r.height - 4}
        rx={8}
        fill={variant === 'mark' ? PLAYER_COLOR[player] : 'none'}
        fillOpacity={0.12}
        stroke={stroke}
        strokeOpacity={variant === 'last' ? 0.7 : 1}
        strokeWidth={2}
        strokeDasharray={dash}
      />
    );
    badge = { x: r.x + 11, y: r.y + 11 };
  }
  return (
    <g pointerEvents="none">
      {shape}
      {label && (
        <g>
          <circle cx={badge.x} cy={badge.y} r={9} fill={BOARD_COLORS.cell} stroke={PLAYER_COLOR[player]} strokeWidth={1.5} />
          <text x={badge.x} y={badge.y} textAnchor="middle" dominantBaseline="central" fill={BOARD_COLORS.ink} className="font-mono text-[10px] font-bold">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** The previous move: action, player and (for pawn moves) the cell it came from. */
export interface LastMove {
  action: Action;
  player: PlayerId;
  from?: Coord;
}

function lastMoveKey(m: LastMove): string {
  return m.action.type === 'wall' ? `w${m.action.orientation}${m.action.row},${m.action.col}` : `m${m.from?.row},${m.from?.col}-${m.action.to.row},${m.action.to.col}`;
}

/**
 * Quiet marker of the previous move, unlike the analysis highlight (solid ink) and the legal
 * move dots: a soft solid outline in the mover's colour on the destination cell, a very faint
 * dashed trace on the origin cell, or a thin outline around a newly placed wall (its owner
 * colour stays as it is). Fades in once per move (`qz-last`; none with reduced motion).
 */
function LastMoveMark({ last, flipped }: { last: LastMove; flipped: boolean }) {
  const colour = PLAYER_COLOR[last.player];
  if (last.action.type === 'wall') {
    const r = wallRect(last.action.orientation, wallAnchorToView(last.action.row, last.action.col, flipped));
    return (
      <g className="qz-last" pointerEvents="none" data-last-move="wall">
        <rect x={r.x - 4} y={r.y - 4} width={r.width + 8} height={r.height + 8} rx={7} fill="none" stroke={colour} strokeOpacity={0.55} strokeWidth={2} />
      </g>
    );
  }
  const to = cellRect(cellToView(last.action.to, flipped));
  const from = last.from ? cellRect(cellToView(last.from, flipped)) : null;
  return (
    <g className="qz-last" pointerEvents="none" data-last-move="move">
      {from && <rect x={from.x + 3} y={from.y + 3} width={from.width - 6} height={from.height - 6} rx={7} fill={colour} fillOpacity={0.06} stroke={colour} strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="3 4" data-last-from="" />}
      <rect x={to.x + 1.5} y={to.y + 1.5} width={to.width - 3} height={to.height - 3} rx={8} fill={colour} fillOpacity={0.07} stroke={colour} strokeOpacity={0.6} strokeWidth={2.5} data-last-to="" />
    </g>
  );
}

interface PlacedWall {
  orientation: Orientation;
  row: number;
  col: number;
  key: string;
  /** Present in the real position (false = only in an analysis preview). */
  confirmed: boolean;
  /** Who placed it; null = not recorded (drawn neutral). */
  owner: PlayerId | null;
}

/**
 * One wall: owner colour (P2 with faint stripes), hollow neutral when the owner is unknown,
 * and see-through with a dashed outline when it exists only in a preview.
 */
function WallShape({ wall, rect, stripesId }: { wall: PlacedWall; rect: { x: number; y: number; width: number; height: number }; stripesId: string }) {
  const colour = wall.owner === null ? NEUTRAL_WALL.stroke : WALL_COLORS[wall.owner];
  if (!wall.confirmed) {
    return <rect {...rect} rx={4} fill={colour} fillOpacity={0.28} stroke={colour} strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" data-wall={wall.key} data-wall-kind="preview" />;
  }
  if (wall.owner === null) {
    return <rect x={rect.x + 0.75} y={rect.y + 0.75} width={rect.width - 1.5} height={rect.height - 1.5} rx={4} fill={NEUTRAL_WALL.fill} stroke={NEUTRAL_WALL.stroke} strokeWidth={1.5} pointerEvents="none" data-wall={wall.key} data-wall-kind="neutral" />;
  }
  return (
    <g pointerEvents="none" data-wall={wall.key} data-wall-kind={`p${wall.owner + 1}`}>
      <rect {...rect} rx={4} fill={colour} />
      {wall.owner === 1 && <rect {...rect} rx={4} fill={`url(#${stripesId})`} />}
    </g>
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
      <text key={`f${i}`} x={PAD + x} y={PAD + BOARD_PX + 20} textAnchor="middle" dominantBaseline="central" fill={BOARD_COLORS.label} className="font-mono text-[11px]">
        {FILES[engine.col]}
      </text>,
      <text key={`r${i}`} x={PAD / 2 - 3} y={PAD + y} textAnchor="middle" dominantBaseline="central" fill={BOARD_COLORS.label} className="font-mono text-[11px]">
        {BOARD_SIZE - engine.row}
      </text>,
    );
  }
  return <g pointerEvents="none">{labels}</g>;
}
