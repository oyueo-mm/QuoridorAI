import { useEffect, useRef, useState } from 'react';
import { BOARD_SIZE, WALL_GRID } from '../engine';
import { PAD, VIEW_PX, cellCenter, cellRect, wallRect } from '../components/board/geometry';
import { BOARD_COLORS, PLAYER_COLOR, WALL_COLORS } from '../components/theme';
import { homeReplay } from './homeReplay';

const STEP_MS = 850;
const HOLD_MS = 2400;
const FADE_MS = 450;
/** Frame shown for reduced motion: a mid-game position with several walls. */
const STATIC_PLY = 18;

const subscribeReducedMotion = (cb: (v: boolean) => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  cb(mq.matches);
  const on = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
};

/**
 * Silent, self-playing Quoridor game on the Home screen. It replays a precomputed legal game
 * (homeReplay) — no AI runs. The timer stops while the page is hidden or the board is off
 * screen (also when another view is open), and with reduced motion only a still frame is shown.
 */
export function HomeBoard() {
  const steps = useRef(homeReplay()).current;
  const root = useRef<SVGSVGElement>(null);
  const [ply, setPly] = useState(0);
  const [fading, setFading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  useEffect(() => subscribeReducedMotion(setReduced), []);
  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = !reduced && onScreen && pageVisible;
  useEffect(() => {
    if (!running) return;
    let t: ReturnType<typeof setTimeout>;
    if (fading) {
      t = setTimeout(() => (setPly(0), setFading(false)), FADE_MS);
    } else if (ply >= steps.length) {
      t = setTimeout(() => setFading(true), HOLD_MS);
    } else {
      t = setTimeout(() => setPly((p) => p + 1), ply === 0 ? 900 : STEP_MS);
    }
    return () => clearTimeout(t);
  }, [running, ply, fading, steps.length]);

  const shown = reduced ? Math.min(STATIC_PLY, steps.length) : ply;
  const state = shown === 0 ? null : steps[shown - 1].after;
  const initial = [
    { row: BOARD_SIZE - 1, col: 4 },
    { row: 0, col: 4 },
  ];
  const walls = steps.slice(0, shown).filter((s) => s.action.type === 'wall');

  return (
    <svg ref={root} viewBox={`0 0 ${VIEW_PX} ${VIEW_PX}`} className="mx-auto block w-full max-w-[460px]" role="img" aria-label="쿼리도 대국이 자동으로 진행되는 9×9 보드 애니메이션">
      <rect width={VIEW_PX} height={VIEW_PX} rx={34} fill={BOARD_COLORS.frame} />
      <g transform={`translate(${PAD} ${PAD})`} style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
        <rect x={-10} y={-10} width={VIEW_PX - 2 * PAD + 20} height={VIEW_PX - 2 * PAD + 20} rx={20} fill={BOARD_COLORS.groove} />
        {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
          const r = cellRect({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE });
          return <rect key={i} {...r} rx={9} fill={BOARD_COLORS.cell} />;
        })}
        {walls.map((s) => {
          if (s.action.type !== 'wall') return null;
          const { orientation, row, col } = s.action;
          if (row >= WALL_GRID || col >= WALL_GRID) return null;
          const r = wallRect(orientation, { row, col });
          return <rect key={`${orientation}${row}${col}`} className="qz-wall-in" {...r} rx={5} fill={WALL_COLORS[s.player]} />;
        })}
        {([0, 1] as const).map((p) => {
          const at = state ? state.pawns[p] : initial[p];
          const c = cellCenter(at);
          return (
            <g key={p} style={{ transform: `translate(${c.x}px, ${c.y}px)`, transition: fading || shown === 0 ? 'none' : `transform ${Math.round(STEP_MS * 0.6)}ms cubic-bezier(0.4, 0, 0.2, 1)` }}>
              <circle r={21} fill={PLAYER_COLOR[p]} stroke={BOARD_COLORS.cell} strokeWidth={3} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
