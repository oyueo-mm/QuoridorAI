import { modeInfo } from '../../session/config';
import type { GameMode } from '../../session/config';
import { buttonClass } from '../ui';

/** Top of the play side panel: the mode being played and the way into the mode browser. */
export function ModeBar({ mode, onChange }: { mode: GameMode; onChange: () => void }) {
  const info = modeInfo(mode);
  return (
    <div className="flex items-center gap-2" data-mode-bar>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-faint">현재 모드</p>
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink" data-current-mode={mode}>
          <span className="truncate">{info.title}</span>
          <span className="shrink-0 rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-normal text-muted">{info.players}</span>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-normal ${info.official ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`}>{info.official ? '공식' : '변형'}</span>
        </p>
      </div>
      <button type="button" onClick={onChange} className={`${buttonClass.small} shrink-0`} data-open-mode-browser>
        모드 변경
      </button>
    </div>
  );
}
