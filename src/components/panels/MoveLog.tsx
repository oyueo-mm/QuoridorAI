import { useEffect, useRef } from 'react';
import { formatAction } from '../../engine';
import type { Action, PlayerId } from '../../engine';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../theme';

interface MoveLogProps {
  moves: readonly { player: PlayerId; action: Action; trace?: { elapsedMs: number } }[];
  /** Selected position = number of moves played (null = latest). Rows select "after this move". */
  selectedPly?: number | null;
  onSelect?: (ply: number | null) => void;
  /** Moves from this index on are drawn as a variation (e.g. analysis moves beyond the source). */
  variationFrom?: number;
}

/**
 * Move list that fills its parent (give the parent a fixed height) and scrolls internally.
 * Auto-scroll sets this element's own scrollTop — never scrollIntoView — so the page and the
 * board do not move when a move is added.
 */
export function MoveLog({ moves, selectedPly = null, onSelect, variationFrom }: MoveLogProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el && selectedPly === null) el.scrollTop = el.scrollHeight;
  }, [moves.length, selectedPly]);

  if (moves.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-faint">아직 둔 수가 없습니다.</p>;
  }
  const current = selectedPly ?? moves.length;
  return (
    <ol ref={listRef} className="scroll-stable h-full space-y-1 pr-1 font-mono text-[15px]">
      {moves.map((entry, i) => {
        const selected = i + 1 === current;
        const variation = variationFrom !== undefined && i >= variationFrom;
        const row = (
          <>
            <span className="w-9 shrink-0 text-right text-sm text-faint tabular-nums">{i + 1}</span>
            <span className={`w-8 shrink-0 font-semibold ${PLAYER_TEXT_CLASS[entry.player]}`}>{PLAYER_LABEL[entry.player]}</span>
            <span className={`w-14 shrink-0 font-medium ${variation ? 'text-think' : 'text-ink'}`}>{formatAction(entry.action)}</span>
            <span className="font-sans text-sm text-muted">{entry.action.type === 'move' ? '이동' : '벽'}</span>
            {variation && <span className="font-sans text-xs text-think">변형</span>}
            {entry.trace && <span className="ml-auto text-xs text-muted tabular-nums">{entry.trace.elapsedMs.toFixed(0)} ms</span>}
          </>
        );
        return (
          <li key={i}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i + 1 === moves.length ? null : i + 1)}
                aria-current={selected ? 'step' : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-inset ${selected ? 'bg-accent/10 font-medium ring-2 ring-accent/40' : i > current - 1 ? 'opacity-50' : 'odd:bg-inset/60'}`}
              >
                {row}
              </button>
            ) : (
              <div className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 odd:bg-inset/60">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
