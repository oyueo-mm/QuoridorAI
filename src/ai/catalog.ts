export interface AgentDescriptor {
  id: string;
  name: string;
  description: string;
  /** False until the agent is implemented; the UI lists it as upcoming. */
  available: boolean;
}

export const AGENT_CATALOG: readonly AgentDescriptor[] = [
  { id: 'random', name: 'Random AI', description: '합법 행동 중 균등 무작위 선택 (시드 고정 가능)', available: true },
  { id: 'bfs', name: 'BFS AI', description: 'BFS 최단 거리 기반 1수 휴리스틱 평가', available: true },
  {
    id: 'minimax',
    name: 'Minimax AI',
    description: 'Minimax / Alpha-Beta 탐색 (반복 심화, 이동 정렬, 전치표, Web Worker)',
    available: true,
  },
  { id: 'mcts', name: 'Pure MCTS AI', description: '순수 몬테카를로 트리 탐색 (UCT, 긴 롤아웃, MCTS-Solver)', available: true },
  {
    id: 'mcts-guided',
    name: 'Guided MCTS AI',
    description: '휴리스틱 유도 MCTS (평가 컷오프 4 ply, PUCT + 휴리스틱 사전 확률, 가치 포화 완화)',
    available: true,
  },
  { id: 'alphazero', name: 'AlphaZero', description: '정책·가치망 + PUCT 탐색', available: false },
];

export function agentName(id: string): string {
  return AGENT_CATALOG.find((a) => a.id === id)?.name ?? id;
}
