import { useState } from 'react';
import { formatSearchScore } from '../../ai/minimaxAgent';
import type { MinimaxTrace, ScoreBound, SearchTreeNode } from '../../ai/types';
import type { Action, GameState } from '../../engine';
import { PLAYER_COLOR, PLAYER_LABEL } from '../theme';
import { lineOverlay } from './lineOverlay';
import type { PreviewBinder } from './preview';

interface Props {
  trace: MinimaxTrace;
  stateBefore: GameState;
  bind: PreviewBinder;
}

const W = 360;
const COL_X = [0, 76, 222];
const COL_W = [64, 132, 138];
const ROW_H = 24;
const NODE_H = 20;
const TOP = 22;

const boundPrefix = (b: ScoreBound) => (b === 'upper' ? '≤ ' : b === 'lower' ? '≥ ' : '');
const sameAction = (a?: Action, b?: Action) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

interface Row {
  kind: 'node' | 'omitted' | 'cutoff';
  node?: SearchTreeNode;
  text?: string;
}

function rowsFor(node: SearchTreeNode | undefined): Row[] {
  if (!node) return [];
  const rows: Row[] = (node.children ?? []).map((n) => ({ kind: 'node', node: n }));
  if (node.omitted) {
    rows.push({
      kind: 'omitted',
      text: `+${node.omitted.count}개 더 (${formatSearchScore(node.omitted.minScore)} ~ ${formatSearchScore(node.omitted.maxScore)})`,
    });
  }
  const skipped = node.totalChildren - node.searchedChildren;
  if (node.cutoff && skipped > 0) rows.push({ kind: 'cutoff', text: `✂ ${skipped}개 미탐색 (가지치기)` });
  return rows;
}

/**
 * Focused view of the recorded search tree: the root, the AI's candidate moves (ply 1) and
 * the opponent replies examined under the selected candidate (ply 2). The principal
 * variation is highlighted; everything else is summarised instead of drawn.
 */
export function SearchTreeView({ trace, stateBefore, bind }: Props) {
  const root = trace.tree;
  const col1 = rowsFor(root);
  const pvIndex = Math.max(0, root.children?.findIndex((c) => sameAction(c.action, trace.pv[0])) ?? 0);
  const [selected, setSelected] = useState(pvIndex);
  const sel = root.children?.[selected];
  const col2 = rowsFor(sel);
  const height = TOP + Math.max(col1.length, col2.length, 1) * ROW_H + 4;
  const ai = trace.player;
  const rowY = (i: number) => TOP + i * ROW_H;

  const preview = (path: SearchTreeNode[]) => {
    const actions = path.map((n) => n.action!);
    return bind(`tree-${path.map((n) => n.notation).join('-')}`, () =>
      lineOverlay(stateBefore, actions, `탐색 트리: ${actions.length === 1 ? '후보' : '후보 → 응수'} ${path.map((n) => n.notation).join(' → ')}`),
    );
  };

  const renderNode = (n: SearchTreeNode, x: number, y: number, w: number, opts: { pv: boolean; selected: boolean }) => (
    <>
      <rect
        x={x}
        y={y}
        width={w}
        height={NODE_H}
        rx={4}
        className={opts.selected ? 'fill-slate-700' : 'fill-slate-800'}
        stroke={opts.pv ? '#fbbf24' : '#475569'}
        strokeWidth={opts.pv ? 1.5 : 1}
        strokeDasharray={n.bound === 'exact' ? undefined : '3 2'}
      />
      <circle cx={x + 8} cy={y + NODE_H / 2} r={3} fill={PLAYER_COLOR[n.mover]} />
      <text x={x + 15} y={y + NODE_H / 2} dominantBaseline="central" className="fill-slate-100 font-mono text-[10px]">
        {n.notation}
        {n.terminal ? ' ■' : ''}
      </text>
      <text x={x + w - 5} y={y + NODE_H / 2} dominantBaseline="central" textAnchor="end" className="fill-slate-300 font-mono text-[10px]">
        {boundPrefix(n.bound)}
        {formatSearchScore(n.score)}
      </text>
    </>
  );

  const edge = (x1: number, y1: number, x2: number, y2: number, pv: boolean, key: string) => {
    const mx = (x1 + x2) / 2;
    return (
      <path
        key={key}
        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
        fill="none"
        stroke={pv ? '#fbbf24' : '#334155'}
        strokeWidth={pv ? 1.8 : 1}
      />
    );
  };

  const rootY = rowY(0);
  const selY = rowY(selected);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="탐색 트리">
        <text x={COL_X[0]} y={10} className="fill-slate-500 text-[9px]">루트</text>
        <text x={COL_X[1]} y={10} className="fill-slate-500 text-[9px]">
          {PLAYER_LABEL[ai]} 후보 (ply 1) · 클릭해 펼치기
        </text>
        <text x={COL_X[2]} y={10} className="fill-slate-500 text-[9px]">
          {sel ? `${sel.notation}에 대한 상대 응수 (ply 2)` : ''}
        </text>

        {/* Edges */}
        {col1.map((r, i) =>
          r.kind === 'node'
            ? edge(COL_X[0] + COL_W[0], rootY + NODE_H / 2, COL_X[1], rowY(i) + NODE_H / 2, sameAction(r.node!.action, trace.pv[0]), `e1-${i}`)
            : null,
        )}
        {sel &&
          col2.map((r, i) =>
            r.kind === 'node'
              ? edge(
                  COL_X[1] + COL_W[1],
                  selY + NODE_H / 2,
                  COL_X[2],
                  rowY(i) + NODE_H / 2,
                  sameAction(sel.action, trace.pv[0]) && sameAction(r.node!.action, trace.pv[1]),
                  `e2-${i}`,
                )
              : null,
          )}

        {/* Root */}
        <g>
          <rect x={COL_X[0]} y={rootY} width={COL_W[0]} height={NODE_H} rx={4} className="fill-slate-700" stroke="#fbbf24" strokeWidth={1.5} />
          <text x={COL_X[0] + COL_W[0] / 2} y={rootY + NODE_H / 2} textAnchor="middle" dominantBaseline="central" className="fill-white font-mono text-[10px]">
            {formatSearchScore(root.score)}
          </text>
        </g>

        {/* Column 1: AI candidates */}
        {col1.map((r, i) =>
          r.kind === 'node' ? (
            <g
              key={`c1-${i}`}
              {...preview([r.node!])}
              onClick={() => setSelected(i)}
              className="cursor-pointer outline-none"
            >
              {renderNode(r.node!, COL_X[1], rowY(i), COL_W[1], {
                pv: sameAction(r.node!.action, trace.pv[0]),
                selected: i === selected,
              })}
            </g>
          ) : (
            <text key={`c1-${i}`} x={COL_X[1] + 4} y={rowY(i) + NODE_H / 2} dominantBaseline="central" className="fill-slate-500 text-[9.5px]">
              {r.text}
            </text>
          ),
        )}

        {/* Column 2: opponent replies under the selected candidate */}
        {sel &&
          col2.map((r, i) =>
            r.kind === 'node' ? (
              <g key={`c2-${i}`} {...preview([sel, r.node!])} className="cursor-pointer outline-none">
                {renderNode(r.node!, COL_X[2], rowY(i), COL_W[2], {
                  pv: sameAction(sel.action, trace.pv[0]) && sameAction(r.node!.action, trace.pv[1]),
                  selected: false,
                })}
              </g>
            ) : (
              <text
                key={`c2-${i}`}
                x={COL_X[2] + 4}
                y={rowY(i) + NODE_H / 2}
                dominantBaseline="central"
                className={`text-[9.5px] ${r.kind === 'cutoff' ? 'fill-violet-300' : 'fill-slate-500'}`}
              >
                {r.text}
              </text>
            ),
          )}
        {sel && col2.length === 0 && (
          <text x={COL_X[2] + 4} y={rowY(0) + NODE_H / 2} dominantBaseline="central" className="fill-slate-500 text-[9.5px]">
            {sel.terminal ? '종료 포지션 (승패 확정)' : '하위 노드 기록 없음 (깊이 1)'}
          </text>
        )}
      </svg>
      {sel && (
        <p className="mt-1 font-mono text-[10.5px] text-slate-500">
          {sel.notation}: 하위 {sel.nodes.toLocaleString()} 노드 · 자식 {sel.searchedChildren}/{sel.totalChildren} 탐색
          {sel.cutoff ? ' · β 컷 발생' : ''}
        </p>
      )}
    </div>
  );
}
