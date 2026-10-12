import { useEffect, useRef } from 'react';
import type { Action } from '../engine';
import { soundEngine, soundForAction } from './sound';
import type { SoundEngine, SoundKind, SoundSource } from './sound';

/**
 * Decides when a game record deserves a sound: only when the same game (key) gains entries.
 * A new game, a restart, the first observation, re-renders and React StrictMode's repeated
 * effects all leave it silent. Several entries arriving at once produce one sound (the last).
 */
export class MoveSoundTracker {
  private seen: { key: string | number; count: number } | null = null;

  observe(key: string | number, actions: readonly { action: Action }[], enabled = true): SoundKind | null {
    const prev = this.seen;
    this.seen = { key, count: actions.length };
    if (!enabled || prev === null || prev.key !== key || actions.length <= prev.count) return null;
    return soundForAction(actions[actions.length - 1].action);
  }
}

/**
 * Plays the move / wall sound when a live game record grows. `enabled = false` (e.g. while
 * browsing a replay) keeps tracking without sound, so nothing is played later to catch up.
 * Analysis previews and replay navigation never change the record, so they stay silent.
 */
export function useMoveSounds(key: string | number, actions: readonly { action: Action }[], source: SoundSource, enabled = true, minIntervalMs = 0, engine: SoundEngine = soundEngine): void {
  const tracker = useRef<MoveSoundTracker | null>(null);
  tracker.current ??= new MoveSoundTracker();
  useEffect(() => {
    const kind = tracker.current!.observe(key, actions, enabled);
    if (kind) engine.play(kind, source, minIntervalMs);
    // Only a new key or a new entry matters; other props are read at that moment.
  }, [key, actions.length]);
}
