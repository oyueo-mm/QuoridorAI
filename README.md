# QuoridorAI
여러 게임 AI 알고리즘을 비교하고, 각 알고리즘의 의사결정 과정을 실시간으로 시각화하는 웹 기반 쿼리도 AI 실험실

대상 알고리즘: Random, BFS, Minimax, Alpha-Beta, MCTS, AlphaZero 계열.

> 현재 단계: **2단계 — Random AI · BFS 휴리스틱 AI · 분석 패널**

## 실행

```bash
npm install
npm run dev        # 개발 서버 → http://localhost:5173/QuoridorAI/
npm test           # 단위 테스트 (Vitest)
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기 → http://localhost:4173/QuoridorAI/
```

## 배포 (GitHub Pages)

`.github/workflows/deploy.yml`이 `main`에 push될 때 테스트 → 타입 검사 → 빌드 → 자산 경로 확인 →
GitHub Pages 배포를 수행합니다. PR에서는 검증만 실행합니다.

- Vite `base`는 `/QuoridorAI/`이므로 모든 자산이 `https://<user>.github.io/QuoridorAI/` 아래에서 로드됩니다.
- 최초 1회: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.

## 대전 모드

| 모드 | 설명 |
|---|---|
| Human vs Human | 같은 기기에서 두 사람이 번갈아 둡니다. |
| Human vs Random AI | 합법 행동 중 균등 무작위 선택. 시드를 지정하면 같은 진행에서 같은 수를 둡니다. |
| Human vs BFS AI | 모든 합법 행동(말 이동 + 벽)을 BFS 최단 거리로 평가하는 1수 휴리스틱. |

선공/후공을 선택할 수 있고, 후공이면 AI가 첫 수를 둡니다. AI 차례에는 보드 조작이 막힙니다.

### BFS AI 평가식

```
점수 = − w_self · d_self(후) + w_opp · d_opp(후) − 벽비용 − w_threat · [상대가 다음 수에 즉시 승리 가능]
벽비용 = wallCost + wallScarcity · (사용한 벽 / 10)
즉시 승리 수 = 1000 (최우선), 동점이면 말 이동 우선 → 행동 인덱스 순
```

- `d`는 말을 무시한 BFS 최단 거리, 위협 판정은 엔진의 실제 말 이동(점프 포함)으로 계산합니다.
- 기본 가중치: `selfDistance 1`, `opponentDistance 1`, `wallCost 0.5`, `wallScarcity 0.5`, `opponentWinThreat 100`.
  게임 설정 패널에서 조정할 수 있습니다.

### 분석 패널

AI가 실제로 계산해 `DecisionTrace`에 기록한 값만 표시합니다.

- **Random**: 후보 행동 수(이동/벽), 개별 선택 확률, 난수 r과 선택 인덱스, 시드, 결정 순번.
- **BFS**: 선택 행동과 근거 문장, 평가 전/후 내·상대 경로 길이, 실제 가중치가 들어간 점수식, 상위 10개 후보 비교표.
- 후보 행·선택 카드에 마우스를 올리면 해당 행동을 둔 뒤의 보드와 AI가 계산한 두 경로가 표시되고, 클릭하면 고정됩니다.
- ◀ ▶로 이전 AI 결정을 다시 볼 수 있습니다.

### 실험용 최대 턴

`maxPlies`(기본 400 ply)에 도달하면 **실험 중단(halted)** 으로 끝나며 승자가 없습니다.
엔진 규칙에 따른 **승리(win)** 와는 `MatchStatus`에서 구분됩니다. 헤드리스 AI vs AI 대국은 `runMatch()`를 사용합니다.

## 디렉터리 구조

```
src/
  engine/        순수 TS 게임 엔진 (React/DOM 의존 없음)
    types.ts       좌표계, 행동, 상태 타입
    board.ts       상수, 좌표/인덱스 변환, 벽에 의한 이동 차단 판정
    pathfinding.ts BFS 최단 경로, 거리, 거리 맵
    walls.ts       벽 겹침·교차·경로 차단 검증
    rules.ts       합법적 말 이동(점프·대각선) / 벽 설치 / 전체 행동 생성
    game.ts        초기 상태, 임의 상태 생성, 행동 적용, 승리 판정
    encoding.ts    신경망용 행동 인덱스(0..208) 인코딩
    notation.ts    기보 표기 (e2, e3h …)
  ai/            Agent 계약·DecisionTrace 타입, Random/BFS 에이전트, 시드 RNG, 레지스트리
  match/         MatchStatus(승리/실험 중단 구분), 헤드리스 대국 러너 runMatch
  session/       GameController(턴 관리·AI 자동 진행·취소), React 훅, 게임 설정
  components/
    board/         SVG 보드, 히트 테스트, 분석 오버레이
    analysis/      Random/BFS DecisionTrace 시각화
    panels/        설정, 플레이어 카드, 분석 패널, 기보
training/        Python/PyTorch 학습 코드 (Colab, 추후)
```

새 AI를 추가하려면 `ai/`에 `Agent`를 구현하고, `DecisionTrace` 유니온과 `registry.ts`, `catalog.ts`에
등록한 뒤 `components/analysis/`에 시각화를 추가합니다.

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
