# 2단계 보고서 — Alpha-Beta 강화 (1차: 벽 후보 필터, 비트보드 BFS)

브랜치 `stage1-benchmark` · 1단계 보고서: [stage1-performance-report.md](stage1-performance-report.md)

표기: **[실측]** 이번에 측정한 값, **[확인]** 테스트·코드로 확인한 사실, **[추정]**, **[미검증]**.

<!-- SUMMARY -->

## 1. 변경 내용

### 1.1 벽 후보 필터 `path-defense` (`src/ai/search/candidates.ts`)

1단계 전술 테스트에서 AB는 깊이 5·300 ms·2 s 모두 같은 5 ply 강제 승리(F4/g178/p55)를 놓쳤습니다. 진단 결과 [확인]:

- AB 쪽(P1)은 목표까지 2칸, 상대는 8칸이지만 벽 2개 보유. 이기는 수 `f1h e1v f1v`는 **어느 쪽 경로도 끊지 않는 벽**.
- 그중 `f1h`, `e1v`는 상대가 P1의 최단 경로를 끊는 데 쓸 자리(`e1h`)를 겹침·교차로 **미리 막는 보호 벽**. 기존 필터(`opponent-path`: 상대 최단 경로를 끊는 벽만)는 이런 수를 영원히 보지 못함(합법 벽 75개 중 7개만 탐색).

`path-defense` = `opponent-path` 후보 + **상대에게 벽이 남아 있을 때**, 내 현재 최단 경로를 끊을 수 있는 각 자리에 대해 그 자리를 겹치거나 교차해 무력화하는 벽(그 자리 자체는 제외 — 자기 경로를 끊음).
합법성 검사는 기존 지연 방식 그대로(경로를 끊는 벽만 BFS). 설정 `wallFilter: 'path-defense'`.

### 1.2 행 마스크 비트보드 BFS (`src/engine/rowMasks.ts`)

1단계 프로파일에서 탐색 CPU의 약 70%가 칸 단위 BFS(`canStep → isBlocked → hasHWall` 호출 사슬)였습니다.

- 벽 배치마다 행별 9비트 정수 4종(동·서·남·북으로 이동 가능한 열)을 한 번 계산해 캐시(불변 `Uint8Array` 쌍을 키로 하는 `WeakMap`).
- `distanceToRow`: 프런티어 한 행을 시프트·AND 몇 번으로 확장하는 층 단위 BFS. `hasPathToRow`: 행 안 수평 폐포를 한 번에 채우는 flood fill. `distanceMap`: 다중 소스 층 BFS.
- `shortestPath`: 탐색 후보가 **어떤 최단 경로가 반환되는지**에 좌우되므로, 기존과 같은 큐 순서·이웃 순서(상하좌우)를 유지하고 간선 검사만 마스크 조회로 바꿔 **같은 경로**를 반환.
- 엔진 공개 함수(`distanceToRow`, `hasPathToRow`, `distanceMap`, `shortestPath`)는 커널 스위치로 두 구현 중 하나를 호출(기본 `masked`). 기존 구현은 `*Reference`로 보존.
  탐색마다 `MinimaxSettings.pathKernel`로 고를 수 있어 **같은 프로세스에서 신·구 AB 대국**이 가능(결정은 동기 실행이라 안전).
- 3·4인전(`shortestPathToGoal` 등 열 목표)과 변형 모드의 자체 BFS는 변경하지 않음. 행 목표를 쓰는 다인전 호출은 동치 테스트로 결과 동일 확인.

### 1.3 실험 지원

- `AgentSpec.minimax`(설정 덮어쓰기)·`tag`(라벨) — 배치 실험 전용, 브라우저는 사용하지 않음. 기존 설정 해시 불변.
- 스위트 `stage2`(S1–S5, 결과 `bench/results/stage2/`), 구성 요소 벤치 `bench/stage2.bench.test.ts`, 전술 에이전트 `ab4-pd`·`ab5-pd`·`ab-300ms-pd`·`ab-2s-pd`.

## 2. 정확성 검증 [확인]

| 검사 | 결과 |
|---|---|
| 비트보드 ↔ 기존 BFS: 무작위 대국 150 + 임의 벽 배치 150(도달 불가 영역 100건 이상) × 81 시작 칸 × 목표 행 0·4·8, `distanceMap` 9개 목표 행 | 전부 동일 (`src/engine/__tests__/rowMasks.test.ts`) |
| `shortestPath` 경로 자체 | 전부 동일 |
| 같은 깊이 탐색(10국면 × 두 필터, 깊이 4): 노드 수·컷오프·점수·PV | 커널과 무관하게 완전히 동일 (`src/ai/__tests__/stage2Search.test.ts`) |
| `path-defense` 후보: 25국면에서 모두 합법, `opponent-path` 후보 포함, 중복 없음, 지연 검사로 버린 벽은 실제로 불법 | 통과 |
| 1단계 놓친 5 ply 승리(g178/p55), 깊이 5 | `opponent-path`: 결정 못 함 / `path-defense`: 승리 증명, `f1h·e1v·f1v` 중 하나 선택 |

<!-- RESULTS -->
