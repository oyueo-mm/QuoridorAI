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

/** A newer request replaced this one before it finished (its result is no longer wanted). */
export class ObstacleSupersededError extends Error {
  constructor() {
    super('obstacle map request superseded');
    this.name = 'ObstacleSupersededError';
  }
}

let latest = 0;

/** Ends every request still in flight: a stale (possibly slow) map must neither delay the newest one nor overwrite it. */
function supersedePending(): void {
  for (const w of waiting.values()) w.reject(new ObstacleSupersededError());
  waiting.clear();
  if (worker) {
    worker.terminate(); // it may be busy with a hard map nobody wants any more
    worker = undefined; // a new one is created on demand
  }
}

/**
 * Generates the obstacle map of `settings` off the main thread (the hardest presets take a few
 * hundred ms with four players). Same function as a real start, so the same settings give the same
 * map. Only the newest request is served: an older one rejects with ObstacleSupersededError. Without
 * Worker support (or after it failed) it runs on the main thread in a later task, and only if it is
 * still the newest request by then.
 */
export function generateObstacleMap(settings: ObstacleSettings): Promise<MultiRules> {
  const mine = ++latest;
  supersedePending();
  const onMainThread = () =>
    new Promise<MultiRules>((resolve, reject) =>
      setTimeout(() => {
        if (mine !== latest) return reject(new ObstacleSupersededError());
        try {
          resolve(obstacleRules(settings.players, settings.preset, settings.seed));
        } catch (e) {
          reject(e);
        }
      }, 0),
    );
  const w = getWorker();
  if (!w) return onMainThread();
  const id = nextId++;
  return new Promise<MultiRules>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, ...settings } satisfies ObstacleRequest);
  }).catch((e) => {
    if (e instanceof ObstacleSupersededError) throw e;
    return onMainThread(); // the worker failed: compute here, but not before the UI had a chance to paint
  });
}
