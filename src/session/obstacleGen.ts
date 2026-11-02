import { obstacleRules } from '../engine';
import type { MultiRules, ObstaclePreset } from '../engine';
import type { ObstacleReply, ObstacleRequest } from './obstacleWorker';

export interface ObstacleSettings {
  players: number;
  preset: ObstaclePreset;
  seed: number;
}

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: MultiRules) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./obstacleWorker.ts', import.meta.url), { type: 'module' });
    worker?.addEventListener('message', (e: MessageEvent<ObstacleReply>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (!w) return;
      if ('error' in e.data) w.reject(new Error(e.data.error));
      else w.resolve(e.data.rules);
    });
    worker?.addEventListener('error', () => {
      // Worker unusable: fail the pending requests and generate on the main thread from now on.
      worker = null;
      for (const w of waiting.values()) w.reject(new Error('worker failed'));
      waiting.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Generates the obstacle map of `settings` off the main thread (the hardest presets take a few
 * hundred ms with four players). Same function as a real start, so the same settings give the same
 * map. Without Worker support it runs on the main thread after the current event.
 */
export function generateObstacleMap(settings: ObstacleSettings): Promise<MultiRules> {
  const w = getWorker();
  if (!w) return new Promise((resolve, reject) => setTimeout(() => { try { resolve(obstacleRules(settings.players, settings.preset, settings.seed)); } catch (e) { reject(e); } }, 0));
  const id = nextId++;
  return new Promise<MultiRules>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, ...settings } satisfies ObstacleRequest);
  }).catch(() => obstacleRules(settings.players, settings.preset, settings.seed));
}
