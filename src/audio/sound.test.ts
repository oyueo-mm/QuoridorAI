import { describe, expect, it } from 'vitest';
import { createState, legalPawnMoves } from '../engine';
import { MoveSoundTracker } from './moveSounds';
import { DEFAULT_SOUND_SETTINGS, MIN_GAP_MS, SOUND_STORAGE_KEY, SoundEngine, soundForAction } from './sound';
import type { AudioContextLike, StorageLike } from './sound';

/** Minimal stand-in for AudioContext: counts the sources it creates. */
function fakeContext(state = 'running') {
  const counts = { oscillators: 0, noises: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {} });
  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    resume: async () => {
      ctx.state = 'running';
    },
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      counts.oscillators++;
      return { ...node(), type: 'sine', frequency: param(), start() {}, stop() {} };
    },
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      counts.noises++;
      return { ...node(), buffer: null, start() {} };
    },
  };
  return { ctx: ctx as unknown as AudioContextLike, counts, raw: ctx };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

function engineWith(state = 'running', storage = memoryStorage()) {
  const f = fakeContext(state);
  let t = 1000;
  const engine = new SoundEngine(() => f.ctx, storage, () => t);
  return { engine, counts: f.counts, raw: f.raw, storage, advance: (ms: number) => (t += ms) };
}

describe('sound kinds', () => {
  it('every pawn move (step, jump, diagonal) is a move sound; walls are wall sounds', () => {
    const jump = createState({ pawns: [{ row: 5, col: 4 }, { row: 4, col: 4 }], currentPlayer: 0 });
    expect(legalPawnMoves(jump)).toContainEqual({ row: 3, col: 4 });
    const diag = createState({ pawns: [{ row: 5, col: 4 }, { row: 4, col: 4 }], walls: [{ orientation: 'h', row: 3, col: 3 }], currentPlayer: 0 });
    expect(legalPawnMoves(diag)).toContainEqual({ row: 4, col: 3 });
    for (const to of [...legalPawnMoves(jump), ...legalPawnMoves(diag)]) expect(soundForAction({ type: 'move', to })).toBe('move');
    expect(soundForAction({ type: 'wall', orientation: 'v', row: 1, col: 1 })).toBe('wall');
  });
});

describe('SoundEngine', () => {
  it('stays silent until a user gesture unlocks audio', () => {
    const { engine, counts } = engineWith();
    expect(engine.play('move', 'play')).toBe('locked');
    expect(counts.oscillators + counts.noises).toBe(0);
    engine.unlock();
    expect(engine.play('move', 'play')).toBe('played');
    expect(counts.oscillators).toBe(1);
    expect(counts.noises).toBe(1);
  });

  it('a suspended context is resumed on unlock', async () => {
    const { engine, raw } = engineWith('suspended');
    engine.unlock();
    await Promise.resolve();
    expect(raw.state).toBe('running');
    expect(engine.ready).toBe(true);
  });

  it('wall sounds are heavier (more layers) than move sounds', () => {
    const { engine, counts, advance } = engineWith();
    engine.unlock();
    engine.play('wall', 'play');
    expect(counts.oscillators).toBe(2);
    advance(100);
    engine.play('move', 'play');
    expect(counts.oscillators).toBe(3);
  });

  it('mute and volume 0 play nothing; settings are stored', () => {
    const { engine, counts, storage } = engineWith();
    engine.unlock();
    engine.update({ muted: true });
    expect(engine.play('move', 'play')).toBe('muted');
    engine.update({ muted: false, volume: 0 });
    expect(engine.play('wall', 'play')).toBe('muted');
    expect(counts.oscillators).toBe(0);
    engine.update({ volume: 1.7 });
    expect(engine.getSettings().volume).toBe(1); // clamped
    expect(JSON.parse(storage.data[SOUND_STORAGE_KEY])).toEqual({ muted: false, volume: 1, arena: 'limited' });
  });

  it('reads stored settings and falls back on invalid ones', () => {
    const stored = new SoundEngine(() => null, memoryStorage({ [SOUND_STORAGE_KEY]: JSON.stringify({ muted: true, volume: 0.6, arena: 'off' }) }));
    expect(stored.getSettings()).toEqual({ muted: true, volume: 0.6, arena: 'off' });
    const broken = new SoundEngine(() => null, memoryStorage({ [SOUND_STORAGE_KEY]: '{not json' }));
    expect(broken.getSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(DEFAULT_SOUND_SETTINGS.volume).toBeLessThanOrEqual(0.3);
  });

  it('merges sounds closer than the minimum gap and honours a per-call interval', () => {
    const { engine, advance } = engineWith();
    engine.unlock();
    expect(engine.play('move', 'play')).toBe('played');
    advance(MIN_GAP_MS - 1);
    expect(engine.play('move', 'play')).toBe('throttled');
    advance(10);
    expect(engine.play('move', 'arena', 350)).toBe('throttled');
    advance(400);
    expect(engine.play('move', 'arena', 350)).toBe('played');
  });

  it('Arena mode "off" silences only the Arena', () => {
    const { engine, advance } = engineWith();
    engine.unlock();
    engine.update({ arena: 'off' });
    expect(engine.play('wall', 'arena')).toBe('off');
    advance(100);
    expect(engine.play('wall', 'play')).toBe('played');
  });
});

describe('MoveSoundTracker', () => {
  const move = { action: { type: 'move' as const, to: { row: 7, col: 4 } } };
  const wall = { action: { type: 'wall' as const, orientation: 'h' as const, row: 3, col: 3 } };

  it('sounds once per new record entry, never on first sight, re-render or restart', () => {
    const t = new MoveSoundTracker();
    expect(t.observe(1, [])).toBeNull(); // first observation
    expect(t.observe(1, [move])).toBe('move');
    expect(t.observe(1, [move])).toBeNull(); // re-render / StrictMode re-run
    expect(t.observe(1, [move, wall])).toBe('wall');
    expect(t.observe(2, [])).toBeNull(); // restart
    expect(t.observe(2, [move, wall, move])).toBe('move'); // several at once -> one sound
  });

  it('a disabled period (replay browsing) produces no catch-up sound', () => {
    const t = new MoveSoundTracker();
    t.observe('a', [move]);
    expect(t.observe('a', [move, wall], false)).toBeNull();
    expect(t.observe('a', [move, wall], true)).toBeNull();
    expect(t.observe('a', [move, wall, move], true)).toBe('move');
  });
});
