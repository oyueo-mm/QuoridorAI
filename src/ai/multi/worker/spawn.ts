import type { MultiWorkerLike } from './protocol';

/*
 * Typed locally so the module also compiles without the DOM lib (Node tests and benchmarks import
 * the engine). At runtime `Worker` is the platform's global; Vite needs the literal
 * `new Worker(new URL(...), …)` expression below to bundle the worker.
 */
declare const Worker: (new (url: URL, options: { type: 'module'; name?: string }) => MultiWorkerLike) | undefined;

export function multiWorkersSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/** Browser-only: spawns the multi-player search worker. */
export function spawnMultiWorker(): MultiWorkerLike {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are not available on this platform');
  return new Worker(new URL('./multi.worker.ts', import.meta.url), { type: 'module', name: 'quoridor-multi-search' });
}
