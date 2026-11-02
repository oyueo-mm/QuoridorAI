import { useEffect, useState, useSyncExternalStore } from 'react';
import { MultiController, defaultMultiConfig } from './MultiController';
import type { MultiConfig, MultiSnapshot } from './MultiController';

export type { MultiHistoryEntry, MultiSnapshot } from './MultiController';

/** Minimum time an AI turn takes in the UI, so people can follow a game of several AIs. */
const AI_DELAY_MS = 500;

export interface MultiSession extends MultiSnapshot {
  controller: MultiController;
}

export function useMultiSession(initialConfig?: MultiConfig): MultiSession {
  const [controller] = useState(() => new MultiController(initialConfig ?? defaultMultiConfig(), { aiDelayMs: AI_DELAY_MS }));
  // Drives the AI seats while mounted; unmounting cancels any search and releases the worker.
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { ...snapshot, controller };
}
