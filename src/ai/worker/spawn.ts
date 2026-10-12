import type { WorkerLike } from './protocol';

/** Browser-only: spawns the search worker (Vite bundles it from this exact expression). */
export function spawnSearchWorker(): WorkerLike {
  return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module', name: 'quoridor-search' }) as unknown as WorkerLike;
}

export function workersSupported(): boolean {
  return typeof Worker !== 'undefined';
}
