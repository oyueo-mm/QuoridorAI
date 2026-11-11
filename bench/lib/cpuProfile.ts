import { Session } from 'node:inspector/promises';

/**
 * In-process V8 CPU sampling (the same data as `node --cpu-prof`), aggregated by component.
 * Sampling attributes time statistically: shares of a few percent are within noise, and
 * functions inlined by the JIT are charged to their caller.
 */

interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
}
interface ProfileNode {
  id: number;
  callFrame: CallFrame;
  children?: number[];
}
interface CpuProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

export interface ProfileBreakdown {
  totalMs: number;
  samples: number;
  /** Self time by component (exclusive; sums to ~100 % of non-idle time). */
  selfByComponent: Record<string, number>;
  /** Inclusive time of selected functions (a sample counts once per function on its stack). */
  inclusiveByFunction: Record<string, number>;
  /** Top self-time functions. */
  topSelf: { fn: string; ms: number }[];
  /**
   * Time by search phase: the frame directly called by the innermost search driver
   * (negamax/searchRoot or runMcts) decides the phase; driver self time is its own phase.
   */
  phases: Record<string, number>;
}

/** Search phase of a driver's direct callee. */
export function phaseOf(driver: string, callee: CallFrame | null): string {
  if (!callee) return `${driver} (self: loop, TT map, bookkeeping)`;
  const fn = callee.functionName;
  const url = callee.url.replace(/\\/g, '/');
  if (driver === 'runMcts') {
    if (fn === 'selectChild' || fn === 'shouldExpand') return 'mcts: selection';
    if (fn === 'expandActions' || fn === 'createNode' || fn === 'applyActionUnchecked' || fn === 'actions') return 'mcts: expansion (actions, priors, child state)';
    if (url.includes('/ai/mcts/rollout')) return 'mcts: evaluation (rollout / cutoff eval)';
    if (fn === 'backpropagate') return 'mcts: backpropagation (+solver)';
    if (fn === 'takeSnapshot') return 'mcts: trace snapshots';
    if (fn === '(garbage collector)') return 'gc';
    return `mcts: other (${fn || 'anonymous'})`;
  }
  if (fn === 'expand') return 'ab: expand (candidates + ordering evals)';
  if (fn === 'materialize') return 'ab: materialize (child state + wall legality)';
  if (fn === 'hashState') return 'ab: hashing';
  if (fn === 'tick') return 'ab: time/abort check';
  if (fn === 'leafValue' || url.includes('/ai/search/evaluation') || (url.includes('/ai/search/minimax') && fn === '')) return 'ab: leaf evaluation';
  if (fn === 'newRecord' || fn === 'finishRecord' || fn === 'trimChildren' || fn === 'formatAction') return 'ab: trace recording';
  if (fn === 'storeKiller') return 'ab: killer moves';
  if (fn === '(garbage collector)') return 'gc';
  return `ab: other (${fn || 'anonymous'})`;
}

const DRIVERS = new Set(['negamax', 'searchRoot', 'runMcts']);

/** Maps a frame to a component name. Order matters: specific functions before files. */
export function componentOf(frame: CallFrame): string {
  const fn = frame.functionName;
  const url = frame.url.replace(/\\/g, '/');
  if (fn === '(garbage collector)') return 'gc';
  if (fn === '(program)' || fn === '(idle)' || fn === '(root)') return 'idle/program';
  if (url.includes('/engine/pathfinding')) return 'bfs-distance';
  if (url.includes('/engine/board')) return 'board-primitives (canStep/isBlocked/hasWall)';
  if (url.includes('/engine/walls')) return 'wall-geometry (conflicts/withWall/path-cut)';
  if (url.includes('/engine/rules')) return 'legal-move-generation';
  if (url.includes('/engine/game')) return 'state-transition';
  if (url.includes('/engine/zobrist')) return 'hashing';
  if (url.includes('/engine/notation') || url.includes('/engine/encoding')) return 'notation/encoding';
  if (url.includes('/ai/search/evaluation')) return 'evaluation';
  if (url.includes('/ai/search/candidates')) return 'candidate-generation';
  if (url.includes('/ai/search/minimax')) return 'alphabeta-control (negamax/expand/ordering/TT)';
  if (url.includes('/ai/mcts/core')) {
    if (fn === 'selectChild' || fn === 'score' || fn === 'shouldExpand' || fn === 'unvisitedScore' || fn === 'chooserValue') return 'mcts-selection';
    if (fn === 'backpropagate' || fn === 'updateProof') return 'mcts-backpropagation';
    if (fn === 'createNode' || fn === 'expandActions') return 'mcts-expansion';
    return 'mcts-loop';
  }
  if (url.includes('/ai/mcts/quoridor')) return 'mcts-expansion (priors/ordering)';
  if (url.includes('/ai/mcts/rollout')) return 'mcts-evaluation (rollout/cutoff)';
  if (url.includes('/ai/')) return 'agent-other';
  if (!url) return `native:${fn || 'anonymous'}`;
  return 'other-js';
}

const TRACKED = [
  'distanceToRow',
  'shortestPath',
  'distanceMap',
  'hasPathToRow',
  'legalPawnMoves',
  'legalWallPlacements',
  'legalActions',
  'pseudoCandidates',
  'isCandidateLegal',
  'searchCandidates',
  'wallConflicts',
  'withWall',
  'applyActionUnchecked',
  'hashState',
  'evaluate',
  'childEvaluator',
  'expand',
  'materialize',
  'negamax',
  'selectChild',
  'backpropagate',
  'priorOrder',
  'pureOrder',
  'heuristicAction',
  'truncatedValue',
  'isLegalAction',
  'formatAction',
];

export async function profileCpu<T>(fn: () => T | Promise<T>, intervalUs = 100): Promise<{ result: T; profile: ProfileBreakdown }> {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: intervalUs });
  await session.post('Profiler.start');
  try {
    const result = await fn();
    const { profile } = (await session.post('Profiler.stop')) as unknown as { profile: CpuProfile };
    return { result, profile: aggregate(profile) };
  } finally {
    await session.post('Profiler.disable');
    session.disconnect();
  }
}

export function aggregate(p: CpuProfile): ProfileBreakdown {
  const byId = new Map<number, ProfileNode>();
  const parent = new Map<number, number>();
  for (const n of p.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
  }
  const self: Record<string, number> = {};
  const incl: Record<string, number> = {};
  const fnSelf = new Map<string, number>();
  const phases: Record<string, number> = {};
  let total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i] ?? 0) / 1000; // µs → ms
    const node = byId.get(p.samples[i]);
    if (!node) continue;
    const comp = componentOf(node.callFrame);
    if (comp === 'idle/program') continue;
    total += dt;
    self[comp] = (self[comp] ?? 0) + dt;
    const key = `${node.callFrame.functionName || '(anonymous)'} @${node.callFrame.url.replace(/\\/g, '/').split('/').slice(-2).join('/')}:${node.callFrame.lineNumber}`;
    fnSelf.set(key, (fnSelf.get(key) ?? 0) + dt);
    const seen = new Set<string>();
    let callee: CallFrame | null = null;
    let phase: string | null = null;
    for (let id: number | undefined = node.id; id !== undefined; id = parent.get(id)) {
      const frame = byId.get(id)!.callFrame;
      const name = frame.functionName;
      if (TRACKED.includes(name) && !seen.has(name)) {
        seen.add(name);
        incl[name] = (incl[name] ?? 0) + dt;
      }
      if (phase === null && DRIVERS.has(name)) phase = phaseOf(name === 'runMcts' ? 'runMcts' : 'negamax', callee);
      callee = frame;
    }
    // GC samples have no JS stack: charge them to GC explicitly.
    const ph = comp === 'gc' ? 'gc' : (phase ?? 'outside search');
    phases[ph] = (phases[ph] ?? 0) + dt;
  }
  return {
    totalMs: total,
    samples: p.samples.length,
    selfByComponent: self,
    inclusiveByFunction: incl,
    topSelf: [...fnSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([fn, ms]) => ({ fn, ms })),
    phases,
  };
}
