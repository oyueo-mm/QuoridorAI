import type { Action } from '../engine';

/*
 * Game sounds, synthesised with the Web Audio API (no audio files, nothing to license).
 *
 *   move  short, light wooden "tok" (every pawn move — step, jump or diagonal)
 *   wall  heavier wooden "thock" with a low body (a wall being set down)
 *   win   short, bright rising arpeggio (C E G C)
 *   lose  soft falling phrase (A F D)
 *
 * Outcome sounds are scheduled after the end of the previous sound, so the last move and the
 * result never overlap; they are not merged by the minimum gap (they are deduplicated by
 * OutcomeSoundTracker instead).
 *
 * Autoplay policy: the AudioContext is created on the first user gesture (installAudioUnlock).
 * Until then, or while the browser keeps it suspended, play() does nothing and says so in its
 * result — no errors, no queued sounds. Settings (mute, volume, Arena mode) are stored in
 * localStorage when available.
 *
 * Duplicates: sounds are triggered by new entries in a game record (see moveSounds.ts), never by
 * rendering. play() additionally enforces a minimum gap between sounds and an optional per-call
 * interval used to thin out fast Arena games.
 */

export type SoundKind = 'move' | 'wall' | 'win' | 'lose';

const OUTCOME: ReadonlySet<SoundKind> = new Set(['win', 'lose']);
export type ArenaSoundMode = 'all' | 'limited' | 'off';
export type SoundSource = 'play' | 'arena' | 'preview';
export type PlayResult = 'played' | 'muted' | 'off' | 'locked' | 'throttled';

export interface SoundSettings {
  muted: boolean;
  /** 0..1 (perceptual: gain = volume²). */
  volume: number;
  arena: ArenaSoundMode;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { muted: false, volume: 0.3, arena: 'limited' };
export const SOUND_STORAGE_KEY = 'quoridor-ai/sound/v1';
/** Two sounds closer than this are merged into one. */
export const MIN_GAP_MS = 40;

export function soundForAction(action: Action): SoundKind {
  return action.type === 'wall' ? 'wall' : 'move';
}

/** The parts of AudioContext this module uses (lets tests pass a fake). */
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBiquadFilter(): BiquadFilterNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readSettings(storage: StorageLike | null): SoundSettings {
  try {
    const raw = storage?.getItem(SOUND_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    const v = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_SOUND_SETTINGS.muted,
      volume: typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_SOUND_SETTINGS.volume,
      arena: v.arena === 'all' || v.arena === 'limited' || v.arena === 'off' ? v.arena : DEFAULT_SOUND_SETTINGS.arena,
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export interface SoundLogEntry {
  kind: SoundKind;
  source: SoundSource;
  result: PlayResult;
  at: number;
  /** Audio-clock start / end of a played sound (seconds). */
  start?: number;
  end?: number;
}

export class SoundEngine {
  private ctx: AudioContextLike | null = null;
  private noise: AudioBuffer | null = null;
  private settings: SoundSettings;
  private listeners = new Set<() => void>();
  private lastPlayedAt = -Infinity;
  /** Audio-clock time at which the last scheduled sound ends. */
  private busyUntil = 0;
  private lastSpan: { start: number; end: number } | null = null;
  /** Recent play() calls with their outcome (diagnostics and tests). */
  readonly log: SoundLogEntry[] = [];

  constructor(
    private readonly createContext: () => AudioContextLike | null,
    private readonly storage: StorageLike | null,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.settings = readSettings(storage);
  }

  // ------------------------------------------------------------ settings (useSyncExternalStore)
  getSettings = (): SoundSettings => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(patch: Partial<SoundSettings>): void {
    const next = { ...this.settings, ...patch };
    next.volume = Math.min(1, Math.max(0, next.volume));
    this.settings = next;
    try {
      this.storage?.setItem(SOUND_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the setting lasts for this page only.
    }
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ audio
  /** Call from a user gesture: creates / resumes the AudioContext. */
  unlock(): void {
    try {
      this.ctx ??= this.createContext();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  play(kind: SoundKind, source: SoundSource, minIntervalMs = 0): PlayResult {
    this.lastSpan = null;
    const result = this.tryPlay(kind, source, minIntervalMs);
    this.log.push({ kind, source, result, at: this.now(), ...(this.lastSpan ?? {}) });
    if (this.log.length > 100) this.log.splice(0, this.log.length - 100);
    return result;
  }

  private tryPlay(kind: SoundKind, source: SoundSource, minIntervalMs: number): PlayResult {
    const s = this.settings;
    if (s.muted || s.volume <= 0) return 'muted';
    if (source === 'arena' && s.arena === 'off') return 'off';
    const t = this.now();
    const outcome = OUTCOME.has(kind);
    if (!outcome && t - this.lastPlayedAt < Math.max(MIN_GAP_MS, minIntervalMs)) return 'throttled';
    if (!this.ready) return 'locked';
    this.lastPlayedAt = t;
    const ctx = this.ctx!;
    // Outcome sounds wait for the previous sound (e.g. the winning move) to finish.
    const start = outcome ? Math.max(ctx.currentTime + 0.005, this.busyUntil + 0.06) : ctx.currentTime + 0.005;
    const gain = s.volume * s.volume;
    try {
      const length = kind === 'wall' ? this.wall(start, gain) : kind === 'win' ? this.win(start, gain) : kind === 'lose' ? this.lose(start, gain) : this.move(start, gain);
      this.busyUntil = Math.max(this.busyUntil, start + length);
      this.lastSpan = { start, end: start + length };
      return 'played';
    } catch {
      return 'locked';
    }
  }

  private noiseBuffer(ctx: AudioContextLike): AudioBuffer {
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * 0.25);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** Decaying envelope on a new gain node connected to `to`. */
  private envelope(ctx: AudioContextLike, at: number, peak: number, decay: number, to: AudioNode): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    g.connect(to);
    return g;
  }

  private noiseBurst(ctx: AudioContextLike, at: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    filter.Q.setValueAtTime(q, at);
    src.connect(filter);
    filter.connect(this.envelope(ctx, at, peak, decay, ctx.destination));
    src.start(at, Math.random() * 0.1, decay + 0.02);
  }

  private tone(ctx: AudioContextLike, at: number, type: OscillatorType, from: number, to: number, peak: number, decay: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + decay * 0.8);
    osc.connect(this.envelope(ctx, at, peak, decay, ctx.destination));
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  /** Light wooden piece set down: bright click + short hollow tok. Returns its length (s). */
  private move(at: number, gain: number): number {
    const ctx = this.ctx!;
    const v = 1 + (Math.random() - 0.5) * 0.08;
    this.noiseBurst(ctx, at, 'bandpass', 2300 * v, 2.2, 0.55 * gain, 0.05);
    this.tone(ctx, at, 'triangle', 860 * v, 640 * v, 0.45 * gain, 0.07);
    return 0.08;
  }

  /** Heavier wooden block: low body, darker knock and a small second contact. */
  private wall(at: number, gain: number): number {
    const ctx = this.ctx!;
    const v = 1 + (Math.random() - 0.5) * 0.06;
    this.tone(ctx, at, 'sine', 175 * v, 115 * v, 0.7 * gain, 0.18);
    this.noiseBurst(ctx, at, 'lowpass', 950 * v, 0.9, 0.6 * gain, 0.09);
    this.tone(ctx, at + 0.035, 'triangle', 330 * v, 260 * v, 0.22 * gain, 0.06);
    return 0.2;
  }

  /** Win: quick rising C major arpeggio (C5 E5 G5 C6), the last note held a little longer. */
  private win(at: number, gain: number): number {
    const ctx = this.ctx!;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      this.tone(ctx, at + i * 0.085, 'triangle', f, f * 0.998, (last ? 0.3 : 0.26) * gain, last ? 0.42 : 0.2);
    });
    return 3 * 0.085 + 0.42;
  }

  /** Loss: soft falling phrase (A4 F4 D4) with sine tones and a gentle tail. */
  private lose(at: number, gain: number): number {
    const ctx = this.ctx!;
    const notes = [440, 349.23, 293.66];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      this.tone(ctx, at + i * 0.16, 'sine', f, f * 0.99, 0.28 * gain, last ? 0.6 : 0.3);
    });
    return 2 * 0.16 + 0.6;
  }
}

function browserContext(): AudioContextLike | null {
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The app-wide engine. */
export const soundEngine = new SoundEngine(browserContext, browserStorage());

/** Creates the AudioContext on the first pointer or key press (autoplay policy). */
export function installAudioUnlock(engine: SoundEngine = soundEngine): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    engine.unlock();
    if (engine.ready) {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // Diagnostics for manual / automated checks (the log holds no personal data).
  (window as unknown as { __qzSound?: SoundEngine }).__qzSound = engine;
}
