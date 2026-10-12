import { formatAction, legalActions } from '../engine';
import type { Action, GameState } from '../engine';
import { assertCanDecide } from './common';
import { puct, runMcts, uct } from './mcts/core';
import type { MctsNode, MctsResult } from './mcts/core';
import { quoridorGame } from './mcts/quoridor';
import { createRolloutEvaluator, describeValueRule } from './mcts/rollout';
import { createRng } from './rng';
import type { Agent, AgentContext, AgentDecision, MctsCandidate, MctsSettings, MctsTrace } from './types';

/** Pure MCTS (stage-4 baseline): UCT + long heuristic rollouts. Kept unchanged for comparison. */
export const DEFAULT_MCTS_SETTINGS: MctsSettings = {
  variant: 'pure',
  iterations: 3000,
  timeLimitMs: 2000,
  exploration: 1.4,
  rollout: 'heuristic',
  rolloutMaxPlies: 100,
  rolloutCutoff: 'distance',
  balancedMoveProbability: 0.5,
  wallFilter: 'opponent-path',
  maxNodes: 200_000,
  selection: 'uct',
  puctConstant: 1.5,
  priorTemperature: 1,
  valueShaping: false,
};

/**
 * Heuristic-Guided MCTS. Each switch was kept only after it helped in the small step-by-step
 * evaluation (bench/results/mcts-improvement/): see the README for the numbers.
 */
export const DEFAULT_GUIDED_MCTS_SETTINGS: MctsSettings = {
  ...DEFAULT_MCTS_SETTINGS,
  variant: 'guided',
  iterations: 20_000,
  rolloutMaxPlies: 4,
  rolloutCutoff: 'evaluation',
  selection: 'puct',
  valueShaping: true,
};

const SNAPSHOT_TOP_K = 8;
const MAX_SNAPSHOTS = 64;
const PV_LIMIT = 8;

export function resolveMctsSettings(partial?: Partial<MctsSettings>): MctsSettings {
  const base = partial?.variant === 'guided' ? DEFAULT_GUIDED_MCTS_SETTINGS : DEFAULT_MCTS_SETTINGS;
  return { ...base, ...partial };
}

export function selectionRuleFor(settings: MctsSettings) {
  return settings.selection === 'puct' ? puct(settings.puctConstant) : uct(settings.exploration);
}

/** Per-decision seed: reproducible for a game seed and position, independent of call order. */
export function decisionSeed(seed: number, ply: number): number {
  return (Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(ply + 1, 0x85ebca6b)) >>> 0;
}

type Node = MctsNode<GameState, Action>;

const qOf = (n: Node) => (n.N > 0 ? n.W / n.N : 0);
const mostVisited = (children: Node[]) =>
  children.reduce<Node | null>((b, c) => (!b || c.N > b.N || (c.N === b.N && qOf(c) > qOf(b)) ? c : b), null);

/** Final choice: a proven win if any (immediate wins first), else the most visited non-lost move. */
function chooseChild(root: Node): { child: Node; rule: MctsTrace['selectionRule'] } {
  const wins = root.children.filter((c) => c.proven === 'win');
  if (wins.length > 0) {
    const immediate = wins.find((c) => c.state.winner !== null);
    return { child: immediate ?? mostVisited(wins)!, rule: 'proven-win' };
  }
  const open = root.children.filter((c) => c.proven !== 'loss');
  return { child: mostVisited(open.length > 0 ? open : root.children)!, rule: 'most-visits' };
}

export function decideMcts(state: GameState, settings: MctsSettings, seed: number, context?: AgentContext): MctsTrace {
  assertCanDecide(state, context);
  const usedSeed = decisionSeed(seed, state.ply);
  const result = runMcts(
    quoridorGame(settings.wallFilter, settings.selection === 'puct' ? { priorTemperature: settings.priorTemperature } : {}),
    state,
    createRolloutEvaluator(settings),
    createRng(usedSeed),
    {
      maxIterations: Math.max(1, Math.floor(settings.iterations)),
      timeLimitMs: settings.timeLimitMs,
      maxNodes: settings.maxNodes,
      selection: selectionRuleFor(settings),
      snapshotTopK: SNAPSHOT_TOP_K,
      maxSnapshots: MAX_SNAPSHOTS,
    },
    {
      signal: context?.signal,
      onProgress: context?.onProgress
        ? (p) =>
            context.onProgress!({
              depth: p.maxDepth,
              completedDepth: 0,
              nodes: p.nodes,
              elapsedMs: p.elapsedMs,
              simulations: p.iterations,
              simulationLimit: settings.iterations,
              bestNotation: p.best?.action ? formatAction(p.best.action as Action) : undefined,
              score: p.best && p.best.N > 0 ? p.best.W / p.best.N : undefined,
            })
        : undefined,
    },
  );
  return buildTrace(state, settings, usedSeed, result);
}

function buildTrace(state: GameState, settings: MctsSettings, seed: number, r: MctsResult<GameState, Action>): MctsTrace {
  const root = r.root;
  const total = Math.max(1, root.children.reduce((s, c) => s + c.N, 0));
  const rule = selectionRuleFor(settings);
  const { child: chosen, rule: selectionRule } = chooseChild(root);

  const candidates: MctsCandidate[] = root.children
    .map((c) => {
      const reply = mostVisited(c.children);
      return {
        action: c.action!,
        notation: formatAction(c.action!),
        visits: c.N,
        q: qOf(c),
        uct: c.N > 0 && c.proven === null ? rule.score(c as MctsNode<unknown, unknown>, root.N) : null,
        share: c.N / total,
        prior: settings.selection === 'puct' ? c.prior : undefined,
        proven: c.proven,
        // Reply q is shown from the deciding player's view (negated opponent value).
        reply:
          reply && reply.N > 0
            ? { action: reply.action!, notation: formatAction(reply.action!), visits: reply.N, q: -qOf(reply) }
            : undefined,
        rank: 0,
      };
    })
    .sort((a, b) => b.visits - a.visits || b.q - a.q);
  // The chosen move is ranked first even when a proven win has fewer visits.
  const chosenIndex = candidates.findIndex((c) => c.action === chosen.action);
  if (chosenIndex > 0) candidates.unshift(...candidates.splice(chosenIndex, 1));
  candidates.forEach((c, i) => (c.rank = i + 1));

  const pv: MctsTrace['pv'] = [];
  for (let n: Node | null = chosen; n && pv.length < PV_LIMIT; n = mostVisited(n.children)) {
    if (n.N === 0) break;
    pv.push({ action: n.action!, notation: formatAction(n.action!), visits: n.N, q: qOf(n) });
  }

  const notationOf = root.children.map((c) => formatAction(c.action!));
  const trace: MctsTrace = {
    algorithm: 'mcts',
    player: state.currentPlayer,
    ply: state.ply,
    elapsedMs: r.elapsedMs,
    settings,
    seed,
    simulations: r.iterations,
    treeNodes: r.nodes,
    maxTreeDepth: r.maxDepth,
    stopReason: r.stopReason,
    rootQ: root.N > 0 ? -root.W / root.N : 0,
    rollouts: {
      count: r.rollouts.count,
      terminal: r.rollouts.terminal,
      truncated: r.rollouts.truncated,
      avgPlies: r.rollouts.count > 0 ? r.rollouts.totalPlies / r.rollouts.count : 0,
      treeTerminal: r.rollouts.treeTerminal,
    },
    valueRule: describeValueRule(settings),
    legalActionCount: legalActions(state).length,
    searchedActionCount: root.children.length + (root.untried?.length ?? 0),
    candidates,
    selectionRule,
    pv,
    snapshots: r.snapshots.map((s) => ({
      simulations: s.iterations,
      elapsedMs: s.elapsedMs,
      top: s.top.map((t) => ({ notation: notationOf[t.child], visits: t.visits, q: t.q })),
    })),
    rationale: [],
  };
  trace.rationale = explain(trace);
  return trace;
}

const CUTOFF_LABEL: Record<MctsSettings['rolloutCutoff'], string> = {
  distance: '거리 추정값',
  evaluation: 'Minimax 평가값',
  draw: '무승부(0)',
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3);

function explain(t: MctsTrace): string[] {
  const [best, second] = t.candidates;
  const lines: string[] = [];
  const stop: Record<MctsTrace['stopReason'], string> = {
    iterations: `시뮬레이션 한도 ${t.settings.iterations}회`,
    time: `시간 제한 ${t.settings.timeLimitMs}ms`,
    'proven-win': '승리 증명',
    'proven-loss': '패배 증명',
    'single-move': '가능한 수가 하나뿐',
  };
  if (t.selectionRule === 'proven-win') {
    lines.push(`${best.notation}: MCTS-Solver가 승리를 증명한 수입니다${best.visits <= 1 ? ' (즉시 승리)' : ''}.`);
  } else {
    lines.push(
      `${best.notation} 선택 — 가장 많이 방문한 수 (${best.visits}/${t.simulations}회, ${pct(best.share)}), 평균 가치 Q ${num(best.q)}.`,
    );
  }
  lines.push(`탐색은 ${stop[t.stopReason]}에서 멈췄습니다 (${t.simulations}회 시뮬레이션, 트리 ${t.treeNodes}노드, 최대 깊이 ${t.maxTreeDepth}).`);
  if (best.reply) lines.push(`가장 많이 탐색된 상대 응수: ${best.reply.notation} (${best.reply.visits}회).`);
  if (second && t.selectionRule === 'most-visits') {
    lines.push(`2위 ${second.notation}: ${second.visits}회 (${pct(second.share)}), Q ${num(second.q)}.`);
  }
  const lost = t.candidates.filter((c) => c.proven === 'loss').length;
  if (lost > 0) lines.push(`후보 ${lost}개는 상대의 강제 승리가 증명되어 선택에서 제외되었습니다.`);
  if (t.rollouts.count > 0) {
    lines.push(
      `롤아웃 ${t.rollouts.count}회 중 ${t.rollouts.terminal}회는 실제 승패로 끝났고 ${t.rollouts.truncated}회는 ` +
        `${t.settings.rolloutMaxPlies} ply 제한에 걸려 ${CUTOFF_LABEL[t.settings.rolloutCutoff]}으로 처리했습니다.`,
    );
  }
  return lines;
}

export function createMctsAgent(partial: Partial<MctsSettings> = {}, seed = 1): Agent<MctsTrace> {
  const settings = resolveMctsSettings(partial);
  return {
    id: 'mcts',
    async decide(state: GameState, context?: AgentContext): Promise<AgentDecision<MctsTrace>> {
      const trace = decideMcts(state, settings, seed, context);
      return { action: trace.candidates[0].action, trace };
    },
  };
}
