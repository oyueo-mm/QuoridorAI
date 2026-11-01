import { useState, useSyncExternalStore } from 'react';
import { MultiController, defaultMultiConfig } from './MultiController';
import type { MultiConfig, MultiSnapshot } from './MultiController';

export type { MultiHistoryEntry, MultiSnapshot } from './MultiController';

export interface MultiSession extends MultiSnapshot {
  controller: MultiController;
}

export function useMultiSession(initialConfig?: MultiConfig): MultiSession {
  const [controller] = useState(() => new MultiController(initialConfig ?? defaultMultiConfig()));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { ...snapshot, controller };
}
