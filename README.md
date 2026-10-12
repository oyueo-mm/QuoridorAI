# QuoridorAI
여러 게임 AI 알고리즘을 비교하고, 각 알고리즘의 의사결정 과정을 실시간으로 시각화하는 웹 기반 쿼리도 AI 실험실

대상 알고리즘: Random, BFS, Minimax, Alpha-Beta, MCTS, AlphaZero 계열.

> 현재 단계: **5단계 — AI Arena · Decision Comparison · Experiments**

## 실행

```bash
npm install
npm run dev        # 개발 서버 → http://localhost:5173/QuoridorAI/
npm test           # 단위 테스트 (Vitest)
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기 → http://localhost:4173/QuoridorAI/
npm run bench:search  # Minimax 탐색 벤치마크 → bench/results/search-benchmark.md (약 1분)
npm run bench:arena       # Stage 5 Arena 실험 (소규모, 약 10–15분) → bench/results/arena/
npm run bench:mcts-steps  # Guided MCTS 단계별 소규모 평가 (BENCH_STEP=A|B|C) → bench/results/mcts-improvement/
npm run bench:mcts    # MCTS 대국 평가 (장시간) → bench/results/mcts-benchmark.{md,jsonl,progress.log}
                      #   BENCH_BUDGET_MIN(전체, 기본 40) · BENCH_GAME_LIMIT_S(대국당, 기본 90) · BENCH_ROWS(행 선택·순서)
```

학습(Stage 6A·6B-1, Python/Colab)은 [training/README.md](training/README.md)를 참고하세요. Colab GPU 검증·Pilot은 `training/notebooks/stage6b1_gpu_verification.ipynb`에서 실행합니다.

```bash
npm run fixtures:engine   # TS 엔진 → training/fixtures/engine_fixtures.json 재생성 (규칙을 바꿨을 때만)
npm run colab:bundle      # training/ 코드를 Colab 업로드용 번들로 묶음 → training/dist/
```

## 배포 (GitHub Pages)

`.github/workflows/deploy.yml`이 `main`에 push될 때 테스트 → 타입 검사 → 빌드 → 자산 경로 확인 →
GitHub Pages 배포를 수행합니다. PR에서는 검증만 실행합니다.

- Vite `base`는 `/QuoridorAI/`이므로 모든 자산이 `https://<user>.github.io/QuoridorAI/` 아래에서 로드됩니다.
- 최초 1회: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.

## 화면 구성

사이트는 **Home**에서 시작합니다(`#/`). 제목·짧은 설명과 Play / Arena / Compare / Experiments 진입 카드가 있습니다.

| 화면 | 구성 |
|---|---|
| **Play** | 보드 중심. 보드 위·아래에 플레이어 줄(이름·남은 벽·거리·차례), 상태 줄(상태 / AI 탐색 진행 / 오류가 같은 자리에 표시), 보드 아래 도구(보드 방향, 최단 경로, 이 포지션 비교). 오른쪽 패널 탭: **분석**(DecisionTrace, 포지션 지표는 접기) · **기보** · **새 게임**(대전 모드·순서·AI 설정) |
| **Arena** | 관전 중심. 보드 + 재생 컨트롤(진행 / 일시 정지 / 한 수 / 중단 / 재시작 / 속도) + 타임라인. 오른쪽 탭: **기보** · **분석**(선택한 수의 DecisionTrace) · **설정**(AI·예산, 시작 포지션·중단 조건은 접기, 연속 대국) · **리플레이**(최근 10판) |
| **Compare** | 같은 GameState를 AI 2–3개에 입력해 추천 수·계산 결과·시간·노드 수를 카드로 나란히 비교. 포지션은 Play/Arena에서 보내거나, 기보의 특정 턴, 랜덤 오프닝에서 선택. 오른쪽에 선택한 카드의 DecisionTrace |
| **Experiments** | Paired Matches 토너먼트. 결과 상단에 핵심 수치 4개(A 승률, 결판/전체, 선공 승률, 평균 길이), 아래에 세부 통계·대국별 결과, JSON/CSV 내보내기, 브라우저 자동 저장 |

URL 해시(`#/arena` 등)로 화면을 바로 열 수 있습니다. 숨겨진 화면도 계속 동작하므로 대국을 관전하다 다른 화면으로 옮겨도 진행이 유지됩니다.

### 보드 방향

Play에서는 **자동 / P1 시점 / P2 시점**을 고를 수 있습니다. 자동은 내 말이 항상 아래쪽에 오도록 돌립니다(후공이면 P2가 아래).
Arena·Compare에는 P1 아래 / P2 아래 전환이 있습니다. 선택은 화면별로 브라우저에 기억됩니다(저장소를 쓸 수 없으면 기억하지 않을 뿐 동작은 같음).

### 효과음

말 이동(한 칸·점프·대각선 모두)은 짧고 가벼운 나무 말 소리, 장벽 설치는 조금 더 묵직한 나무 소리가 납니다.
사람과 AI 모두 같은 규칙이고, 음원 파일 없이 Web Audio API로 합성합니다(용량·라이선스 문제 없음, `src/audio/sound.ts`).

- 상단 스피커 버튼: 효과음 켜기/끄기, 음량(기본 30), Arena 관전 모드(모두 / 제한 / 끄기), 미리 듣기. 설정은 브라우저에 저장됩니다.
- 브라우저 자동 재생 정책: 첫 클릭·키 입력 때 오디오를 준비하며, 그 전에는 조용히 건너뜁니다.
- 소리는 대국 기록에 새 수가 추가될 때만 납니다. 재렌더링, 분석 미리보기, 탭·보드 방향 전환, 재시작, 리플레이·타임라인 이동은 무음입니다.
- Arena '제한'(기본): 빠른 재생(수 간격 300 ms 미만)에서는 초당 약 3번까지만 소리를 냅니다. Experiments 자동 대국은 무음입니다.

### 장벽 색상 (설치한 플레이어)

장벽은 설치한 플레이어의 색으로 표시됩니다: P1 블루그레이, P2 테라코타(기존 P1/P2 토큰). 색만으로 구분하기 어려운 경우를 위해
P2 장벽에는 옅은 사선 무늬가 있고, 플레이어 줄의 장벽 견본이 범례 역할을 하며, 장벽에 마우스를 올리면 'P2가 설치'처럼 표시됩니다.

- 규칙 엔진은 장벽의 위치·방향만 저장하므로, 소유자는 **대국 기록**(각 수와 둔 플레이어)에서 계산합니다(`src/match/wallOwners.ts`).
  Play 기록, Arena 기록(기보로 입력한 오프닝 포함), 리플레이, Compare로 보낸 포지션, Compare의 기보 입력 모두 같은 방식입니다.
- 기록이 없는 장벽은 추측하지 않고 중립(밝은 면 + 회색 테두리)으로 그립니다.
- 분석 미리보기에서 실제 보드에 없는 후보 장벽은 반투명 + 점선 테두리의 '가상 장벽'으로 그려 확정된 장벽과 구분합니다.
- 보드를 뒤집어도 소유자는 엔진 좌표로 관리되므로 색이 유지됩니다.

### 레이아웃 안정성

AI가 수를 둘 때 화면이 흔들리지 않도록:
- 보드 열의 폭은 뷰포트 크기로만 정해지고(`boardColumnStyle`), 보드는 고정 정사각형 상자 안에 그립니다.
- 상태·AI 진행·오류는 높이가 고정된 한 줄을 번갈아 씁니다. 플레이어 줄, 컨트롤, 힌트 줄도 높이가 고정이고 한 줄로 잘립니다.
- 오른쪽 패널은 고정 높이(데스크톱에서는 화면 높이에 맞춤, sticky) + 내부 스크롤이며, 기보 자동 스크롤은 목록 자신의 scrollTop만 바꿉니다.
- 스크롤바가 생겨도 폭이 바뀌지 않도록 `scrollbar-gutter: stable`.

측정(Edge headless, Play 5수·Arena 20초 동안 100 ms마다 보드 위치 기록 + Layout Shift API):

| | 이전 Arena CLS | 이후 Arena CLS | 이전 보드 이동 | 이후 보드 이동 |
|---|---:|---:|---:|---:|
| 데스크톱 1440×900 | 0.81 | 0 | 57 px | 0 px |
| 모바일 390×844 | 3.12 | 0.0002 | 77–94 px | 0 px |

### 디자인 시스템

색은 `src/index.css`의 `@theme` 토큰만 사용합니다(컴포넌트에 팔레트 색을 직접 쓰지 않음).

| 역할 | 토큰 |
|---|---|
| 면 | `paper`(바탕, 웜 베이지) · `card`(패널) · `inset`(입력·우물) |
| 선 | `line-soft` · `line` · `line-strong` |
| 글자 | `ink` · `ink-soft` · `muted` · `faint` |
| 강조 | `accent`(링크·포커스·주 버튼, 채도 낮은 블루그레이) · `p1`(뮤트 블루) · `p2`(테라코타) · `wall`(나무색) |
| 상태 | `warn`(실험 중단·미리보기) · `danger` · `good` · `think`(AI 생각 중) |

카드는 `rounded-2xl` + 얇은 테두리 + 아주 옅은 그림자, 버튼은 primary / secondary / ghost / small 네 종류(`components/ui.tsx`),
탭·세그먼트 컨트롤·접기(`<details>`)를 공통으로 씁니다. 차트 계열 색은 밝은 배경 기준으로 색각 이상 분리를 검증했습니다.

### 비교 방식 (섞지 않음)

- **Equal Time**: 모든 탐색 AI에 같은 수당 시간(깊이·시뮬레이션 무제한). 기계와 부하에 따라 결과가 달라질 수 있음.
- **Fixed Budget**: 알고리즘별 깊이(Minimax/Alpha-Beta)·시뮬레이션 수(MCTS) 고정, 시간 제한 없음. 같은 시드면 재현됨.
- Random·BFS는 탐색하지 않으므로 예산이 적용되지 않습니다. 실험 결과·내보내기 파일에는 항상 방식이 기록되고, 두 방식의 결과는 한 요약에 합쳐지지 않습니다.

### 결과 분류

규칙상 승리와 실험 중단을 구분합니다. 중단 사유는 **반복 포지션 / 최대 ply / 시간 제한 / 사용자 중단**으로 따로 기록되며, 무승부나 패배로 세지 않고 승률의 분모(결판난 대국)에서도 제외합니다.

### Decision Comparison 원칙

- 모든 AI에 **같은 GameState 객체**를 순서대로 입력합니다(병렬 실행으로 시간 예산이 왜곡되지 않도록).
- 점수는 알고리즘마다 의미와 척도가 다르므로(Minimax 평가 = 걸음 단위, MCTS Q = −1~+1, BFS = 1수 휴리스틱) 하나의 지표로 합치지 않습니다. 공통으로 보여 주는 것은 엔진이 계산한 '둔 후 최단 거리'뿐입니다.
- 선택 이유는 각 AI의 DecisionTrace(실제 계산 결과)만 사용합니다.

### 브라우저 Arena vs Node 벤치마크

브라우저 실험은 관찰·소규모 확인용입니다(동시 대국 최대 2, 대국당·전체 상한, 끝난 대국마다 localStorage 저장, 탭을 닫거나 절전하면 중단될 수 있음).
재현 가능한 평가는 같은 토너먼트 코어를 Node에서 실행하는 `npm run bench:arena`를 사용합니다.

## 대전 모드

| 모드 | 설명 |
|---|---|
| Human vs Human | 같은 기기에서 두 사람이 번갈아 둡니다. |
| Human vs Random AI | 합법 행동 중 균등 무작위 선택. 시드를 지정하면 같은 진행에서 같은 수를 둡니다. |
| Human vs BFS AI | 모든 합법 행동(말 이동 + 벽)을 BFS 최단 거리로 평가하는 1수 휴리스틱. |
| Human vs Minimax AI | 양측 대응을 고려하는 Minimax / Alpha-Beta 탐색. Web Worker에서 실행되어 UI가 멈추지 않습니다. |
| Human vs Pure MCTS AI | UCT + 긴 휴리스틱 롤아웃의 순수 MCTS(기준선). 시뮬레이션 횟수·시간·롤아웃 전략을 설정할 수 있고 Web Worker에서 실행됩니다. |
| Human vs Guided MCTS AI | 평가 함수 컷오프(4 ply) + PUCT 휴리스틱 사전 확률 + 가치 포화 완화를 쓰는 개선형 MCTS. |

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

### Minimax AI

- **알고리즘**: Negamax 형태의 Minimax, 선택적으로 Alpha-Beta 가지치기 (fail-soft).
- **반복 심화**: 깊이 1부터 최대 깊이까지 탐색. 시간 제한에 걸리면 진행 중이던 깊이를 버리고 마지막으로 완료한 깊이의 최선 수를 둡니다(깊이 1은 항상 완료).
- **종단 평가**: 승리 = `10000 − ply`, 패배 = `−(10000 − ply)` → 빠른 승리·늦은 패배를 선호. 승패가 확정되면 탐색을 조기 종료합니다.
- **평가 함수** (`Evaluator` 인터페이스로 교체 가능, 항상 AI 관점):
  `−w_self·d_self + w_opp·d_opp + w_wall·(남은 벽 차이) ± tempo` · 기본 `1, 1, 1.0, 0.5`.
  벽 가치 0.4 → 1.0 조정으로 BFS AI 상대 전적이 3승 9패 → 11승 1패로 바뀌었습니다(벤치마크 5절).
- **후보 생성**: 기본은 "상대 최단 경로를 끊는 벽 + 모든 말 이동"(상대 거리를 즉시 늘릴 수 있는 벽은 이것뿐), 설정에서 모든 합법 벽으로 바꿀 수 있습니다.
- **최적화**: 정적 평가 기반 이동 정렬(남은 깊이 ≥ 3), 킬러 무브, Zobrist 전치표(같은 남은 깊이에서만 값 재사용 → Minimax와 점수 동일 보장), 벽 합법성 지연 검사, 부모 기준 증분 평가.
- **취소 안전성**: 요청 id + 중단 시 Worker 종료 + 컨트롤러의 상태 일치 검사의 3중 장치로, 재시작·에이전트 변경 후 이전 탐색 결과·진행 상황이 반영되지 않습니다.
- 기본 설정: Alpha-Beta, 최대 깊이 5, 시간 제한 2000 ms, 이동 정렬·TT 사용. 설정 패널에서 조정할 수 있습니다.

### MCTS AI

- **코어** (`src/ai/mcts/core.ts`): 게임에 독립적인 Selection → Expansion(한 번에 자식 1개) → Simulation → Backpropagation.
  노드는 "그 노드로 들어온 수를 둔 플레이어" 관점의 W를 누적하므로 Q = W/N이 곧 그 수의 평균 가치입니다.
- **UCT**: `Q + C·√(ln N부모 / N)`, Q ∈ [−1, 1], 기본 C = 1.4. 선택 규칙은 교체 가능한 객체이고 노드에 `prior`가 있어
  AlphaZero의 PUCT(`Q + c·P·√N부모 / (1 + N)`)와 신경망 가치 평가(`LeafEvaluator`)로 바꿔 끼울 수 있습니다.
- **MCTS-Solver**: 종료 포지션은 정확히 ±1, 상대에게 승리 수가 있는 노드는 '패배', 모든 응수가 지는 노드는 '승리'로 증명·전파합니다.
  루트에서 승리가 증명되면 즉시 탐색을 멈추고 그 수를 둡니다(즉시 승리·즉시 패배 위협 처리).
- **효율**: 후보는 Minimax와 같은 필터(말 이동 + 상대 최단 경로를 끊는 벽), 확장 순서는 승리 수 → 목표에 가까운 이동 → 벽.
  노드 수 상한(기본 200,000)에 도달하면 더 확장하지 않습니다.
- **롤아웃 전략**: 균등 무작위(합법 행동 전체에서 거부 표집 — 첫 수 기준 약 98%가 벽), 이동/벽 균형(이동 확률 설정),
  BFS 휴리스틱(최단 경로로 전진, 상대가 앞서면 상대 경로를 끊는 벽, ε = 0.1 무작위).
- **가치 규칙**: 롤아웃이 실제로 끝나면 ±1. 최대 길이(기본 100 ply)에 도달하면 `tanh((d상대 − d내 ± 0.5)/3)`(|v| < 1, 실제 승패와 구분)
  또는 0(무승부 설정). 종료/절단 횟수는 DecisionTrace에 기록됩니다.
- **재현성**: 결정마다 `(게임 시드, ply)`에서 유도한 시드를 씁니다. 시간 제한 없이 시뮬레이션 횟수만 제한하면 완전히 재현됩니다.
- 최종 선택: 증명된 승리 수 → 그 외에는 최다 방문 수(패배가 증명된 수 제외).

#### Pure MCTS의 약점과 Heuristic-Guided MCTS

진단(`bench/results/mcts-diagnosis.md`) 결과 구현 버그는 없었고, 약점은 구조적이었습니다: 벽을 남발하는 롤아웃의 편향,
잡음에 비해 부족한 시뮬레이션(동일 시간 200 ms에서 수당 수십~수백 회), 일방적인 포지션의 가치 포화.
Guided MCTS는 다음을 단계별로(A → B → C) 적용하고 각각을 같은 포지션·시드·시간 예산과 미사용 검증 포지션에서 측정했습니다
(`bench/results/mcts-improvement/SUMMARY.md`).

- **A. 평가 함수 컷오프**: 롤아웃 4 ply 후 Minimax 평가(거리 + 남은 벽 + 템포)로 값을 매김. 0/2/4 ply 중 실제 대국 결과가 가장 좋았던 4 ply 채택.
- **B. PUCT + 휴리스틱 사전 확률**: 각 후보의 1수 평가를 softmax로 사전 확률화, 지연 확장. 방문 집중(엔트로피 4.1 → 1.6비트), 트리 깊이 3 → 11.
- **C. 가치 포화 완화**: 추정값을 `0.9·x/(|x|+4)`로 사상(|v| < 0.9), 롤아웃 안의 승리는 ±(0.9~1), 트리 종료·증명 노드는 ±1 — 실제 승리가 항상 추정보다 큼.
- 결과(200 ms, 소규모): 고정 포지션의 Alpha-Beta 손실 0.89 → 0.22(검증 세트), Alpha-Beta 상대 6판 0승 → 4승 2패. 표본이 작아 대국 결과는 경향으로만 해석해야 합니다.

### 분석 패널

AI가 실제로 계산해 `DecisionTrace`에 기록한 값만 표시합니다.

- **Random**: 후보 행동 수(이동/벽), 개별 선택 확률, 난수 r과 선택 인덱스, 시드, 결정 순번.
- **BFS**: 선택 행동과 근거 문장, 평가 전/후 내·상대 경로 길이, 실제 가중치가 들어간 점수식, 상위 10개 후보 비교표.
- **MCTS**: 시뮬레이션 수·시간·트리 노드·최대 깊이·롤아웃 종료/절단 통계, 후보별 방문 N·평균 가치 Q·UCT·증명 결과·최다 응수,
  탐색 분포 막대, 스냅샷 기반 탐색 재생(슬라이더/재생 버튼 + 상위 4개 후보의 방문 비율 변화 그래프), 최다 방문 경로.
  스냅샷은 상위 8개 후보만 저장하고 64개를 넘으면 간격을 두 배로 늘려 메모리를 제한합니다.
- **Minimax**: 도달 깊이, 방문 노드, β 컷 횟수, TT 적중, 소요 시간, 반복 심화 깊이별 결과, 후보별 점수(Alpha-Beta가 상한만 증명한 후보는 `≤`와 반박 수로 표시),
  예상 상대 응수, Principal Variation(단계별 보드 미리보기, PV 끝 정적 평가가 탐색 점수와 일치하는지 표시), 탐색 트리(루트 → 내 후보 → 상대 응수, 주 변화 강조·나머지 요약).
- 후보 행·선택 카드에 마우스를 올리면 해당 행동을 둔 뒤의 보드와 AI가 계산한 두 경로가 표시되고, 클릭하면 고정됩니다.
- ◀ ▶로 이전 AI 결정을 다시 볼 수 있습니다.

### 실험용 대국 중단 규칙

- UI 대국: `maxPlies`(기본 400 ply)에 도달하면 실험 중단.
- 헤드리스 `runMatch()`: `maxPlies` 외에 대국 전체 시간 제한(`maxGameMs`, 수와 수 사이에 검사)과
  같은 포지션 반복 감지(`repetitionLimit`, 폰·벽·남은 벽·차례가 모두 같은 포지션이 N회 나오면 중단 — 공식 규칙 아님)를 지원합니다.
- 모든 중단은 `{ kind: 'halted', reason: 'max-plies' | 'time-limit' | 'repetition' }`로 기록되고 승패로 세지 않습니다.
- MCTS 벤치마크는 대국이 끝날 때마다 JSONL에 즉시 저장하고 진행 로그를 남기며, 전체 예산을 넘기면 남은 대국을 건너뛰고 요약에 기록합니다.

### 실험용 최대 턴 (UI)

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
    tensor.ts      신경망 입력 텐서(qz-features-v1)·관점(canonical) 변환 — Python features.py와 동일
    notation.ts    기보 표기 (e2, e3h …)
  arena/         에이전트 명세·예산 매핑, MatchSession(관전), 토너먼트 실행기, 통계, 내보내기
  compare/       같은 포지션 의사결정 비교
  views/         Home / Play / Arena / Compare / Experiments 화면
  ai/            Agent 계약·DecisionTrace 타입, Random/BFS/Minimax 에이전트, 시드 RNG, 레지스트리
    search/        Minimax/Alpha-Beta 탐색, 평가 함수, 후보 생성
    mcts/          MCTS 코어(게임 독립), Quoridor 어댑터, 롤아웃 전략
    worker/        Web Worker 진입점·프로토콜·WorkerAgent
  match/         MatchStatus(승리/실험 중단 구분), 헤드리스 대국 러너 runMatch
  session/       GameController(턴 관리·AI 자동 진행·취소), React 훅, 게임 설정
  components/
    ui.tsx         공통 UI(카드, 버튼, 탭, 세그먼트, 접기, 보드 방향 훅)
    board/         SVG 보드, 히트 테스트, 분석 오버레이, 보드 열 폭
    analysis/      Random/BFS/Minimax/MCTS DecisionTrace 시각화, 탐색 트리, 방문 비율 그래프
    panels/        설정, 플레이어 줄, 분석 패널, 기보, AI 진행 표시
bench/           탐색 벤치마크·대국 평가 (npm run bench:*) 및 결과
scripts/         교차 언어 Fixture 생성(engineFixtures.ts), Colab 번들(make-colab-bundle.mjs)
training/        AlphaZero 학습 인프라: Python 엔진 포팅·Neural MCTS·Self-Play·학습·체크포인트, Colab 노트북
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
  학습 코드도 이 매핑을 그대로 따라야 합니다. Python 포팅(`training/quoridor_az/engine.py`)은 TS가 생성한
  Fixture(`training/fixtures/engine_fixtures.json`)로 합법 행동 순서·벽 판정·거리·전이·입력 텐서까지 대조합니다.
- 상태는 불변(immutable)입니다. `applyAction`은 새 상태를 반환하며 불법 행동이면 예외를 던집니다.

## UI 조작

- 이동: 차례인 말의 합법 이동 칸에 점이 표시됩니다. 칸 중앙을 클릭하면 이동합니다.
- 벽: 칸 사이 홈에 마우스를 올리면 미리보기가 나타납니다(설치 불가 시 빨간색 + 사유 표시). 클릭하면 설치됩니다.
- 보드 방향이 "자동"이면 후공을 선택했을 때 보드가 180° 회전해 사용자의 말이 아래쪽에 놓입니다. "P1 시점" / "P2 시점"으로 고정할 수도 있습니다.
