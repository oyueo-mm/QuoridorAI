import { BOARD_SIZE, NUM_CELLS, WALL_GRID, cellIndex, wallIndex } from './board';
import type { Coord, WallLayout } from './types';

/**
 * Row-mask bitboards for the 9×9 board: for every row a 9-bit integer per direction telling
 * from which columns a pawn may step east / west / south (row + 1) / north (row − 1).
 * A BFS layer then expands a whole frontier row with a few shifts and ANDs instead of
 * visiting cells one by one (stage-2 profiling: ~70 % of search time was cell-by-cell BFS).
 *
 * Masks are cached per wall layout. States are immutable and share their Uint8Arrays until a
 * wall is added, so the pair (hWalls, vWalls) identifies a layout; the arrays must never be
 * mutated after use (the engine's contract, see types.ts).
 *
 * Every function here returns exactly what its cell-by-cell counterpart in pathfinding.ts
 * returns (tested for equality); shortestPathMasked keeps the same visiting order, so it even
 * reconstructs the same path.
 */

export interface RowMasks {
  readonly east: Int32Array;
  readonly west: Int32Array;
  readonly south: Int32Array;
  readonly north: Int32Array;
}

const FULL_ROW = (1 << BOARD_SIZE) - 1;
const cache = new WeakMap<Uint8Array, WeakMap<Uint8Array, RowMasks>>();

function build(walls: WallLayout): RowMasks {
  const east = new Int32Array(BOARD_SIZE);
  const west = new Int32Array(BOARD_SIZE);
  const south = new Int32Array(BOARD_SIZE);
  const north = new Int32Array(BOARD_SIZE);
  const h = walls.hWalls;
  const v = walls.vWalls;
  for (let r = 0; r < BOARD_SIZE; r++) {
    let e = 0;
    let s = 0;
    for (let c = 0; c < BOARD_SIZE; c++) {
      // East edge (r, c)–(r, c+1): blocked by vertical walls anchored at (r, c) or (r−1, c).
      if (c < WALL_GRID) {
        const blocked = (r < WALL_GRID && v[wallIndex(r, c)] === 1) || (r > 0 && v[wallIndex(r - 1, c)] === 1);
        if (!blocked) e |= 1 << c;
      }
      // South edge (r, c)–(r+1, c): blocked by horizontal walls anchored at (r, c) or (r, c−1).
      if (r < WALL_GRID) {
        const blocked = (c < WALL_GRID && h[wallIndex(r, c)] === 1) || (c > 0 && h[wallIndex(r, c - 1)] === 1);
        if (!blocked) s |= 1 << c;
      }
    }
    east[r] = e;
    west[r] = (e << 1) & FULL_ROW;
    south[r] = s;
  }
  for (let r = 1; r < BOARD_SIZE; r++) north[r] = south[r - 1];
  return { east, west, south, north };
}

export function rowMasks(walls: WallLayout): RowMasks {
  let inner = cache.get(walls.hWalls);
  if (!inner) cache.set(walls.hWalls, (inner = new WeakMap()));
  let m = inner.get(walls.vWalls);
  if (!m) inner.set(walls.vWalls, (m = build(walls)));
  return m;
}

// Scratch buffers (single-threaded engine; no function here re-enters another).
const frontA = new Int32Array(BOARD_SIZE);
const frontB = new Int32Array(BOARD_SIZE);
const seen = new Int32Array(BOARD_SIZE);

/** Steps from `start` to any cell of `targetRow` (pawns ignored), or Infinity. */
export function distanceToRowMasked(walls: WallLayout, start: Coord, targetRow: number): number {
  if (start.row === targetRow) return 0;
  const { east, west, south, north } = rowMasks(walls);
  let f = frontA;
  let g = frontB;
  f.fill(0);
  seen.fill(0);
  f[start.row] = 1 << start.col;
  seen[start.row] = f[start.row];
  for (let d = 1; d <= NUM_CELLS; d++) {
    let any = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const fr = f[r];
      let n = ((fr & east[r]) << 1) | ((fr & west[r]) >> 1);
      if (r > 0) n |= f[r - 1] & south[r - 1];
      if (r < BOARD_SIZE - 1) n |= f[r + 1] & north[r + 1];
      n &= ~seen[r] & FULL_ROW;
      g[r] = n;
      any |= n;
    }
    if (g[targetRow] !== 0) return d;
    if (any === 0) return Infinity;
    for (let r = 0; r < BOARD_SIZE; r++) seen[r] |= g[r];
    const t = f;
    f = g;
    g = t;
  }
  return Infinity;
}

/**
 * Reachability of `targetRow`. Flood fill that spreads a row's frontier across every open
 * east/west edge at once, then up and down — fewer iterations than layer-by-layer BFS.
 */
export function hasPathToRowMasked(walls: WallLayout, start: Coord, targetRow: number): boolean {
  if (start.row === targetRow) return true;
  const { east, west, south, north } = rowMasks(walls);
  seen.fill(0);
  seen[start.row] = 1 << start.col;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
      let cur = seen[r];
      if (r > 0) cur |= seen[r - 1] & south[r - 1];
      if (r < BOARD_SIZE - 1) cur |= seen[r + 1] & north[r + 1];
      if (cur === 0) continue;
      // Horizontal closure within the row.
      for (;;) {
        const next = (cur | ((cur & east[r]) << 1) | ((cur & west[r]) >> 1)) & FULL_ROW;
        if (next === cur) break;
        cur = next;
      }
      if (cur !== seen[r]) {
        seen[r] = cur;
        changed = true;
        if (r === targetRow) return true;
      }
    }
  }
  return seen[targetRow] !== 0;
}

/** Multi-source BFS from `targetRow` (same contract as distanceMap: −1 = unreachable). */
export function distanceMapMasked(walls: WallLayout, targetRow: number): Int16Array {
  const dist = new Int16Array(NUM_CELLS).fill(-1);
  const { east, west, south, north } = rowMasks(walls);
  let f = frontA;
  let g = frontB;
  f.fill(0);
  seen.fill(0);
  f[targetRow] = FULL_ROW;
  seen[targetRow] = FULL_ROW;
  for (let c = 0; c < BOARD_SIZE; c++) dist[cellIndex(targetRow, c)] = 0;
  // Walls block symmetrically, so expanding outward from the goal row is equivalent.
  for (let d = 1; d <= NUM_CELLS; d++) {
    let any = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const fr = f[r];
      let n = ((fr & east[r]) << 1) | ((fr & west[r]) >> 1);
      if (r > 0) n |= f[r - 1] & south[r - 1];
      if (r < BOARD_SIZE - 1) n |= f[r + 1] & north[r + 1];
      n &= ~seen[r] & FULL_ROW;
      g[r] = n;
      any |= n;
      for (let m = n; m !== 0; m &= m - 1) dist[r * BOARD_SIZE + (31 - Math.clz32(m & -m))] = d;
    }
    if (any === 0) break;
    for (let r = 0; r < BOARD_SIZE; r++) seen[r] |= g[r];
    const t = f;
    f = g;
    g = t;
  }
  return dist;
}

const xEast = new Int32Array(BOARD_SIZE);
const xWest = new Int32Array(BOARD_SIZE);
const xSouth = new Int32Array(BOARD_SIZE);
const xNorth = new Int32Array(BOARD_SIZE);

/**
 * Distance to `targetRow` as if one more wall (orientation, row, col) stood on the board —
 * without copying the layout or touching the mask cache (used to measure how much a single
 * wall can lengthen a path). The wall's legality is not checked.
 */
export function distanceWithExtraWall(walls: WallLayout, start: Coord, targetRow: number, o: 'h' | 'v', row: number, col: number): number {
  if (start.row === targetRow) return 0;
  const m = rowMasks(walls);
  xEast.set(m.east);
  xWest.set(m.west);
  xSouth.set(m.south);
  xNorth.set(m.north);
  if (o === 'h') {
    // Cuts the south edges of (row, col) and (row, col + 1).
    const bits = (1 << col) | (1 << (col + 1));
    xSouth[row] &= ~bits;
    xNorth[row + 1] &= ~bits;
  } else {
    // Cuts the east edges of (row, col) and (row + 1, col).
    xEast[row] &= ~(1 << col);
    xEast[row + 1] &= ~(1 << col);
    xWest[row] &= ~(1 << (col + 1));
    xWest[row + 1] &= ~(1 << (col + 1));
  }
  let f = frontA;
  let g = frontB;
  f.fill(0);
  seen.fill(0);
  f[start.row] = 1 << start.col;
  seen[start.row] = f[start.row];
  for (let d = 1; d <= NUM_CELLS; d++) {
    let any = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const fr = f[r];
      let n = ((fr & xEast[r]) << 1) | ((fr & xWest[r]) >> 1);
      if (r > 0) n |= f[r - 1] & xSouth[r - 1];
      if (r < BOARD_SIZE - 1) n |= f[r + 1] & xNorth[r + 1];
      n &= ~seen[r] & FULL_ROW;
      g[r] = n;
      any |= n;
    }
    if (g[targetRow] !== 0) return d;
    if (any === 0) return Infinity;
    for (let r = 0; r < BOARD_SIZE; r++) seen[r] |= g[r];
    const t = f;
    f = g;
    g = t;
  }
  return Infinity;
}

// Layered BFS of the unmodified layout, kept for the extra-wall queries below.
const layerFront = new Int32Array((NUM_CELLS + 1) * BOARD_SIZE);
const layerSeen = new Int32Array((NUM_CELLS + 1) * BOARD_SIZE);
const cellLayer = new Int16Array(NUM_CELLS);
// Private copies of the prepared layout's masks (queries cut edges in place and restore them).
const pEast = new Int32Array(BOARD_SIZE);
const pWest = new Int32Array(BOARD_SIZE);
const pSouth = new Int32Array(BOARD_SIZE);
const pNorth = new Int32Array(BOARD_SIZE);
let prepTarget = 0;
let prepDistance = 0;

/**
 * Prepares many distanceWithExtraWall queries for one (layout, start, target): runs the BFS once
 * and stores every frontier. Returns the plain distance (Infinity when unreachable). Valid until
 * the next call of this function.
 */
export function prepareExtraWallDistances(walls: WallLayout, start: Coord, targetRow: number): number {
  const masks = rowMasks(walls);
  pEast.set(masks.east);
  pWest.set(masks.west);
  pSouth.set(masks.south);
  pNorth.set(masks.north);
  prepTarget = targetRow;
  cellLayer.fill(0x7fff);
  if (start.row === targetRow) return (prepDistance = 0);
  const { east, west, south, north } = masks;
  layerFront.fill(0, 0, BOARD_SIZE);
  layerFront[start.row] = 1 << start.col;
  for (let r = 0; r < BOARD_SIZE; r++) layerSeen[r] = layerFront[r];
  cellLayer[cellIndex(start.row, start.col)] = 0;
  for (let d = 1; d <= NUM_CELLS; d++) {
    const f = (d - 1) * BOARD_SIZE;
    const g = d * BOARD_SIZE;
    let any = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const fr = layerFront[f + r];
      let n = ((fr & east[r]) << 1) | ((fr & west[r]) >> 1);
      if (r > 0) n |= layerFront[f + r - 1] & south[r - 1];
      if (r < BOARD_SIZE - 1) n |= layerFront[f + r + 1] & north[r + 1];
      n &= ~layerSeen[f + r] & FULL_ROW;
      layerFront[g + r] = n;
      layerSeen[g + r] = layerSeen[f + r] | n;
      any |= n;
      for (let m = n; m !== 0; m &= m - 1) cellLayer[r * BOARD_SIZE + (31 - Math.clz32(m & -m))] = d;
    }
    if (layerFront[g + targetRow] !== 0) return (prepDistance = d);
    if (any === 0) return (prepDistance = Infinity);
  }
  return (prepDistance = Infinity);
}

/**
 * distanceWithExtraWall for the (layout, start, target) of the last prepareExtraWallDistances
 * call — same result. BFS layers before the first one touching a cut edge cannot change (no
 * earlier expansion uses that edge), so the search resumes from that stored layer.
 */
export function preparedDistanceWithExtraWall(o: 'h' | 'v', row: number, col: number): number {
  if (prepDistance === 0) return 0;
  // Either orientation cuts two edges among the 2×2 cells anchored at (row, col); the earliest
  // layer of those cells is where the BFS can first diverge.
  const a = cellIndex(row, col);
  const k = Math.min(cellLayer[a], cellLayer[a + 1], cellLayer[a + BOARD_SIZE], cellLayer[a + BOARD_SIZE + 1]);
  // Unreached cells (or reached only in the final layer) are expanded after the target is found.
  if (k >= prepDistance) return prepDistance;
  // Cut the two edges in the prepared copies, run, then restore (no per-query copies).
  const r1 = row + 1;
  const sR = pSouth[row];
  const nR1 = pNorth[r1];
  const eR = pEast[row];
  const eR1 = pEast[r1];
  const wR = pWest[row];
  const wR1 = pWest[r1];
  if (o === 'h') {
    const bits = ~((1 << col) | (1 << (col + 1)));
    pSouth[row] &= bits;
    pNorth[r1] &= bits;
  } else {
    const e = ~(1 << col);
    const w = ~(1 << (col + 1));
    pEast[row] &= e;
    pEast[r1] &= e;
    pWest[row] &= w;
    pWest[r1] &= w;
  }
  let f = frontA;
  let g = frontB;
  const base = k * BOARD_SIZE;
  for (let r = 0; r < BOARD_SIZE; r++) {
    f[r] = layerFront[base + r];
    seen[r] = layerSeen[base + r];
  }
  let result = Infinity;
  for (let d = k + 1; d <= NUM_CELLS; d++) {
    let any = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const fr = f[r];
      let n = ((fr & pEast[r]) << 1) | ((fr & pWest[r]) >> 1);
      if (r > 0) n |= f[r - 1] & pSouth[r - 1];
      if (r < BOARD_SIZE - 1) n |= f[r + 1] & pNorth[r + 1];
      n &= ~seen[r] & FULL_ROW;
      g[r] = n;
      any |= n;
    }
    if (g[prepTarget] !== 0) {
      result = d;
      break;
    }
    if (any === 0) break;
    for (let r = 0; r < BOARD_SIZE; r++) seen[r] |= g[r];
    const t = f;
    f = g;
    g = t;
  }
  pSouth[row] = sR;
  pNorth[r1] = nR1;
  pEast[row] = eR;
  pEast[r1] = eR1;
  pWest[row] = wR;
  pWest[r1] = wR1;
  return result;
}

const UNREACHABLE = -1;
const parent = new Int16Array(NUM_CELLS);
const queue = new Int16Array(NUM_CELLS);

/**
 * Same BFS as shortestPath (queue order, neighbour order up, down, left, right, first
 * discovery wins), with each edge test reduced to one mask lookup, so the returned path is
 * identical — the search's candidate walls depend on which shortest path is returned.
 */
export function shortestPathMasked(walls: WallLayout, start: Coord, targetRow: number): Coord[] | null {
  if (start.row === targetRow) return [start];
  const { east, west, south, north } = rowMasks(walls);
  parent.fill(UNREACHABLE);
  const startIdx = start.row * BOARD_SIZE + start.col;
  parent[startIdx] = startIdx;
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;
  while (head < tail) {
    const idx = queue[head++];
    const row = (idx / BOARD_SIZE) | 0;
    const col = idx - row * BOARD_SIZE;
    const bit = 1 << col;
    // up, down, left, right — the order of DIRECTIONS.
    for (let k = 0; k < 4; k++) {
      let next: number;
      if (k === 0) {
        if (row === 0 || (north[row] & bit) === 0) continue;
        next = idx - BOARD_SIZE;
      } else if (k === 1) {
        if (row === BOARD_SIZE - 1 || (south[row] & bit) === 0) continue;
        next = idx + BOARD_SIZE;
      } else if (k === 2) {
        if ((west[row] & bit) === 0) continue;
        next = idx - 1;
      } else {
        if ((east[row] & bit) === 0) continue;
        next = idx + 1;
      }
      if (parent[next] !== UNREACHABLE) continue;
      parent[next] = idx;
      if (((next / BOARD_SIZE) | 0) === targetRow) {
        const path: Coord[] = [];
        for (let cur = next; cur !== startIdx; cur = parent[cur]) path.push({ row: (cur / BOARD_SIZE) | 0, col: cur % BOARD_SIZE });
        path.push({ row: start.row, col: start.col });
        return path.reverse();
      }
      queue[tail++] = next;
    }
  }
  return null;
}
