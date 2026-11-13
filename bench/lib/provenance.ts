import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { arch, cpus, platform, release, totalmem } from 'node:os';

/**
 * Everything needed to tell two benchmark runs apart: code version (and whether the
 * working tree differed from it), runtime and machine. No user or host names are recorded.
 */
export interface Provenance {
  timestamp: string;
  git: {
    commit: string | null;
    branch: string | null;
    /** Uncommitted changes anywhere in the tree. */
    dirty: boolean;
    /** Uncommitted changes under src/ (the code that is actually benchmarked). */
    srcDirty: boolean;
    srcDirtyFiles: string[];
  };
  node: string;
  v8: string;
  platform: string;
  osRelease: string;
  arch: string;
  cpu: string;
  logicalCores: number;
  totalMemGB: number;
  /** Windows power source at session start: battery throttles the CPU and distorts timed runs. */
  power?: 'ac' | 'battery' | 'unknown';
}

const git = (args: string): string | null => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

/** Windows power source now ('unknown' elsewhere or on error). */
export function powerSource(): Provenance['power'] {
  if (platform() !== 'win32') return 'unknown';
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Battery).BatteryStatus"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();
    if (out === '') return 'ac'; // no battery
    return out.split(/\s+/)[0] === '1' ? 'battery' : 'ac'; // 1 = discharging
  } catch {
    return 'unknown';
  }
}

export function collectProvenance(): Provenance {
  const status = git('status --porcelain') ?? '';
  const lines = status.split('\n').filter((l) => l.trim().length > 0);
  const srcDirtyFiles = lines.map((l) => l.slice(3)).filter((f) => f.startsWith('src/'));
  return {
    timestamp: new Date().toISOString(),
    git: {
      commit: git('rev-parse HEAD'),
      branch: git('rev-parse --abbrev-ref HEAD'),
      dirty: lines.length > 0,
      srcDirty: srcDirtyFiles.length > 0,
      srcDirtyFiles,
    },
    node: process.version,
    v8: process.versions.v8,
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpu: cpus()[0]?.model?.trim() ?? 'unknown',
    logicalCores: cpus().length,
    totalMemGB: Math.round((totalmem() / 2 ** 30) * 10) / 10,
    power: powerSource(),
  };
}

/** JSON with object keys sorted, so equal values always hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function hashOf(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}
