import { useEffect, useRef } from 'react';
import { formatAction } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../theme';

/**
 * Move list that fills its parent (give the parent a fixed height) and scrolls internally.
 * Auto-scroll sets this element's own scrollTop — never scrollIntoView — so the page and the
 * board do not move when a move is added.
 */
export function MoveLog({ history }: { history: readonly HistoryEntry[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  if (history.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-faint">아직 둔 수가 없습니다.</p>;
  }
  return (
    <ol ref={listRef} className="scroll-stable h-full space-y-0.5 pr-1 font-mono text-[13px]">
      {history.map((entry, i) => (
        <li key={i} className="flex gap-3 rounded-lg px-2.5 py-1 odd:bg-inset/60">
          <span className="w-7 text-right text-faint">{i + 1}</span>
          <span className={`w-7 ${PLAYER_TEXT_CLASS[entry.player]}`}>{PLAYER_LABEL[entry.player]}</span>
          <span className="w-12 text-ink">{formatAction(entry.action)}</span>
          <span className="text-faint">{entry.action.type === 'move' ? '이동' : '벽'}</span>
          {entry.trace && <span className="ml-auto text-[11px] text-faint">{entry.trace.elapsedMs.toFixed(0)} ms</span>}
        </li>
      ))}
    </ol>
  );
}
