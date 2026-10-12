import { useEffect, useState, useSyncExternalStore } from 'react';
import { defaultConfig } from './config';
import type { GameConfig } from './config';
import { GameController } from './GameController';
import type { SessionSnapshot } from './GameController';

export type { HistoryEntry, SessionSnapshot } from './GameController';

/** Delay before an AI move is shown, so the user can follow the game. */
const AI_DELAY_MS = 450;

export interface GameSession extends SessionSnapshot {
  controller: GameController;
}

export function useGameSession(initialConfig?: GameConfig): GameSession {
  const [controller] = useState(
    () => new GameController(initialConfig ?? defaultConfig(), { aiDelayMs: AI_DELAY_MS }),
  );
  useEffect(() => {
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { ...snapshot, controller };
}
