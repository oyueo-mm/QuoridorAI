import { useId, useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  BOARD_SIZE,
  WALL_GRID,
  formatAction,
  formatCoord,
  sameCoord,
  wallIndex,
} from '../../engine';
import type { Action, Coord, Orientation, PlayerId, WallAction } from '../../engine';
import { wallKey } from '../../match/wallOwners';
import type { WallOwners } from '../../match/wallOwners';
import { BOARD_COLORS, NEUTRAL_WALL, OBSTACLE_WALL, PLAYER_COLOR, PLAYER_LABEL, WALL_COLORS, WALL_RESULT_TEXT } from '../theme';
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
import { TWO_PLAYER_BOARD } from './boardRules';
import type { BoardPosition, BoardRules } from './boardRules';
import type { BoardOverlay } from './overlay';

interface QuoridorBoardProps {
  state: BoardPosition;
  /** Players, goals and move rules of the game type (default: the two-player game). */
  rules?: BoardRules;
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
const TEAM_LETTERS = 'ABCD';

/**
 * The board. Its box is a fixed square (aspect-ratio) and the hint line below has a fixed
 * height, so nothing on the page moves when the position, the hint or the overlay changes.
 */
export function QuoridorBoard(props: QuoridorBoardProps) {
  const { flipped, showPaths, overlay, onAction } = props;
  const rules = props.rules ?? TWO_PLAYER_BOARD;
  const state: BoardPosition = overlay?.state ?? props.state;
  const interactive = props.interactive && !overlay;
  const [hover, setHover] = useState<HitTarget | null>(null);
  const stripesId = `qz-stripes-${useId().replace(/:/g, '')}`;

  const legalMoves = useMemo(() => (interactive ? rules.legalMoves(state) : []), [state, interactive, rules]);
  const livePaths = useMemo(() => (showPaths && !overlay ? rules.paths(state) : []), [state, showPaths, overlay, rules]);

  // Walls of the drawn position. Only walls that exist in the real position (props.state) are
  // confirmed; walls that appear only in an analysis overlay are hypothetical and drawn as such.
  const placedWalls = useMemo(() => {
    const real = props.state;
    const previewOwner = new Map<string, number>();
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
          const neutral = confirmed && (rules.neutralWalls?.has(key) ?? false);
          const owner = neutral ? null : confirmed ? (props.wallOwners?.get(key) ?? null) : (previewOwner.get(key) ?? null);
          walls.push({ orientation, row, col, key, confirmed, owner, neutral });
        }
      }
    }
    return walls;
  }, [state, props.state, props.wallOwners, overlay, rules]);

  // Hovering a placed wall names its owner (also when the board is read-only).
  const wallInfo = useMemo(() => {
    if (!hover || hover.kind !== 'wall') return null;
    const anchor = wallAnchorFromView(hover.view.row, hover.view.col, flipped);
    const w = placedWalls.find((x) => x.orientation === hover.orientation && x.row === anchor.row && x.col === anchor.col);
    if (!w) return null;
    const name = formatAction({ type: 'wall', orientation: w.orientation, row: w.row, col: w.col });
    if (!w.confirmed) return `벽 ${name} — 분석 미리보기의 가상 벽 (실제로 놓이지 않음)`;
    if (w.neutral) return `벽 ${name} — 중립 벽 (처음부터 놓인 장애물, 누구의 벽도 아님)`;
    return `벽 ${name} — ${w.owner === null ? '설치한 플레이어 기록 없음' : `${PLAYER_LABEL[rules.slot(w.owner)]}가 설치`}`;
  }, [hover, flipped, placedWalls, rules]);

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
    const result = rules.checkWall(state, action);
    return {
      action: action as Action,
      ok: result === 'ok',
      hint: `벽 ${formatAction(action)} — ${WALL_RESULT_TEXT[result]}`,
    };
  }, [hover, interactive, flipped, legalMoves, state, rules]);

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
    if (rules.checkWall(state, action) === 'ok') onAction(action);
  };

  const mover = rules.slot(state.currentPlayer);
  const hoverCell = hover?.kind === 'cell' ? hover.view : null;
  const paths = overlay ? overlay.paths : livePaths;
  const winners = useMemo(() => (overlay ? [] : (rules.winners?.(state) ?? (state.winner === null ? [] : [state.winner]))), [state, rules, overlay]);

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
            {/* Textures for P3 (dots) and P4 (vertical stripes) walls. */}
            <pattern id={`${stripesId}-dots`} patternUnits="userSpaceOnUse" width={6} height={6}>
              <circle cx={3} cy={3} r={1.3} fill="#fbf9f5" fillOpacity={0.5} />
            </pattern>
            <pattern id={`${stripesId}-bars`} patternUnits="userSpaceOnUse" width={5} height={5}>
              <rect width={1.6} height={5} fill="#fbf9f5" fillOpacity={0.4} />
            </pattern>
            {/* Neutral obstacle walls: dark stone with a cross-hatch, unlike every player's wall. */}
            <pattern id={`${stripesId}-stone`} patternUnits="userSpaceOnUse" width={7} height={7}>
              <path d="M0 0L7 7M7 0L0 7" stroke="#d9d2c6" strokeOpacity={0.35} strokeWidth={1} />
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
          {/* Goal markers: a bar in each player's colour along the edge that player must reach. Seats sharing
              one goal line split that bar into one segment each, so their colours never overlap. */}
          {rules.goals.map((goal, seat) => {
            const sharing = rules.goals.flatMap((g, i) => (g.axis === goal.axis && g.index === goal.index ? [i] : []));
            const k = sharing.length;
            const part = sharing.indexOf(seat);
            const full = BOARD_PX - 16;
            const len = full / k;
            const viewIndex = flipped ? BOARD_SIZE - 1 - goal.index : goal.index;
            const edgeFirst = viewIndex === 0;
            const colour = PLAYER_COLOR[rules.slot(seat)];
            const shown = k > 1 ? len - 5 : len;
            return goal.axis === 'row' ? (
              <rect key={seat} x={PAD + 8 + part * len} y={edgeFirst ? PAD - 12 : PAD + BOARD_PX + 8} width={shown} height={4} rx={2} fill={colour} fillOpacity={0.55} pointerEvents="none" data-goal={seat} />
            ) : (
              <rect key={seat} x={edgeFirst ? PAD - 12 : PAD + BOARD_PX + 8} y={PAD + 8 + part * len} width={4} height={shown} rx={2} fill={colour} fillOpacity={0.55} pointerEvents="none" data-goal={seat} />
            );
          })}
          <CoordinateLabels flipped={flipped} />
          <g transform={`translate(${PAD} ${PAD})`}>
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => (
              <rect key={i} {...cellRect({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE })} rx={8} fill={BOARD_COLORS.cell} />
            ))}

            {/* Where each pawn started (faint dashed ring, in the player's colour). */}
            {rules.starts?.map((c, seat) => {
              const { x, y } = cellCenter(cellToView(c, flipped));
              return <circle key={seat} cx={x} cy={y} r={CELL * 0.4} fill="none" stroke={PLAYER_COLOR[rules.slot(seat)]} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="3 4" pointerEvents="none" data-start={seat} />;
            })}

            {/* Shortest paths: live BFS (dashed) or the AI's evaluated paths (solid). */}
            {paths.map(({ player, path }) => {
              const slot = rules.slot(player);
              const [dx, dy] = PATH_OFFSET[slot];
              return path.length > 1 ? (
                <polyline
                  key={player}
                  data-path={player}
                  points={path
                    .map((c) => cellCenter(cellToView(c, flipped)))
                    .map(({ x, y }) => `${x + dx},${y + dy}`)
                    .join(' ')}
                  fill="none"
                  stroke={PLAYER_COLOR[slot]}
                  strokeOpacity={overlay ? 0.85 : 0.4}
                  strokeWidth={overlay ? 3.5 : 2.5}
                  strokeDasharray={overlay ? undefined : PATH_DASH[slot]}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null;
            })}

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
              <WallShape key={w.key} wall={w} slot={w.owner === null ? null : rules.slot(w.owner)} rect={wallRect(w.orientation, wallAnchorToView(w.row, w.col, flipped))} stripesId={stripesId} />
            ))}

            {/* Highlighted action (last move, or the previewed candidate). */}
            {overlay?.marks?.map((m, i) => (
              <ActionHighlight key={i} {...m} flipped={flipped} variant="mark" />
            ))}
            {overlay
              ? overlay.highlight && <ActionHighlight {...overlay.highlight} flipped={flipped} variant="strong" />
              : props.lastAction && <LastMoveMark key={lastMoveKey(props.lastAction)} last={props.lastAction} slot={rules.slot(props.lastAction.player)} flipped={flipped} />}

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
            {state.pawns.map((pawn, seat) => {
              const slot = rules.slot(seat);
              const { x, y } = cellCenter(cellToView(pawn, flipped));
              const active = state.winner === null && seat === state.currentPlayer;
              const won = winners.includes(seat);
              const team = rules.teams?.[seat];
              return (
                <g key={seat} pointerEvents="none" data-pawn={seat} data-winner={won || undefined}>
                  {won && <circle cx={x} cy={y} r={CELL * 0.46} fill="none" stroke={BOARD_COLORS.win} strokeWidth={4} data-win-ring={seat} />}
                  {active && <circle cx={x} cy={y} r={CELL * 0.43} fill="none" stroke={PLAYER_COLOR[slot]} strokeOpacity={0.35} strokeWidth={2.5} />}
                  <circle cx={x} cy={y + 1.5} r={CELL * 0.31} fill={BOARD_COLORS.ink} fillOpacity={0.12} />
                  <circle cx={x} cy={y} r={CELL * 0.31} fill={PLAYER_COLOR[slot]} stroke={BOARD_COLORS.cell} strokeWidth={2.5} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fbf9f5" className="text-[14px] font-semibold">
                    {PLAYER_LABEL[slot]}
                  </text>
                  {team !== undefined && (
                    <g data-team-badge={TEAM_LETTERS[team]}>
                      <circle cx={x + CELL * 0.27} cy={y - CELL * 0.27} r={8.5} fill={BOARD_COLORS.cell} stroke={BOARD_COLORS.ink} strokeWidth={1.5} />
                      <text x={x + CELL * 0.27} y={y - CELL * 0.27} textAnchor="middle" dominantBaseline="central" fill={BOARD_COLORS.ink} className="text-[11px] font-bold">
                        {TEAM_LETTERS[team]}
                      </text>
                    </g>
                  )}
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
  player: number;
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
function LastMoveMark({ last, slot, flipped }: { last: LastMove; slot: number; flipped: boolean }) {
  const colour = PLAYER_COLOR[slot];
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
  owner: number | null;
  /** On the board before the first move and owned by nobody (an obstacle of the rules). */
  neutral: boolean;
}

/**
 * One wall: owner colour (P2 with faint stripes), hollow neutral when the owner is unknown,
 * and see-through with a dashed outline when it exists only in a preview.
 */
function WallShape({ wall, slot, rect, stripesId }: { wall: PlacedWall; slot: number | null; rect: { x: number; y: number; width: number; height: number }; stripesId: string }) {
  const colour = slot === null ? NEUTRAL_WALL.stroke : WALL_COLORS[slot];
  if (wall.neutral) {
    return (
      <g pointerEvents="none" data-wall={wall.key} data-wall-kind="obstacle">
        <rect {...rect} rx={3} fill={OBSTACLE_WALL.fill} stroke={OBSTACLE_WALL.stroke} strokeWidth={1.5} />
        <rect {...rect} rx={3} fill={`url(#${stripesId}-stone)`} />
      </g>
    );
  }
  if (!wall.confirmed) {
    return <rect {...rect} rx={4} fill={colour} fillOpacity={0.28} stroke={colour} strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" data-wall={wall.key} data-wall-kind="preview" />;
  }
  if (slot === null) {
    return <rect x={rect.x + 0.75} y={rect.y + 0.75} width={rect.width - 1.5} height={rect.height - 1.5} rx={4} fill={NEUTRAL_WALL.fill} stroke={NEUTRAL_WALL.stroke} strokeWidth={1.5} pointerEvents="none" data-wall={wall.key} data-wall-kind="neutral" />;
  }
  // Texture per slot (colour is never the only cue): P1 solid, P2 diagonal stripes, P3 dots, P4 vertical stripes.
  const texture = slot === 1 ? stripesId : slot === 2 ? `${stripesId}-dots` : slot === 3 ? `${stripesId}-bars` : null;
  return (
    <g pointerEvents="none" data-wall={wall.key} data-wall-kind={`p${slot + 1}`}>
      <rect {...rect} rx={4} fill={colour} />
      {texture && <rect {...rect} rx={4} fill={`url(#${texture})`} />}
    </g>
  );
}

/** Offset and dash of each slot's path line, so overlapping routes stay readable. */
const PATH_OFFSET: readonly (readonly [number, number])[] = [[-5, -5], [5, 5], [-5, 5], [5, -5]];
const PATH_DASH: readonly string[] = ['5 7', '5 7', '2 6', '9 5'];

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
