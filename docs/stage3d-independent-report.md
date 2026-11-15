# Stage 3-D 독립 확인 보완 — 사전 계획과 결과

2026-11-15 KST. 기존 [최종 감사](stage3d-eval-report.md)의 증거와 보류 판정을 보존한다. 이 문서는 독립성 결함의 수정 및 **한 차례의 대체 확인**만 다룬다. 3-E 기법은 구현하지 않는다.

## 근본 원인

1. P/T/C 모두 `ledger-1ef90bb0.txt`(3-C까지)를 사용했다. 앞서 새로 실행한 P/T 국면은 C의 원장에 추가되지 않았다.
2. `schedule()`의 seen은 개별 일정 내부 상태다. 서로 다른 seed가 서로 다른 실험의 국면 중복을 막지는 못한다.
3. 기존 identity는 exact 또는 좌우 mirror Zobrist key였다. 해시 문자열만으로는 정의·대칭 범위·충돌을 사람이 점검하기 어렵고, 목표선을 보존하는 플레이어 교환 대칭도 독립 검증하지 않았다.
4. 기존 redraw는 시도 상한을 소진하면 마지막 중복 후보를 그대로 받아들일 수 있었다. 기존 일정을 바꿔 과거 결과를 재해석하지 않고, 새 생성기는 소진 시 오류로 중단하며 시작 직전 전체 일정을 다시 검증한다.
5. 실행 전에 누적 원장·일정 checksum·선행 실험 inventory를 검증하는 필수 관문이 없었다.

## 수정과 원장 범위

[`openingIdentity.ts`](../bench/lib/openingIdentity.ts)는 정규 9×9 2인전의 실제 시작 국면을 lossless 문자열로 표현한다. 벽 방향/슬롯, 두 말 좌표, 벽 잔량, 현재 차례, 승자를 포함한다. 새 게임은 이 상태에서 시작하고 반복 이력은 새로 생성되므로 ply/이동 순서는 identity에서 제외한다. 다른 이동 순서로 같은 상태에 도달하면 중복이다.

유효한 변환은 원본, 좌우 반사, **상하 반사+플레이어 교환**, **180도 회전+플레이어 교환**이다. 교환 시 말·벽 잔량·차례·승자를 함께 바꾼다. 90도/대각 반사는 row 목표선을 col 목표선으로 바꾸므로 동일한 정규 2인전의 대칭으로 쓰지 않는다.

[`opening-registry.json`](../bench/results/stage3d-independent/opening-registry.json)은 `bench/results`에서 발견한 **40개 실험**의 전체 생성 일정과 실제 기록, 그리고 `bench/openings`의 모든 기존 원장을 수집했다. 미실행 예약 국면도 제외한다. 정규화된 국면 10,023개와 legacy mirror key 10,023개, 원본 입력 파일 216개의 SHA-256을 고정했다. 계정 밖/디스크에 없는 실험까지 검색했다고 주장하지 않는다. 기존 원장에만 남은 key도 새 생성에서 제외한다.

과거 실험 전체의 실제 사용 국면 교집합은 [`historical-overlaps.json`](../bench/results/stage3d-independent/historical-overlaps.json)에 보존했다. 이전 비교에서 의도적으로 공유한 국면까지 기록하되, 과거 실험을 이번에 일괄 무효화하거나 결과를 고치지는 않는다.

새 실행은 [`opening-plan.json`](../bench/results/stage3d-independent/opening-plan.json)의 600쌍만 사용한다. 추가 후보 선택은 결과를 보지 않는 deterministic rejection뿐이다(856개 draw에서 600개 채택). plan과 registry hash가 config에 연결되고, 모든 샤드는 시작 시 원본 파일 hash·새 선행 config 누락·자체 중복·역사 원장 교집합·선후공 교환을 검증한다. 누락/변조/중복/불완전 일정/상한 소진이면 **대국 전에 실패**한다.

새 연구 batch는 frozen plan을 요구하고, `runMatchup()`도 새 SPRT를 plan 없이 시작하지 못한다. 과거 config가 있는 실험은 일정과 결과를 바꾸지 않기 위해 legacy 경로를 유지한다. 같은 plan의 재개는 같은 실험이며 새 seed나 추가 확인을 만드는 허가가 아니다.

추가 테스트는 대칭의 involution/합법 후속 수 보존, 이동 순서가 다른 동일 상태, ply 배제, 차례·잔량 구분, 원장/plan 변경, 선행 실험 누락, 교집합, 쌍 손상 및 unplanned SPRT 거부를 확인한다. 관련 파일: [`openingIdentity.test.ts`](../bench/lib/openingIdentity.test.ts), [`openingRegistry.test.ts`](../bench/lib/openingRegistry.test.ts).

## 기존 C의 전체 LLR 재계산과 이어가기 판단

[`old-confirmation-llr.csv`](../bench/results/stage3d-independent/old-confirmation-llr.csv)와 [전체 행 JSON](../bench/results/stage3d-independent/old-confirmation-llr.json)에 실제 pair index마다 원본 LLR, 중복 여부, 제외 이유, 유효 쌍 수, 정리 후 LLR을 남겼다. 종료 후 샤드의 추가 결과와 prefix 공백도 숨기지 않는다.

확인된 중복은 여전히 pair 436(P의 pair 18), pair 492(T의 pair 17)이다. 모든 과거 실제 국면과 네 대칭으로 비교해도 추가 중복은 없었고 C 내부 중복도 없다. 원래 중단점은 497유효 쌍 / LLR 2.97861이다. 그 지점에서 두 쌍 제거 시 495쌍 / 2.76548, 전체 **연속 완료 prefix**에서는 496쌍 / **2.76082883**이다. 30쌍 이후 정리된 LLR의 전체 범위는 −1.34027…+2.77199로 어느 경계도 넘지 않았다. 순차 판정에 쓰지 못하는 미완결 공백 뒤의 대국도 CSV에 따로 표시한다.

미완결 공백 뒤의 저장된 완결 쌍까지 포함한 **전체 가용 기록의 설명 통계**는 중복 제거 후 505쌍, LL 76 / 분할 322 / WW 107, LLR **2.20718886**이다. 이는 빠진 쌍을 임의로 건너뛴 순차 판정으로 쓰지 않는다. [전체 가용 기록 추이](../bench/results/stage3d-independent/old-confirmation-whole-dataset.json)와 [LLR 그래프](../bench/results/stage3d-independent/old-confirmation-llr.svg)도 보존했다.

기존 C의 정리된 통계에서 추가 대국으로 이어가지는 않는다. 원래 종료 규칙이 중복을 포함한 LLR을 사용했고, 이미 결과를 검토한 뒤 새로운 identity·제외 규칙을 적용했기 때문이다. 그 절차의 오류율이 원래 α/β와 같다고 보장할 사전 규칙이나 보정이 없다. 남은 국면/사후 필터 중 유리한 경로를 선택하지 않는다.

고정된 후보에 새로운 독립 확인 하나를 실행하고 그 결과만 최종 확인으로 쓰는 선택은 본 프로젝트의 보수적인 절차 판단이다. 기존 C와 합산하거나 기존 C를 정상 독립 검증으로 다시 부르지 않는다. GSPRT의 경계·종료 규칙 설명은 [Fishtest 공식 수학 문서](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html)를 참고했으며, 이 결함 있는 검정을 무보정으로 재개할 수 있다는 외부 보증으로 인용하는 것은 아니다.

## 새 확인 사전 등록

- ID: `C-D-300-independent-1`, seed **98004**(후속 첫 seed; 결과에 따른 선택 없음).
- [사전 등록](../bench/results/stage3d-independent/preregistration.json), [동결 config](../bench/results/stage3d-independent/frozen-config.json).
- H0=0 Elo, H1=+30 Elo, α=β=0.05, 최소 30유효 쌍, 최대 **600일정 쌍**, 경계 ±2.94443898. 선후공 교환, 각 300ms, 4샤드.
- 후보: E6+C1+fast. 대조: E6+C1+reference. E6 수학적 정의/가중치와 탐색 알고리즘은 측정 중 변경하지 않는다.
- 원본의 반복 중단·3배 예산·게임 제한·최대 3회 시도 규칙 유지. 새 실행은 AC 확인이 불가능해도 대기하고, 도중 mixed/unknown/battery로 끝난 시도는 격리한다. 전원 문제를 유리한 결과만 제외하는 기준으로 쓰지 않는다.
- 최초 경계 통과 또는 기존 상한에서 종료. **H1이면 정확성 검증 후 fast 채택, H0/미결이면 reference 유지. 어떤 결과라도 두 번째 대체 확인은 실행하지 않는다.**
- 기존 결과를 pooling하지 않는다. 새 후보·창 폭·평가 계수를 선택하는 실험도 병행하지 않는다. 새 pool에 조건부인 Elo를 과거 pool의 Elo에 더하지 않는다.

실행 전에는 위 계획과 코드·입력 checksum을 연구 브랜치에 먼저 커밋한다. 계측이 시작된 뒤 결과에 따라 계획을 고치지 않는다. 결과와 최종 검증은 아래에 덧붙인다.

## 새 확인 결과

**최종 판정: H1 수용, fast 기본값 채택.** seed/일정/검정 기준을 동결한 대체 확인을 한 차례만 실행했다. 기존 C를 재개하거나 pooling하지 않았으며, 새 확인을 반복하지 않았다.

실행 전 검증: 전체 단위 테스트 518 통과 / 1 skipped, `tsc -b` 통과. 모듈 default와 E6 평가/탐색 코드는 변경하지 않은 상태에서 측정한다.

| 항목 | 최초 경계 통과 시점의 결과 |
|---|---|
| 측정 커밋 | `d53d052909ca4e65b3ce58fce089ec947cd718c5` — AI/engine 코드는 `9c2d530`과 동일 |
| config hash | `cba0fa36592dbd6b` |
| 검정 단위 / 유효 대국 | **224유효 오프닝 쌍 / 448판** |
| 쌍별 결과 | LL 27 / 분할 149 / WW 48 (fast 기준) |
| 유효 판에서 fast 승 / 패 | 245 / 203 |
| 쌍 점수 | **0.546875 (54.6875%)** |
| 쌍 기준 점수 95% CI | **[0.50940394, 0.58434606]** |
| Elo(fast−reference) | **+32.6680**, 95% CI **[+6.5353, +59.1753]** |
| GSPRT LLR / 승격 경계 | **2.959743616 / 2.944438979** |
| 검정 기준 | H0=0 / H1=+30 Elo, α=β=.05, 최소 30유효 쌍, 최대 600일정 쌍 — 변경 없음 |
| 최초 판정 pair index | **250** (0-based), 처음 251개 일정 쌍 중 무효 27쌍 제외 |
| 실행 시간(KST) | 16:50:25 시작 → 17:27:26 워커 종료 → 17:27:29 terminal 저장 |

CI는 기존 구현의 쌍 점수 표준오차 정규 근사와 logistic Elo 변환이다. 순차 중단 보정 confidence sequence가 아니며, 중단 시점의 효과 추정에는 선택 편향이 있을 수 있다. 이 수치는 이 독립 pool과 같은 시간 조건에서 reference 대비 관측한 차이이며, 이전 단계의 Elo에 더하지 않는다.

개별 쌍의 두 결과, 0/0.5/1 점수, 제외 사유, 판정 사용 여부, prefix LLR은 [`pair-scores.csv`](../bench/results/stage3d-independent/pair-scores.csv)에 있다. 원시 대국과 기존 summary는 [`결과 디렉터리`](../bench/results/stage3d-independent/stage3d-independent/C-D-300-independent-1/)에, 독립 재계산 및 SHA-256은 [`final-audit.json`](../bench/results/stage3d-independent/final-audit.json)에 보존했다.

### 전체 저장 기록과 판정 표본의 구분

| 항목 | 저장된 전체 결과 |
|---|---:|
| 원시 행 / 최종 시도 대국 | 513 / 513 |
| 실제 사용한 시작 국면 | 257 |
| 완결 쌍 | 256 = 무중단 228 + 중단 포함 28 |
| 결정 대국 / 반복 중단 판 | 483 / 30 |
| 개별 판 기준 fast 승 | 263 / 483 (설명 통계) |
| 미완결 대국 쌍 | 1 |
| 재대국 / 의심 시도 | **0 / 0** |

샤드의 진행 차이와 종료 신호 당시 진행 중이던 판 때문에 추가 기록이 존재한다. 224쌍 이후의 완결 쌍이나 미완결 prefix 뒤의 판을 최초 판정에 더하지 않았다. 반복 중단 30판과 해당 쌍 28개의 차이는 양쪽 판 모두 중단인 쌍이 있기 때문이다. 원본 결과를 삭제하거나 유리한 종료 시점으로 옮기지 않았다.

### 독립성·전원·무효 처리 최종 검증

- 새 전체 일정 **600쌍 모두** 자체 동일/대칭 중복 0, 선행 40개 실험의 전체 일정·실제 국면 및 기존 원장과 교집합 0. 실제 실행한 257개 국면도 이 동결 일정의 해당 index와 완전히 일치했다.
- plan SHA-256 `b3bb7ebbedd35450dcc6530d7ad54c870fb4c066bbeac0273c20e5763083d8b5`, registry SHA-256 `971e1be336808fa1306fb85233da600382111817924d2eb3199c1366278d9208` 및 216개 역사 입력 hash 일치.
- **513/513판 AC**, battery/mixed/unknown 0. 네 세션 모두 같은 측정 커밋이며 `srcDirty=false`. 판 전후 전원 확인이며 연속 전원 계측은 아니라는 한계는 유지한다.
- 최대 한 수 경과 시간: fast 360.61ms, reference 369.03ms. 900ms(3×예산) 초과와 게임 시간 제한 중단 0. raw decision ms로 표시를 재계산했다.
- 같은 샤드의 대국 완료 로그 최대 간격 **29.276초**. 장시간 절전 공백을 나타내는 기록은 없었다. 별도 OS 절전 이벤트 수집을 한 것은 아니다.
- 연속 완결 prefix의 반복 중단 포함 **27쌍 전체를 제외**, 의심 쌍 제외 0. 재대국 규칙은 변경하지 않았으며 이 확인에서는 재대국이 필요하지 않았다.
- 워커 실패 0, 단 한 차례의 terminal `accept-H1`. 완료 후 재시작하지 않았다.

### 탐색 지표(전체 저장 기록, 설명 통계)

| 항목 | fast | reference |
|---|---:|---:|
| 완료 깊이 평균 | 7.842 | 7.386 |
| 수당 노드 평균 | 12,204 | 8,560 |
| 노드/초 | 50,216 | 34,384 |
| 한 수 시간 평균(ms) | 243.02 | 248.96 |
| 한 수 시간 P95(ms) | 303.54 | 305.13 |

실제 대국 중 양측이 보는 국면은 달라지므로 이를 동일 노드 비용 비교로 해석하지 않는다. 동일 국면 속도·CPU 프로파일·메모리 한계는 [초기 최종 보고서의 5–8절](stage3d-eval-report.md)에 그대로 보존했다. 새 속도/메모리 벤치마크는 실행하지 않았다.

## 채택과 최종 검증

원래 최초 SPRT의 H1 수용, 이전 정확성·전술 검사와 AC 속도 검증, 이번 독립 확인 H1 수용 및 원시 기록 감사가 충족돼 **fast를 기본값으로 확정**했다. 기존 중복 C는 역사 기록/민감도 분석으로만 남고 유효한 독립 확인에 포함하지 않는다.

- `DEFAULT_VULNERABILITY_KERNEL = 'fast'`를 모듈과 `DEFAULT_MINIMAX_SETTINGS.evalKernel`에서 함께 사용한다. E6의 가중치·수학적 정의, C1 탐색 및 다인전/변형 규칙은 바꾸지 않았다.
- `vulnerabilityReference`, reference extra-wall BFS, `evalKernel: 'reference'` 옵션을 보존했다. `resolveMinimaxSettings({ evalKernel: 'reference' })`로 비교·롤백할 수 있다. 기본값과 rollback의 고정 깊이 점수·최선 수·PV·노드 동일성 회귀 검사를 추가했다.
- 전체 단위 테스트: **50파일, 519 통과 / 1 skipped (520)**. 타입 검사 `tsc -b`, 프로덕션 빌드 통과. 기존 연구 브랜치의 500KB 번들 경고는 남아 있으며 main SEO 코드를 이 브랜치로 옮기지 않았다.
- 완료된 벤치마크를 재실행하지 않았다. 최종 감사 테스트는 JSONL·설정·통계만 읽고 새 감사/쌍별 CSV를 작성한다.
- 기존 사용자 미커밋 파일 102개, 보완 전 결과 파일 641개의 SHA-256 보존 확인. 동결 계획·기존 실험 원본과 새 확인의 원시 기록도 보존했다.
- `main`/SEO 배포/학습 파일은 변경하지 않고 `stage1-benchmark`에만 마무리 커밋을 Push한다. 3-E 개발은 시작하지 않았다.

장시간 실행을 AI 세션에서 반복 조회하지 않는 운영 원칙은 `AGENTS.md`와 `CLAUDE.md`에 별도 반영돼 있다. 이후 실험은 runner 자체의 독립 실행·PID/로그 안내 후 응답 종료 방식을 따라야 한다.
