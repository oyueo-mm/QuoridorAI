import { useCallback, useEffect, useState } from 'react';
import type { BoardOverlay } from '../board/overlay';
import type { PreviewBinder } from './preview';

interface ActivePreview {
  key: string;
  overlay: BoardOverlay;
}

/**
 * Hover/focus previews (and click-to-pin) of board overlays, shared by the analysis views.
 * Any change of `resetKey` (a new move, another selected decision, …) clears the preview,
 * because overlays are built on a specific position.
 */
export function usePreviewBinder(onPreview: (overlay: BoardOverlay | null) => void, resetKey: unknown): PreviewBinder {
  const [hovered, setHovered] = useState<ActivePreview | null>(null);
  const [pinned, setPinned] = useState<ActivePreview | null>(null);

  useEffect(() => {
    setHovered(null);
    setPinned(null);
  }, [resetKey]);

  const active = hovered ?? pinned;
  useEffect(() => onPreview(active?.overlay ?? null), [active, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  return useCallback(
    (key, build) => {
      const show = () => setHovered((h) => (h?.key === key ? h : { key, overlay: build() }));
      const hide = () => setHovered((h) => (h?.key === key ? null : h));
      return {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        onClick: () => setPinned((p) => (p?.key === key ? null : { key, overlay: build() })),
        tabIndex: 0,
        'aria-pressed': pinned?.key === key,
      };
    },
    [pinned],
  );
}
