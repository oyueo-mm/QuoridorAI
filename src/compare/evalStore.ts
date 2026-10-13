import { deriveSeed } from '../arena/agentSpec';
import type { AgentFactory, AgentSpec, Budget } from '../arena/agentSpec';
import type { GameState } from '../engine';
import { runComparison } from './compare';
import type { CompareResult } from './compare';
import { evalKey, positionKey } from './positionEval';

export interface EvalJob {
  state: GameState;
  /** positionKey(state). */
  key: string;
}

export interface RunningEval {
  posKey: string;
  specIndex: number;
}

/**
 * AI evaluations of analysis positions, cached per (position, AI setting).
 *
 * request() cancels whatever is running (aborting terminates search workers) and, after a short
 * debounce, evaluates the given positions one AI at a time in Web Workers. A result is stored
 * under the position it was computed for, so an answer that arrives late can never be shown for
 * a different position: the UI always reads the cache with the key of the position on screen.
 * Cancelled or failed runs are not cached. Seeds are derived per AI slot (as in runComparison),
 * so the same position and setting always gives the same result.
 */
export class EvalStore {
  private cache = new Map<string, CompareResult>();
  private listeners = new Set<() => void>();
  private version = 0;
  private runId = 0;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  running: RunningEval | null = null;

  constructor(private readonly factory: AgentFactory) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  get(posKey: string, spec: AgentSpec, specIndex: number, budget: Budget, seed: number): CompareResult | undefined {
    return this.cache.get(`${posKey}|${evalKey(spec, budget, deriveSeed(seed, specIndex))}`);
  }

  /** Cancels the running evaluation (its partial results are dropped). */
  cancel(): void {
    this.runId++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    if (this.running) {
      this.running = null;
      this.emit();
    }
  }

  /** Evaluates `jobs` in order (missing entries only), replacing any earlier request. */
  request(jobs: readonly EvalJob[], specs: readonly AgentSpec[], budget: Budget, seed: number, delayMs = 250): Promise<void> {
    this.cancel();
    const id = this.runId;
    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.run(id, jobs, specs, budget, seed).finally(resolve);
      }, delayMs);
    });
  }

  private async run(id: number, jobs: readonly EvalJob[], specs: readonly AgentSpec[], budget: Budget, seed: number): Promise<void> {
    const ac = new AbortController();
    this.abort = ac;
    for (const job of jobs) {
      if (job.state.winner !== null) continue;
      for (const [i, spec] of specs.entries()) {
        if (id !== this.runId) return;
        const s = deriveSeed(seed, i);
        const key = `${job.key}|${evalKey(spec, budget, s)}`;
        if (this.cache.has(key)) continue;
        this.running = { posKey: job.key, specIndex: i };
        this.emit();
        // One AI per call; the agent's seed is deriveSeed(slot seed, 0), deterministic per slot.
        const [result] = await runComparison(job.state, [spec], budget, s, this.factory, { signal: ac.signal }).catch(() => [undefined]);
        if (id !== this.runId) return;
        if (result?.status === 'done') this.cache.set(key, result);
      }
    }
    if (id === this.runId) {
      this.running = null;
      this.abort = null;
      this.emit();
    }
  }
}

export { positionKey };
