# QuoridorAI
여러 게임 AI 알고리즘을 비교하고, 각 알고리즘의 의사결정 과정을 실시간으로 시각화하는 웹 기반 쿼리도 AI 실험실

대상 알고리즘: Random, BFS, Minimax, Alpha-Beta, MCTS, AlphaZero 계열.

> 현재 단계: **1단계 — 게임 엔진 + 기본 웹 인터페이스** (AI는 아직 없음, 로컬 2인 대전)

## 실행

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 엔진 단위 테스트 (Vitest)
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기
```

`vite.config.ts`의 `base: './'` 덕분에 `dist/`를 GitHub Pages 프로젝트 경로에 그대로 올릴 수 있습니다.

## 디렉터리 구조

```
src/
  engine/        순수 TS 게임 엔진 (React/DOM 의존 없음 → Web Worker·테스트에서 재사용)
    types.ts       좌표계, 행동, 상태 타입
    board.ts       상수, 좌표/인덱스 변환, 벽에 의한 이동 차단 판정
    pathfinding.ts BFS 최단 경로, 거리, 거리 맵
    walls.ts       벽 겹침·교차·경로 차단 검증
    rules.ts       합법적 말 이동(점프·대각선) / 벽 설치 / 전체 행동 생성
    game.ts        초기 상태, 임의 상태 생성, 행동 적용, 승리 판정
    encoding.ts    신경망용 행동 인덱스(0..208) 인코딩
    notation.ts    기보 표기 (e2, e3h …)
    __tests__/     단위 테스트
  ai/            AI 에이전트 계약(Agent, DecisionTrace)과 알고리즘 목록 — 2단계부터 구현
  session/       게임 설정(선공/후공, 상대)과 게임 진행 상태 훅
  components/
    board/         SVG 보드, 마우스 히트 테스트/좌표 변환
    panels/        설정, 플레이어 카드, AI 분석 패널(자리 확보), 기보
training/        Python/PyTorch 학습 코드 (Colab, 추후)
```

## 엔진 규약 (웹·학습 환경 공통)

- 좌표: `row 0` = 위, `row 8` = 아래, `col 0` = 왼쪽.
- Player 0(P1)이 선공, `(8,4)`에서 시작해 `row 0` 도달 시 승리. Player 1(P2)은 `(0,4)` → `row 8`.
- 벽 앵커 `(row, col)`(0..7)은 칸 `(row,col)`, `(row,col+1)`, `(row+1,col)`, `(row+1,col+1)`이 만나는 교차점.
  - `h`: `row` 아래쪽, 열 `col`~`col+1`을 가로막음
  - `v`: `col` 오른쪽, 행 `row`~`row+1`을 가로막음
- 행동 인덱스(`encoding.ts`, 총 209):
  `[0,81)` 말 이동(목적지 `row*9+col`) · `[81,145)` 가로벽 · `[145,209)` 세로벽(`row*8+col`).
  학습 코드도 이 매핑을 그대로 따라야 합니다.
- 상태는 불변(immutable)입니다. `applyAction`은 새 상태를 반환하며 불법 행동이면 예외를 던집니다.

## UI 조작

- 이동: 차례인 말의 합법 이동 칸에 점이 표시됩니다. 칸 중앙을 클릭하면 이동합니다.
- 벽: 칸 사이 홈에 마우스를 올리면 미리보기가 나타납니다(설치 불가 시 빨간색 + 사유 표시). 클릭하면 설치됩니다.
- 후공을 선택하면 보드가 180° 회전해 사용자의 말이 항상 아래쪽에 놓입니다.
