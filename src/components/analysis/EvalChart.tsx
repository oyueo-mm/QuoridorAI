import { useEffect, useRef, useState } from 'react';

export interface EvalPoint {
  ply: number;
  /** null = not evaluated (drawn as a gap, never as 0). */
  value: number | null;
  /** Forced result proven by a search: drawn as a marker at the edge. */
  forced?: 1 | -1;
  /** Notation of the move that led to this position (ply > 0). */
  move?: string;
}

interface EvalChartProps {
  points: readonly EvalPoint[];
  currentPly: number;
  onSelect: (ply: number) => void;
  colour: string;
  /** Formats a value for the tooltip / axis, including its unit. */
  format: (v: number) => string;
  /** Text for "above the zero line", e.g. "P1 유리". */
  upLabel: string;
  downLabel: string;
  /** Fixed y-range (e.g. MCTS Q = 1); otherwise symmetric around 0 from the data. */
  fixedMax?: number;
  emptyText: string;
}

const H = 200;
const M = { top: 14, right: 14, bottom: 26, left: 44 };

/**
 * Evaluation along the move list: x = ply, y = value (0 line in the middle). One series at a
 * time — different algorithms have different scales and are never drawn on one axis. Gaps for
 * positions without a value, a ring on the current ply, hover crosshair + tooltip, click to
 * jump. Width follows the container; height is fixed so the page never moves.
 */
export function EvalChart({ points, currentPly, onSelect, colour, format, upLabel, downLabel, fixedMax, emptyText }: EvalChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.filter((p) => p.value !== null && p.forced === undefined).map((p) => Math.abs(p.value!));
  const max = fixedMax ?? Math.max(1, ...values) * 1.15;
  const maxPly = Math.max(1, points.length - 1);
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (ply: number) => M.left + (iw * ply) / maxPly;
  const y = (v: number) => M.top + ih / 2 - (ih / 2) * (Math.max(-max, Math.min(max, v)) / max);
  const yOf = (p: EvalPoint) => (p.forced ? (p.forced > 0 ? M.top : M.top + ih) : y(p.value!));

  // Line segments over consecutive evaluated plies (a missing value breaks the line).
  const segments: string[] = [];
  let run: string[] = [];
  for (const p of points) {
    if (p.value === null) {
      if (run.length > 1) segments.push(run.join(' '));
      run = [];
      continue;
    }
    run.push(`${x(p.ply)},${yOf(p)}`);
  }
  if (run.length > 1) segments.push(run.join(' '));

  const evaluated = points.filter((p) => p.value !== null);
  const tickStep = Math.max(1, Math.ceil(maxPly / 8));
  const hovered = hover === null ? null : points[hover];

  const pick = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const ply = Math.round(((clientX - rect.left - M.left) / iw) * maxPly);
    return Math.max(0, Math.min(points.length - 1, ply));
  };

  return (
    <div ref={box} className="relative h-[200px] w-full select-none">
      <svg width={width} height={H} className="block" onPointerMove={(e) => setHover(pick(e.clientX))} onPointerLeave={() => setHover(null)} onClick={(e) => onSelect(pick(e.clientX))} role="img" aria-label="포지션 평가 추이">
        {/* Grid: zero line and ±max. */}
        {[-1, -0.5, 0.5, 1].map((f) => (
          <line key={f} x1={M.left} x2={M.left + iw} y1={y(f * max)} y2={y(f * max)} stroke="#ebe4d9" strokeWidth={1} />
        ))}
        <line x1={M.left} x2={M.left + iw} y1={y(0)} y2={y(0)} stroke="#c4b9a8" strokeWidth={1} />
        <text x={M.left - 6} y={y(max)} textAnchor="end" dominantBaseline="central" className="fill-faint text-[10px]">{format(max)}</text>
        <text x={M.left - 6} y={y(0)} textAnchor="end" dominantBaseline="central" className="fill-faint text-[10px]">0</text>
        <text x={M.left - 6} y={y(-max)} textAnchor="end" dominantBaseline="central" className="fill-faint text-[10px]">{format(-max)}</text>
        <text x={M.left + 4} y={M.top + 2} dominantBaseline="hanging" className="fill-muted text-[10px]">▲ {upLabel}</text>
        <text x={M.left + 4} y={M.top + ih - 2} className="fill-muted text-[10px]">▼ {downLabel}</text>
        {Array.from({ length: Math.floor(maxPly / tickStep) + 1 }, (_, i) => i * tickStep).map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="fill-faint font-mono text-[10px]">{t}</text>
        ))}

        {/* Current ply. */}
        <line x1={x(currentPly)} x2={x(currentPly)} y1={M.top} y2={M.top + ih} stroke="#4e6876" strokeOpacity={0.35} strokeWidth={1.5} />

        {segments.map((d, i) => (
          <polyline key={i} points={d} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {evaluated.map((p) =>
          p.forced ? (
            <path key={p.ply} d={p.forced > 0 ? `M${x(p.ply)},${M.top - 2} l-5,8 h10 z` : `M${x(p.ply)},${M.top + ih + 2} l-5,-8 h10 z`} fill={colour} />
          ) : (
            <circle key={p.ply} cx={x(p.ply)} cy={yOf(p)} r={p.ply === currentPly ? 5 : 3.5} fill={p.ply === currentPly ? '#fbf9f5' : colour} stroke={colour} strokeWidth={p.ply === currentPly ? 2.5 : 1.5} />
          ),
        )}
        {evaluated.length === 0 && (
          <text x={M.left + iw / 2} y={M.top + ih / 2 - 12} textAnchor="middle" className="fill-faint text-[11px]">{emptyText}</text>
        )}
        {hovered && <line x1={x(hovered.ply)} x2={x(hovered.ply)} y1={M.top} y2={M.top + ih} stroke="#958b7f" strokeDasharray="3 3" />}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line-soft bg-card px-2.5 py-1.5 text-[11px] text-ink shadow-[var(--shadow-soft)]" style={{ left: Math.min(width - 170, Math.max(0, x(hovered.ply) + 8)) }}>
          <div className="font-mono">
            {hovered.ply}수 후{hovered.move ? ` · ${hovered.move}` : ' · 시작'}
          </div>
          <div className="text-muted">{hovered.value === null ? '평가 없음' : hovered.forced ? `강제 승패 확인 (${hovered.forced > 0 ? upLabel : downLabel})` : format(hovered.value)}</div>
        </div>
      )}
    </div>
  );
}
