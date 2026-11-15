import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseMoveList } from '../../src/arena/openings';
import { openingState } from '../../src/arena/tournament';
import { distanceToRow, goalRow } from '../../src/engine';
import type { GameState } from '../../src/engine';

/** Real game positions for evaluation/search profiling (stage 3-B 300 ms games, E5 vs v1). */
export const GAMES_DIR = 'bench/results/stage3b/stage3b-time/T-E5-300';
export type Phase = 'opening' | 'middle' | 'endgame';

export function loadGames(dir = GAMES_DIR): GameState[][] {
  const out: GameState[][] = [];
  for (const f of readdirSync(dir).filter((n) => n.startsWith('games.') && n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { moves: string[]; opening: Parameters<typeof openingState>[0] };
      out.push(parseMoveList(r.moves.join(' '), openingState(r.opening)).positions.filter((s) => s.winner === null));
    }
  }
  return out;
}

export function phaseOf(s: GameState): Phase {
  if (s.ply < 14) return 'opening';
  const d = [0, 1].map((p) => distanceToRow(s, s.pawns[p], goalRow(p as 0 | 1)));
  if (s.wallsRemaining[0] + s.wallsRemaining[1] <= 4 || Math.min(...d) <= 3) return 'endgame';
  return 'middle';
}

/** Evenly spaced positions per phase (same rule as the stage 3-C search profile). */
export function samplePositions(all: GameState[][], perPhase: number): Record<Phase, GameState[]> {
  const by: Record<Phase, GameState[]> = { opening: [], middle: [], endgame: [] };
  for (const g of all) for (const s of g) by[phaseOf(s)].push(s);
  const pick = (a: GameState[]) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / perPhase)) === 0).slice(0, perPhase);
  return { opening: pick(by.opening), middle: pick(by.middle), endgame: pick(by.endgame) };
}
