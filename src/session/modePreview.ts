import { OFFICIAL_WALLS, TWO_PLAYER_RULES } from '../engine';
import type { MultiRules, MultiState } from '../engine';
import { initialMultiState } from '../match/multiRecord';
import type { MultiGameSetup } from '../match/multiRecord';
import { isMultiMode } from './config';
import type { GameMode } from './config';
import { buildMultiSetup, validateMultiConfig } from './MultiController';
import type { MultiConfig } from './MultiController';
import { seatText } from './seatInfo';

/**
 * The initial position of a mode as the mode browser shows it. It is built from the same rules
 * data and the same functions a real start uses (buildMultiSetup → initialMultiState), so the
 * preview and the game that follows cannot differ; building it touches no game state.
 */
export interface ModePreview {
  mode: GameMode;
  setup: MultiGameSetup;
  state: MultiState;
}

export type PreviewResult = { ok: true; preview: ModePreview } | { ok: false; errors: string[] };

/** Only these settings change what the board looks like; names, AI options and the first player do not. */
export function layoutKey(mode: GameMode, multi: MultiConfig): string {
  if (!isMultiMode(mode)) return 'two-player';
  return JSON.stringify([mode, multi.walls ?? null, mode === 'obstacle' ? multi.obstacle : null, mode === 'asymmetric' ? multi.asymmetric : null]);
}

/** The settings that generate the obstacle map (changing anything else must not regenerate it). */
export const obstacleKey = (multi: MultiConfig): string => JSON.stringify(multi.obstacle ?? null);

/** True while the preview needs a generated obstacle map (slow in the hardest presets). */
export const needsObstacleMap = (mode: GameMode, multi: MultiConfig): boolean => mode === 'obstacle' && validateMultiConfig({ ...multi, mode }).length === 0;

/**
 * Preview of `mode` with the draft settings. Invalid settings give their errors instead of a
 * position. For the obstacle race pass the generated map (`obstacleMap`), else it is generated here.
 */
export function computePreview(mode: GameMode, multi: MultiConfig, obstacleMap?: MultiRules): PreviewResult {
  if (!isMultiMode(mode)) {
    const setup: MultiGameSetup = { rules: TWO_PLAYER_RULES, wallsPerPlayer: [OFFICIAL_WALLS[2], OFFICIAL_WALLS[2]], firstPlayer: 0 };
    return { ok: true, preview: { mode, setup, state: initialMultiState(setup) } };
  }
  const config: MultiConfig = { ...multi, mode, firstPlayer: 0 };
  const errors = validateMultiConfig(config);
  if (errors.length > 0) return { ok: false, errors };
  try {
    const setup = buildMultiSetup(config, () => 0, obstacleMap);
    return { ok: true, preview: { mode, setup, state: initialMultiState(setup) } };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : '미리보기를 만들 수 없습니다.'] };
  }
}

// ---------------------------------------------------------------- short rule summary

export interface BriefLine {
  label: string;
  text: string;
}

const WIN: Record<GameMode, string> = {
  'vs-ai': '내 목표선에 먼저 닿는 쪽이 승리',
  'local-2p': '내 목표선에 먼저 닿는 쪽이 승리',
  'four-player': '자기 반대편 줄에 먼저 닿는 사람이 승리',
  'race-2': '위쪽 줄에 먼저 닿는 사람이 승리',
  'race-4': '위쪽 줄에 먼저 닿는 사람이 승리',
  'three-player': '각자 반대편 줄에 먼저 닿는 사람이 승리',
  'team-2v2': '팀원 누구든 자기 목표선에 닿으면 팀 승리',
  asymmetric: '자기 목표선에 먼저 닿는 사람이 승리',
  obstacle: '목표선에 먼저 닿는 사람이 승리',
};

const SPECIAL: Record<GameMode, string> = {
  'vs-ai': 'AI와 그 판단 분석을 함께 볼 수 있음',
  'local-2p': '한 기기에서 번갈아 둠',
  'four-player': '시계 방향 차례, 한 기기에서 진행',
  'race-2': '같은 목표선 — 벽과 점프로 서로 방해',
  'race-4': '바깥쪽·가운데 말은 주변 공간이 달라 조건이 완전히 같지는 않음',
  'three-player': '오른쪽 변이 비어 있어 위치별 유불리가 있음',
  'team-2v2': 'A → B → A → B 교대, 벽은 개인별',
  asymmetric: '시작 위치·목표선·벽·차례를 직접 설정',
  obstacle: '처음부터 놓인 중립 벽(어두운 돌)을 우회',
};

/** Key facts of the previewed position, derived from its rules (start, goal, walls) plus a line per mode. */
export function previewBrief(p: ModePreview): BriefLine[] {
  const { rules, wallsPerPlayer } = p.setup;
  const walls = wallsPerPlayer.every((w) => w === wallsPerPlayer[0]) ? `플레이어당 ${wallsPerPlayer[0]}개` : wallsPerPlayer.map((w, i) => `P${i + 1} ${w}`).join(' · ');
  const lines: BriefLine[] = [
    { label: '시작·목표', text: rules.players.map((spec, i) => `P${i + 1} ${seatText(spec)}`).join('\n') },
    { label: '벽', text: walls },
    { label: '승리', text: WIN[p.mode] },
    { label: '특수', text: SPECIAL[p.mode] },
  ];
  if (rules.neutralWalls?.length) lines.splice(2, 0, { label: '중립 벽', text: `${rules.neutralWalls.length}개 (시드 ${rules.seed})` });
  return lines;
}
