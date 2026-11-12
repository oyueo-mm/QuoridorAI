/**
 * Fixed-size transposition table in typed arrays (stage 3-C).
 *
 * Identity: the 52-bit Zobrist key plus its 32-bit check value (engine/zobrist.ts) — the same
 * identity the former Map table used. A slot stores the key's low 32 bits and the check value;
 * since the key's high 20 bits are the check value's high bits, the pair identifies the key
 * completely, so a probe can never return another position's entry.
 *
 * Buckets of two slots: slot 0 keeps the deeper / current-search entry, slot 1 always takes the
 * newcomer. Entries from earlier searches (older generation) are replaced first. Memory is fixed
 * (≈ 21 bytes per slot; 2^19 slots ≈ 11 MB) instead of the Map's unbounded objects (cleared at
 * 1M entries ≈ 100+ MB).
 *
 * The table only stores what the search gives it; whether a stored value may cut a search is
 * the search's rule (minimax.ts reuses values only at the same remaining depth).
 */

export const TT_EXACT = 0;
export const TT_LOWER = 1;
export const TT_UPPER = 2;

const EMPTY = -1;

/** What a probe returns (both table kinds). */
export interface TTView {
  depth: number;
  value: number;
  flag: number;
  /** Encoded best move, or −1. */
  best: number;
}

/** The table interface the search uses. */
export interface SearchTable {
  lookup(key: number, check: number): TTView | null;
  store(key: number, check: number, depth: number, value: number, flag: number, move: number): void;
  readonly entries: number;
  /** Bytes of table storage (estimate for the Map table). */
  readonly bytes: number;
}

const MAP_MAX_ENTRIES = 1_000_000;

/** The original table: a Map of entry objects, cleared when it reaches 1M entries. */
export class MapTable implements SearchTable {
  private readonly m = new Map<number, TTView & { check: number }>();
  lookup(key: number, check: number): TTView | null {
    const e = this.m.get(key);
    return e && e.check === check ? e : null;
  }
  store(key: number, check: number, depth: number, value: number, flag: number, move: number): void {
    if (this.m.size >= MAP_MAX_ENTRIES) this.m.clear();
    this.m.set(key, { check, depth, value, flag, best: move });
  }
  get entries(): number {
    return this.m.size;
  }
  /** Rough V8 estimate: entry object (~56 B) + Map slot (~24 B). */
  get bytes(): number {
    return this.m.size * 80;
  }
}

export class TranspositionTable implements SearchTable {
  readonly size: number;
  private readonly mask: number;
  private readonly lo: Uint32Array;
  private readonly chk: Uint32Array;
  private readonly val: Float64Array;
  private readonly dep: Int8Array;
  private readonly flg: Uint8Array;
  private readonly mov: Int16Array;
  private readonly gen: Uint8Array;
  private generation = 0;
  /** Stored entries that are still in the table (for statistics). */
  private used = 0;
  /** Owner-defined compatibility key (evaluator, filters, root side): mismatch → clear. */
  signature = '';

  constructor(log2Slots = 19) {
    if (log2Slots < 4 || log2Slots > 24) throw new RangeError(`TT size 2^${log2Slots} out of range`);
    this.size = 1 << log2Slots;
    this.mask = this.size - 2; // bucket = even index and its odd neighbour
    this.lo = new Uint32Array(this.size);
    this.chk = new Uint32Array(this.size);
    this.val = new Float64Array(this.size);
    this.dep = new Int8Array(this.size).fill(EMPTY);
    this.flg = new Uint8Array(this.size);
    this.mov = new Int16Array(this.size);
    this.gen = new Uint8Array(this.size);
  }

  /** Bytes held by the table's arrays. */
  get bytes(): number {
    return this.size * (4 + 4 + 8 + 1 + 1 + 2 + 1);
  }

  get entries(): number {
    return this.used;
  }

  /** Starts a new search: earlier entries stay usable but are replaced first. */
  newSearch(): void {
    this.generation = (this.generation + 1) & 0xff;
  }

  clear(): void {
    this.dep.fill(EMPTY);
    this.used = 0;
    this.generation = 0;
  }

  /** Slot index of the entry for (key, check), or −1. */
  probe(key: number, check: number): number {
    const low = key >>> 0;
    const b = low & this.mask;
    if (this.dep[b] !== EMPTY && this.lo[b] === low && this.chk[b] === check) return b;
    if (this.dep[b + 1] !== EMPTY && this.lo[b + 1] === low && this.chk[b + 1] === check) return b + 1;
    return -1;
  }

  private readonly view: TTView = { depth: 0, value: 0, flag: 0, best: -1 };

  /** The entry for (key, check) in a reused view object (read it before the next lookup), or null. */
  lookup(key: number, check: number): TTView | null {
    const i = this.probe(key, check);
    if (i < 0) return null;
    const v = this.view;
    v.depth = this.dep[i];
    v.value = this.val[i];
    v.flag = this.flg[i];
    v.best = this.mov[i];
    return v;
  }

  depthAt(i: number): number {
    return this.dep[i];
  }
  valueAt(i: number): number {
    return this.val[i];
  }
  flagAt(i: number): number {
    return this.flg[i];
  }
  /** Encoded best move, or −1. */
  moveAt(i: number): number {
    return this.mov[i];
  }

  /** Depth must fit an Int8 (iterative deepening stays far below 127). */
  store(key: number, check: number, depth: number, value: number, flag: number, move: number): void {
    const low = key >>> 0;
    const b = low & this.mask;
    let s: number;
    if (this.dep[b] !== EMPTY && this.lo[b] === low && this.chk[b] === check) s = b;
    else if (this.dep[b + 1] !== EMPTY && this.lo[b + 1] === low && this.chk[b + 1] === check) s = b + 1;
    else if (this.dep[b] === EMPTY || this.gen[b] !== this.generation || depth >= this.dep[b]) {
      // Slot 0 is free, stale, or not deeper: the newcomer takes it; a current, still useful
      // occupant moves to slot 1 (which always accepts).
      if (this.dep[b] !== EMPTY && this.gen[b] === this.generation) this.copy(b, b + 1);
      else if (this.dep[b] === EMPTY) this.used++;
      s = b;
    } else {
      if (this.dep[b + 1] === EMPTY) this.used++;
      s = b + 1;
    }
    this.lo[s] = low;
    this.chk[s] = check;
    this.val[s] = value;
    this.dep[s] = depth;
    this.flg[s] = flag;
    this.mov[s] = move;
    this.gen[s] = this.generation;
  }

  private copy(from: number, to: number): void {
    if (this.dep[to] === EMPTY) this.used++;
    this.lo[to] = this.lo[from];
    this.chk[to] = this.chk[from];
    this.val[to] = this.val[from];
    this.dep[to] = this.dep[from];
    this.flg[to] = this.flg[from];
    this.mov[to] = this.mov[from];
    this.gen[to] = this.gen[from];
  }
}
