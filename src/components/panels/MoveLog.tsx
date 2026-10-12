import { useEffect, useRef } from 'react';
import { formatAction } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../theme';
import { Panel } from './Panel';

export function MoveLog({ history }: { history: readonly HistoryEntry[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history.length]);

  return (
    <Panel title="기보" aside={<span className="font-mono text-xs text-slate-500">{history.length} ply</span>}>
      {history.length === 0 ? (
        <p className="text-xs text-slate-500">아직 둔 수가 없습니다.</p>
      ) : (
        <ol ref={listRef} className="max-h-56 space-y-0.5 overflow-y-auto pr-1 font-mono text-xs">
          {history.map((entry, i) => (
            <li key={i} className="flex gap-3 rounded px-2 py-0.5 odd:bg-slate-800/40">
              <span className="w-6 text-right text-slate-500">{i + 1}</span>
              <span className={`w-6 ${PLAYER_TEXT_CLASS[entry.player]}`}>{PLAYER_LABEL[entry.player]}</span>
              <span className="text-slate-200">{formatAction(entry.action)}</span>
              <span className="text-slate-500">{entry.action.type === 'move' ? '이동' : '벽'}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
