import { obstacleRules } from '../engine';
import type { MultiRules, ObstaclePreset } from '../engine';

/** Request / reply of the obstacle-map worker (see obstacleGen.ts). */
export interface ObstacleRequest {
  id: number;
  players: number;
  preset: ObstaclePreset;
  seed: number;
}
export type ObstacleReply = { id: number; rules: MultiRules } | { id: number; error: string };

self.onmessage = (e: MessageEvent<ObstacleRequest>) => {
  const { id, players, preset, seed } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, rules: obstacleRules(players, preset, seed) } satisfies ObstacleReply);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies ObstacleReply);
  }
};
