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
    <ol ref={listRef} className="scroll-stable h-full space-y-0.5 pr-1 font-mono text-[13px]">
      {moves.map((entry, i) => {
        const selected = i + 1 === current;
        const variation = variationFrom !== undefined && i >= variationFrom;
        const row = (
          <>
            <span className="w-7 text-right text-faint">{i + 1}</span>
            <span className={`w-7 ${PLAYER_TEXT_CLASS[entry.player]}`}>{PLAYER_LABEL[entry.player]}</span>
            <span className={`w-12 ${variation ? 'text-think' : 'text-ink'}`}>{formatAction(entry.action)}</span>
            <span className="text-faint">{entry.action.type === 'move' ? '이동' : '벽'}</span>
            {variation && <span className="text-[11px] text-think">변형</span>}
            {entry.trace && <span className="ml-auto text-[11px] text-faint">{entry.trace.elapsedMs.toFixed(0)} ms</span>}
          </>
        );
        return (
          <li key={i}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i + 1 === moves.length ? null : i + 1)}
                aria-current={selected ? 'step' : undefined}
                className={`flex w-full gap-3 rounded-lg px-2.5 py-1 text-left hover:bg-inset ${selected ? 'bg-accent/10 ring-1 ring-accent/30' : i > current - 1 ? 'opacity-50' : 'odd:bg-inset/60'}`}
              >
                {row}
              </button>
            ) : (
              <div className="flex gap-3 rounded-lg px-2.5 py-1 odd:bg-inset/60">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
