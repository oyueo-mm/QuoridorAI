export interface AgentDescriptor {
  id: string;
  name: string;
  description: string;
  /** False until the agent is implemented; the UI lists it as upcoming. */
  available: boolean;
}

export const AGENT_CATALOG: readonly AgentDescriptor[] = [
  { id: 'random', name: 'Random', description: '합법 행동 중 무작위 선택', available: false },
  { id: 'bfs', name: 'BFS Greedy', description: '최단 경로 기반 탐욕 전략', available: false },
  { id: 'minimax', name: 'Minimax', description: '고정 깊이 미니맥스 탐색', available: false },
  { id: 'alphabeta', name: 'Alpha-Beta', description: '알파-베타 가지치기 탐색', available: false },
  { id: 'mcts', name: 'MCTS', description: '몬테카를로 트리 탐색', available: false },
  { id: 'alphazero', name: 'AlphaZero', description: '정책·가치망 + PUCT 탐색', available: false },
];
