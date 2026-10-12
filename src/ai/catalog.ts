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
  { id: 'minimax', name: 'Minimax', description: '고정 깊이 미니맥스 탐색', available: false },
  { id: 'alphabeta', name: 'Alpha-Beta', description: '알파-베타 가지치기 탐색', available: false },
  { id: 'mcts', name: 'MCTS', description: '몬테카를로 트리 탐색', available: false },
  { id: 'alphazero', name: 'AlphaZero', description: '정책·가치망 + PUCT 탐색', available: false },
];

export function agentName(id: string): string {
  return AGENT_CATALOG.find((a) => a.id === id)?.name ?? id;
}
