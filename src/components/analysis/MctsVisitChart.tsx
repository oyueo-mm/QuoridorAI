import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { MctsSnapshot } from '../../ai/types';

/** Light-surface categorical slots 1–4 (validated on #ffffff: adjacent pairs pass CVD / normal-vision
 * checks; blue and purple are close for protan vision, so slot 3 is also dashed). */
export const SERIES_COLORS = ['#2b6aa3', '#d0612b', '#8f6bb5', '#3a8f5a'];
export const SERIES_DASH: (string | undefined)[] = [undefined, undefined, '5 3', undefined];

interface Props {
  snapshots: MctsSnapshot[];
  /** Root moves to plot (≤ 4), in legend order. */
  series: string[];
  /** Snapshot index highlighted by the replay control. */
  marker: number;
  onSelect: (index: number) => void;
}

const W = 360;
const H = 150;
const M = { top: 10, right: 44, bottom: 22, left: 30 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

/**
 * Visit share of the leading root moves as the search progressed (from the recorded
 * snapshots). A move missing from a snapshot's top list is drawn as a gap, not as zero.
 */
export function MctsVisitChart({ snapshots, series, marker, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const maxSims = Math.max(1, snapshots.at(-1)?.simulations ?? 1);
  const x = (sims: number) => M.left + (sims / maxSims) * IW;
  const y = (share: number) => M.top + (1 - share) * IH;
  const shareAt = (snap: MctsSnapshot, notation: string) => {
    const t = snap.top.find((e) => e.notation === notation);
    return t && snap.simulations > 0 ? t.visits / snap.simulations : null;
  };

  const lines = series.map((name) => {
    const segments: string[] = [];
    let current = '';
    for (const s of snapshots) {
      const v = shareAt(s, name);
      if (v === null) {
        if (current) segments.push(current);
        current = '';
      } else current += `${current ? 'L' : 'M'}${x(s.simulations).toFixed(1)},${y(v).toFixed(1)}`;
    }
    if (current) segments.push(current);
    return segments;
  });

  // End-of-line labels, pushed apart vertically so they never overlap.
  const LABEL_GAP = 11;
  const endLabels = series
    .flatMap((name, i) => {
      const last = [...snapshots].reverse().find((s) => shareAt(s, name) !== null);
      return last ? [{ name, i, x: x(last.simulations), y: y(shareAt(last, name)!), labelY: 0 }] : [];
    })
    .sort((a, b) => a.y - b.y);
  endLabels.forEach((l, k) => {
    l.labelY = k === 0 ? l.y : Math.max(l.y, endLabels[k - 1].labelY + LABEL_GAP);
  });
  const overflow = (endLabels.at(-1)?.labelY ?? 0) - (M.top + IH);
  if (overflow > 0) endLabels.forEach((l) => (l.labelY -= overflow));

  const focus = hover ?? marker;
  const focusSnap = snapshots[focus];

  const indexFromEvent = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const sims = ((px - M.left) / IW) * maxSims;
    let best = 0;
    snapshots.forEach((s, i) => {
      if (Math.abs(s.simulations - sims) < Math.abs(snapshots[best].simulations - sims)) best = i;
    });
    return best;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        {series.map((name, i) => (
          <span key={name} className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[i] }} />
            <span className="font-mono">{name}</span>
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair touch-none"
          role="img"
          aria-label="후보별 방문 비율 변화"
          onPointerMove={(e) => setHover(indexFromEvent(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onSelect(indexFromEvent(e))}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={M.left} x2={M.left + IW} y1={y(g)} y2={y(g)} stroke="#ececea" strokeWidth={1} />
              <text x={M.left - 4} y={y(g)} textAnchor="end" dominantBaseline="central" className="fill-faint font-mono text-[9px]">
                {g * 100}%
              </text>
            </g>
          ))}
          <text x={M.left} y={H - 6} className="fill-faint font-mono text-[9px]">0</text>
          <text x={M.left + IW} y={H - 6} textAnchor="end" className="fill-faint font-mono text-[9px]">
            {maxSims.toLocaleString()} 시뮬레이션
          </text>

          {focusSnap && (
            <line x1={x(focusSnap.simulations)} x2={x(focusSnap.simulations)} y1={M.top} y2={M.top + IH} stroke="#7d7972" strokeDasharray="3 3" />
          )}
          {lines.map((segs, i) =>
            segs.map((d, j) => (
              <path key={`${i}-${j}`} d={d} fill="none" stroke={SERIES_COLORS[i]} strokeDasharray={SERIES_DASH[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )),
          )}
          {/* Direct labels at the last point of each line (text in neutral ink, nudged apart). */}
          {endLabels.map((l) => (
            <g key={l.name}>
              <circle cx={l.x} cy={l.y} r={3} fill={SERIES_COLORS[l.i]} stroke="#ffffff" strokeWidth={2} />
              {Math.abs(l.labelY - l.y) > 1 && <line x1={l.x + 3} y1={l.y} x2={l.x + 6} y2={l.labelY} stroke="#bfbcb6" strokeWidth={1} />}
              <text x={l.x + 7} y={l.labelY} dominantBaseline="central" className="fill-ink-soft font-mono text-[9.5px]">
                {l.name}
              </text>
            </g>
          ))}
          {focusSnap &&
            series.map((name, i) => {
              const v = shareAt(focusSnap, name);
              return v === null ? null : (
                <circle key={name} cx={x(focusSnap.simulations)} cy={y(v)} r={4} fill={SERIES_COLORS[i]} stroke="#ffffff" strokeWidth={2} />
              );
            })}
        </svg>
        {hover !== null && focusSnap && (
          <div className="pointer-events-none absolute top-1 left-10 rounded-md border border-line bg-paper/95 px-2 py-1 font-mono text-[10.5px] text-ink shadow">
            <div className="text-muted">{focusSnap.simulations.toLocaleString()}회 시점</div>
            {series.map((name, i) => {
              const v = shareAt(focusSnap, name);
              return (
                <div key={name} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                  {name} {v === null ? '— (상위권 밖)' : `${(v * 100).toFixed(1)}%`}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
