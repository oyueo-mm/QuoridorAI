/** The four main sections (navigation and Home cards). */
export const SECTIONS = [
  { id: 'play', label: 'Play', hint: '사람 vs AI · 사람 vs 사람', description: '보드 위에서 직접 두어 보세요. 상대 AI와 난이도를 고르고, AI가 왜 그 수를 골랐는지도 볼 수 있습니다.' },
  { id: 'arena', label: 'Arena', hint: 'AI vs AI 관전', description: '두 AI의 대국을 지켜봅니다. 일시 정지, 한 수씩 진행, 리플레이를 지원합니다.' },
  { id: 'compare', label: 'Compare', hint: '같은 포지션 비교', description: '같은 포지션에서 여러 AI가 각각 어떤 수를 고르는지 나란히 비교합니다.' },
  { id: 'experiments', label: 'Experiments', hint: '자동 대국 · 통계', description: '선후공을 바꿔 가며 여러 판을 자동으로 두고 승률과 신뢰구간을 계산합니다.' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];
