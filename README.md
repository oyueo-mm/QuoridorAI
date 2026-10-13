<div align="center">

# QuoridorAI

### Play, Observe, Compare.

**쿼리도 AI와 직접 대국하고, 각 알고리즘의 선택 과정을 관찰하고 비교하는 웹 기반 AI 실험실**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Play_Now-64748b?style=for-the-badge&logo=githubpages&logoColor=white)](https://oyueo-mm.github.io/QuoridorAI/)
[![GitHub Actions](https://github.com/oyueo-mm/QuoridorAI/actions/workflows/deploy.yml/badge.svg)](https://github.com/oyueo-mm/QuoridorAI/actions/workflows/deploy.yml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=222)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-Training-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)

[**웹에서 플레이하기 ↗**](https://oyueo-mm.github.io/QuoridorAI/) · [**소스 코드**](https://github.com/oyueo-mm/QuoridorAI) · [**학습 환경 문서**](training/README.md)

</div>

---

## 소개

**QuoridorAI**는 추상 전략 보드게임 *Quoridor(쿼리도)*를 통해 게임 AI의 의사결정 방식을 탐구하는 프로젝트입니다.

단순히 AI와 대국하는 데 그치지 않고, **왜 그 행동을 선택했는지**를 실제 탐색 데이터로 확인하고 서로 다른 알고리즘을 같은 조건에서 비교할 수 있도록 만들었습니다.

- **Play** — 사람과 AI의 대국, 선공·후공 선택, 보드 방향 전환, 행동 분석
- **Arena** — AI vs AI 대국 관전, 한 수씩 진행, 기보와 리플레이
- **Compare** — 같은 포지션에서 2~3개 AI의 추천 수와 판단 과정 비교
- **Experiments** — 선후공을 교환하는 자동 대국, 통계와 결과 내보내기

> **현재 상태:** 웹에서 Random, BFS, Minimax/Alpha-Beta, Pure MCTS, Heuristic-Guided MCTS를 사용할 수 있습니다. AlphaZero 스타일의 **Python/PyTorch 학습 인프라**도 구현했지만, **Colab GPU 실측 검증과 본격적인 Self-Play 학습은 아직 진행 전**입니다. 학습된 AlphaZero 모델은 현재 웹사이트에 포함되어 있지 않습니다.

## 주요 기능

| 모드 | 할 수 있는 일 |
| --- | --- |
| **Play** | AI 종류와 설정, 선공·후공을 선택하고 직접 플레이합니다. 행동 후보와 계산 근거를 살펴볼 수 있습니다. |
| **Arena** | 두 AI의 대국을 관전하고, 일시 정지·한 수 진행·속도 조절·기보·리플레이를 이용합니다. |
| **Compare** | 동일한 게임 상태를 여러 AI에 입력해 추천 행동, 탐색 시간 및 의사결정 기록을 나란히 비교합니다. |
| **Experiments** | 여러 대국을 자동 실행하고 승패·실험 중단·의사결정 시간·벽 사용량 등을 분석합니다. JSON/CSV 내보내기를 지원합니다. |

보드의 장벽은 **설치한 플레이어의 색**(P1 블루그레이, P2 테라코타 + 사선 무늬)으로 표시되고, 말 이동·장벽 설치와 Play의 승리·패배(내 순서 기준) 때 Web Audio로 합성한 **효과음**이 납니다. 효과음은 상단 스피커 버튼에서 끄거나 음량을 조절할 수 있습니다.

### AI는 왜 그 수를 선택했을까?

AI는 행동뿐 아니라 실제 계산 결과를 **`DecisionTrace`**로 반환합니다. 웹의 분석 패널은 알고리즘에 맞는 자료를 보여줍니다.

| 알고리즘 | 시각화하는 판단 근거 |
| --- | --- |
| **Random** | 합법 행동 수, 난수, 선택된 행동 |
| **BFS** | 양측 최단 경로, 행동 전후 거리 변화, 후보별 휴리스틱 점수 |
| **Minimax / Alpha-Beta** | 탐색 깊이, 평가 점수, 예상 상대 응수, Principal Variation, 가지치기·전치표 통계 |
| **Pure MCTS** | 시뮬레이션 수, 방문 횟수 `N`, 평균 가치 `Q`, UCT, 탐색 분포 및 재생 |
| **Guided MCTS** | 휴리스틱 Prior, PUCT, 방문 분포, 컷오프 평가와 탐색 과정 |

이 기록은 **실제로 계산된 정보**입니다. 특히 신경망의 내부 판단을 완전하게 설명한다고 주장하거나, 없는 추론 과정을 생성하지 않습니다.

## AI 알고리즘

| AI | 핵심 아이디어 | 비고 |
| --- | --- | --- |
| **Random** | 모든 합법 행동 중 무작위 선택 | 기본 기준선 |
| **BFS** | 최단 경로와 벽 사용 비용으로 한 수 앞 평가 | 휴리스틱 기준선 |
| **Minimax** | 나와 상대의 연속적인 대응 탐색 | 깊이 설정 |
| **Alpha-Beta** | Minimax에 가지치기·이동 정렬·전치표 적용 | 탐색 효율 개선 |
| **Pure MCTS** | UCT와 Rollout 기반 몬테카를로 트리 탐색 | 비교 기준선 |
| **Guided MCTS** | 짧은 Rollout, 휴리스틱 평가, Prior + PUCT | 개선형 탐색 |

Minimax와 Alpha-Beta는 서로 완전히 별개의 학습 모델이 아니라, **같은 적대적 탐색 계열의 탐색 방식**입니다. 웹에서는 각각 선택·비교할 수 있습니다.

## 실험과 관찰

동일 시간 예산(**Equal Time**)과 탐색량 고정(**Fixed Budget**)은 서로 다른 비교 조건입니다. 둘을 혼합하지 않고 기록합니다.

| 비교 조건 | 소규모 대국 결과 | 해석 시 주의점 |
| --- | --- | --- |
| Pure MCTS vs Guided MCTS · 동일 시간 300ms | **Guided 7승 1패** | Rollout/탐색 개선의 유망한 신호 |
| BFS vs Alpha-Beta 깊이 3 · 고정 예산 | **Alpha-Beta 7승 1패** | 깊이 탐색의 효과 관찰 |
| Alpha-Beta vs Guided MCTS · 동일 시간 300ms | **Alpha-Beta 7승 1패** | 동일 시간 기준의 관찰 결과 |
| Alpha-Beta 깊이 4 vs Guided MCTS 3,000회 · 고정 탐색량 | **Guided 6승 2패** | Guided가 수당 약 **38배 더 많은 시간** 사용 |

**주의:** 각 조건은 처음 사용한 오프닝 4쌍, 총 **8판**만 평가한 탐색 실험입니다. 결과를 일반적인 알고리즘 우열이나 확정 승률로 해석해서는 안 됩니다. 실험 중단은 실제 승패와 분리해서 집계합니다.

벤치마크 원자료와 진단 보고서는 [`bench/results/`](bench/results/)에서 확인할 수 있습니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| **Frontend** | React 19, TypeScript 7, Vite 8, Tailwind CSS 4 |
| **게임 엔진 · 고전 AI** | TypeScript, BFS, Negamax/Alpha-Beta, MCTS, Web Worker |
| **Training** | Python, PyTorch, NumPy, Neural MCTS, Self-Play |
| **학습 실행 환경** | VS Code + Google Colab 원격 GPU 커널 (검증 준비 완료) |
| **테스트 · CI/CD** | Vitest, pytest, GitHub Actions |
| **배포** | GitHub Pages |

## 로컬에서 실행하기

**Node.js와 npm**이 필요합니다.

```bash
npm ci
npm run dev
```

개발 서버: `http://localhost:5173/QuoridorAI/`

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

벤치마크는 목적에 따라 선택할 수 있습니다.

```bash
npm run bench:search
npm run bench:arena
npm run bench:mcts-steps
```

> `bench:mcts`는 계산 시간이 길어질 수 있습니다. 자동 대국은 CPU 성능, 절전 상태, 탐색 예산에 영향을 받습니다.

## AlphaZero 학습 인프라 (진행 중)

웹에서 플레이하는 기존 탐색 AI와 별도로, AlphaZero 스타일의 신경망 학습 파이프라인을 개발하고 있습니다.

- TypeScript 게임 엔진과 같은 **209개 행동 인덱스** 및 `11 × 9 × 9` 입력 텐서를 사용하는 Python 게임 환경
- Policy(209차원) + Value(1차원)를 출력하는 작은 ResNet
- PUCT 기반 Neural MCTS, 배치 추론, Self-Play 및 Replay Buffer
- 체크포인트 저장·손상 검증·재개, 학습 평가 및 ONNX 내보내기
- **VS Code에서 Colab GPU 원격 커널**을 선택해 실행하는 Jupyter Notebook

현재 로컬 CPU에서 학습 파이프라인과 교차 언어 검증을 마쳤습니다. **Colab GPU 스모크 테스트와 본격적인 모델 학습은 미완료** 상태입니다.

학습 환경 준비 및 검증:

```bash
npm run colab:bundle
```

- [학습 아키텍처 및 실행 가이드](training/README.md)
- [GPU 검증 노트북](training/notebooks/stage6b1_gpu_verification.ipynb)
- [교차 언어 엔진 Fixture](training/fixtures/engine_fixtures.json)

## 프로젝트 구조

```text
src/             웹 게임 엔진, AI, Arena/Compare, UI 및 DecisionTrace
  engine/        규칙 · 경로 탐색 · 209개 행동 인코딩 · 상태 텐서
  ai/            Random · BFS · Minimax/Alpha-Beta · MCTS · Web Worker
  arena/         관전 및 자동 대국 · 결과 통계
  compare/       동일 포지션 AI 비교
  components/    보드 및 AI 판단 시각화
  views/         Home · Play · Arena · Compare · Experiments
training/        Python 엔진 · Neural MCTS · Self-Play · 학습/검증 노트북
bench/           탐색 벤치마크 · 대국 실험 · 결과
scripts/         테스트 Fixture · Colab 번들 생성
.github/workflows/ GitHub Pages 자동 배포
```

게임 규칙과 학습 인코딩에 대한 상세 내용은 기존 엔진 구현(`src/engine/`)과 [학습 문서](training/README.md)를 참고하세요.

## 앞으로의 계획

- [x] 웹 게임 엔진 및 AI 대국 UI
- [x] Random / BFS / Minimax / Alpha-Beta / MCTS
- [x] AI 판단 과정 시각화 및 탐색 재생
- [x] AI Arena · Decision Comparison · Experiments
- [x] AlphaZero 스타일 학습 파이프라인 및 CPU 검증
- [ ] Colab GPU에서 실제 처리량·학습 안정성 검증
- [ ] 본격적인 Self-Play 학습 및 체크포인트 평가
- [ ] 학습된 모델을 ONNX Runtime Web으로 연결해 Arena에서 비교

---

<div align="center">

**Play against AI. Understand its decisions. Compare its strategies.**

[웹에서 QuoridorAI 실행하기](https://oyueo-mm.github.io/QuoridorAI/)

</div>
