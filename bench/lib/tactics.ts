/**
 * Tactical test oracles (verification only — not agents).
 *
 * Exact categories are decided by the rules alone:
 *  - win-in-1      some pawn move reaches the goal row now.
 *  - defend-1      the opponent threatens to reach its goal next ply; some action stops it.
 *  - win-in-3      a forced win in 3 plies (my move, any reply, my winning move), checked by
 *                  enumerating every legal action and every legal reply (walls included).
 *  - win-in-5      a forced win in 5 plies, proven by a full-width search (all legal walls,
 *                  no candidate filter): a decisive score there is a proof.
 *  - endgame-*     both players have no walls: the position is solved exactly by retrograde
 *                  analysis over (pawn, pawn, side to move) for the fixed wall layout.
 * Heuristic categories have no proven answer; they are scored by stated 1-ply measures.
 */
import { pseudoCandidates } from '../../src/ai/search/candidates';
import { RACE_EVAL_V1, createDistanceEvaluator, isDecisive } from '../../src/ai/search/evaluation';
import { runSearch } from '../../src/ai/search/minimax';
import { DEFAULT_MINIMAX_SETTINGS } from '../../src/ai/minimaxAgent';
import {
  BOARD_SIZE,
  NUM_CELLS,
  applyActionUnchecked,
  distanceToRow,
  formatAction,
  goalRow,
  legalActions,
  legalPawnMoves,
  opponentOf,
  pawnMovesAmong,
} from '../../src/engine';
import type { Action, Coord, GameState, PlayerId, WallLayout } from '../../src/engine';

export const dist = (s: GameState, p: PlayerId) => distanceToRow(s, s.pawns[p], goalRow(p));

export function winningPawnMoves(state: GameState, player: PlayerId = state.currentPlayer): Coord[] {
  if (state.winner !== null) return [];
  return legalPawnMoves(state, player).filter((c) => c.row === goalRow(player));
}

/** Actions after which the opponent has no immediate win (an immediate own win counts). */
export function savingActions(state: GameState): Action[] {
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  return legalActions(state).filter((a) => {
    const next = applyActionUnchecked(state, a);
    return next.winner === me || winningPawnMoves(next, opp).length === 0;
  });
}

/** After `child` (opponent to move, no winner yet): does every reply leave me a win-in-1? */
export function opponentLosesIn2(child: GameState): boolean {
  if (child.winner !== null) return child.winner !== child.currentPlayer;
  const me = opponentOf(child.currentPlayer);
  // A pawn move of the opponent that wins, or any reply after which I cannot win at once.
  for (const r of legalActions(child)) {
    const g = applyActionUnchecked(child, r);
    if (g.winner !== null) return false;
    if (winningPawnMoves(g, me).length === 0) return false;
  }
  return true;
}

/** Root actions that force a win within 3 plies (immediate wins included). */
export function winIn3Actions(state: GameState): Action[] {
  const me = state.currentPlayer;
  return legalActions(state).filter((a) => {
    const child = applyActionUnchecked(state, a);
    return child.winner === me || opponentLosesIn2(child);
  });
}

const evaluator = createDistanceEvaluator(RACE_EVAL_V1);

/**
 * Proof search: full width (every legal wall), fixed depth, no time limit. A decisive score is
 * exact: the evaluator only scores non-terminal leaves and never reaches DECISIVE_SCORE.
 * Returns plies to the forced result (positive = side to move wins), or null if none ≤ depth.
 */
export function provenResult(state: GameState, depth: number): number | null {
  if (state.winner !== null) return state.winner === state.currentPlayer ? 0 : -0;
  const r = runSearch(state, { ...DEFAULT_MINIMAX_SETTINGS, wallFilter: 'all', maxDepth: depth, timeLimitMs: 0 }, evaluator);
  if (!isDecisive(r.score)) return null;
  const plies = 10_000 - Math.abs(r.score);
  return r.score > 0 ? plies : -plies;
}

/** True if, after `action`, the side that played it still has a forced win within `plies` total. */
export function keepsForcedWin(state: GameState, action: Action, plies: number): boolean {
  const me = state.currentPlayer;
  const child = applyActionUnchecked(state, action);
  if (child.winner !== null) return child.winner === me;
  if (plies <= 1) return false;
  const r = provenResult(child, plies - 1);
  return r !== null && r < 0 && -r <= plies - 1;
}

// ---------------------------------------------------------------- no-wall endgames

export type EndgameValue = { result: 'win' | 'loss' | 'draw'; plies: number };

/**
 * Exact solution of the pawn-only game for a fixed wall layout (both players without walls):
 * value of every (pawn0, pawn1, side to move) by retrograde analysis. `plies` = plies to the
 * end under optimal play (winner fastest, loser slowest). Positions never resolved are draws.
 */
export class NoWallSolver {
  private readonly value = new Int16Array(NUM_CELLS * NUM_CELLS * 2); // 0 unknown, +n win in n, −n loss in n
  constructor(private readonly walls: WallLayout) {
    this.solve();
  }

  private idx(p0: number, p1: number, side: number) {
    return (p0 * NUM_CELLS + p1) * 2 + side;
  }

  private children(p0: number, p1: number, side: number): number[] {
    const self = side === 0 ? p0 : p1;
    const other = side === 0 ? p1 : p0;
    const c = (i: number): Coord => ({ row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE });
    return pawnMovesAmong(this.walls, c(self), [c(other)]).map((m) => m.row * BOARD_SIZE + m.col);
  }

  private solve() {
    const terminal = (p0: number, p1: number) => Math.floor(p0 / BOARD_SIZE) === goalRow(0) || Math.floor(p1 / BOARD_SIZE) === goalRow(1);
    const states: [number, number, number][] = [];
    for (let p0 = 0; p0 < NUM_CELLS; p0++) {
      for (let p1 = 0; p1 < NUM_CELLS; p1++) {
        if (p0 === p1 || terminal(p0, p1)) continue;
        states.push([p0, p1, 0], [p0, p1, 1]);
      }
    }
    const kids = states.map(([p0, p1, side]) => this.children(p0, p1, side));
    // A win in n needs a loss in n − 1 and vice versa, so two empty levels end the analysis.
    let emptyLevels = 0;
    for (let level = 1; level < 400 && emptyLevels < 2; level++) {
      const updates: [number, number][] = [];
      states.forEach(([p0, p1, side], i) => {
        const at = this.idx(p0, p1, side);
        if (this.value[at] !== 0) return;
        const goal = goalRow(side as PlayerId);
        if (level % 2 === 1) {
          // Win in `level`: a move that wins now (level 1) or reaches a loss in level − 1.
          for (const m of kids[i]) {
            if (level === 1 ? Math.floor(m / BOARD_SIZE) === goal : this.childValue(side, p0, p1, m) === -(level - 1)) {
              updates.push([at, level]);
              return;
            }
          }
        } else {
          // Loss in `level`: every move reaches a known win for the opponent, the slowest in level − 1.
          let worst = 0;
          for (const m of kids[i]) {
            if (Math.floor(m / BOARD_SIZE) === goal) return; // can win: not a loss
            const v = this.childValue(side, p0, p1, m);
            if (v <= 0) return;
            worst = Math.max(worst, v);
          }
          if (kids[i].length > 0 && worst === level - 1) updates.push([at, -level]);
        }
      });
      for (const [at, v] of updates) this.value[at] = v;
      emptyLevels = updates.length === 0 ? emptyLevels + 1 : 0;
    }
  }

  /** Value of the child after `side` moved to cell `m`, from the child's side-to-move view. */
  private childValue(side: number, p0: number, p1: number, m: number): number {
    return side === 0 ? this.value[this.idx(m, p1, 1)] : this.value[this.idx(p0, m, 0)];
  }

  valueOf(state: GameState): EndgameValue {
    const p0 = state.pawns[0].row * BOARD_SIZE + state.pawns[0].col;
    const p1 = state.pawns[1].row * BOARD_SIZE + state.pawns[1].col;
    const v = this.value[this.idx(p0, p1, state.currentPlayer)];
    return v > 0 ? { result: 'win', plies: v } : v < 0 ? { result: 'loss', plies: -v } : { result: 'draw', plies: 0 };
  }

  /** Value after the side to move plays pawn move `to`, from the mover's view. */
  moveValue(state: GameState, to: Coord): EndgameValue {
    const me = state.currentPlayer;
    if (to.row === goalRow(me)) return { result: 'win', plies: 1 };
    const child = applyActionUnchecked(state, { type: 'move', to });
    const v = this.valueOf(child);
    if (v.result === 'draw') return v;
    return { result: v.result === 'win' ? 'loss' : 'win', plies: v.plies + 1 };
  }
}

// ---------------------------------------------------------------- heuristic measures

/** Race margin from the mover's view after `action` (opponent distance − own distance). */
export function marginAfter(state: GameState, action: Action): number {
  const me = state.currentPlayer;
  const next = applyActionUnchecked(state, action);
  if (next.winner === me) return Infinity;
  return dist(next, opponentOf(me)) - dist(next, me);
}

/** Best 1-ply race margin over every legal action. */
export function bestMargin(state: GameState): number {
  return Math.max(...legalActions(state).map((a) => marginAfter(state, a)));
}

/** Walls (legal) that lengthen the own path more than the opponent's. */
export function selfHarmWalls(state: GameState): Action[] {
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  const d0 = dist(state, me);
  const o0 = dist(state, opp);
  return legalActions(state).filter((a) => {
    if (a.type !== 'wall') return false;
    const n = applyActionUnchecked(state, a);
    return dist(n, me) - d0 > dist(n, opp) - o0;
  });
}

export const notation = (as: readonly Action[]) => as.map(formatAction);

/** Search candidates of the default Alpha-Beta (to tell a filter miss from a search miss). */
export function inAlphaBetaCandidates(state: GameState, action: Action): boolean {
  const n = formatAction(action);
  return pseudoCandidates(state, 'opponent-path').some((c) => formatAction(c.action) === n);
}
