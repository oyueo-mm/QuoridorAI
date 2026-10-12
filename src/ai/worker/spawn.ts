import type { WorkerLike } from './protocol';

/*
 * Typed locally so this module also compiles without the DOM lib (Node benchmarks import the
 * registry). At runtime `Worker` is the platform's global; Vite needs the literal
 * `new Worker(new URL(...), …)` expression below to bundle the worker.
 */
declare const Worker: (new (url: URL, options: { type: 'module'; name?: string }) => WorkerLike) | undefined;

/** Browser-only: spawns the search worker (Vite bundles it from this exact expression). */
export function spawnSearchWorker(): WorkerLike {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are not available on this platform');
  return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module', name: 'quoridor-search' });
}

export function workersSupported(): boolean {
  return typeof Worker !== 'undefined';
}
