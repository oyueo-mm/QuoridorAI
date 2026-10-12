# training/ — AlphaZero 학습 인프라 (Stage 6A · 6B-1)

웹 엔진(`src/engine`, TypeScript)과 **같은 규칙·좌표계·행동 인덱스**를 쓰는 Python 패키지 `quoridor_az`와,
VS Code에서 **Colab GPU 커널**로 실행하는 노트북으로 구성됩니다. 이번 단계는 인프라·검증 단계이며 장시간 학습은 하지 않습니다.

```
training/
  quoridor_az/
    engine.py      규칙 (TS 엔진의 1:1 포팅, 벽은 64비트 마스크) — 6B-1부터 비트보드 고속 경로
    bitboard.py    81비트 정수 비트보드: 도달성·거리·벽 합법성, 벽 배치 기준 캐시 (6B-1)
    reference.py   6A 원본 구현 보관 — 고속 경로가 이것과 비트 단위로 같아야 함 (6B-1)
    features.py    신경망 입력 텐서 · 관점(canonical) 변환 · 합법 행동 마스크 (벽 평면 캐시)
    network.py     Policy-Value ResNet (ONNX 친화적 연산만 사용), export_onnx
    evaluator.py   배치 신경망 평가 + 포지션 캐시, 시간 분해, OOM 시 배치 분할, fp16/bf16 옵션
    mcts.py        Neural MCTS (PUCT, Dirichlet noise, temperature, 단계형 API, Virtual Loss)
    selfplay.py    병렬(lockstep) Self-Play, 게임당 여러 리프, 계측, 시간 예산, 중단 대국 정책
    replay.py      Replay Buffer (원형, 원자적 저장/복원)
    train.py       손실(정책/가치/엔트로피), 학습 스텝, NaN/Inf 검사
    checkpoint.py  원자적 체크포인트 + sha256 검증 + RNG 상태 + 손상 시 이전 체크포인트로 복구
    evaluate.py    선후공 교환 대국 평가, Wilson 신뢰구간, 기준 플레이어
    pipeline.py    Self-Play → 버퍼 → 학습 → 평가 → 체크포인트 반복 (재개 가능, 실패 시 롤백)
    bench.py       성능 측정 도구 (모두 실측) — 추론/학습/MCTS/Self-Play 스윕, GPU·CPU 사용률
    verify.py      GPU 검증 보고서 (JSON, 측정 장치 표기, gpu_verified) (6B-1)
    diagnostics.py 중단 대국 데이터 편향, 메모리 증가, 학습 가능성 검사 (6B-1)
    pilot.py       소규모 Pilot 학습 + 안정성 검사, GPU 검증 전에는 실행 거부 (6B-1)
    report.py      설정 추천, 측정값 기반 자원 추정 (6B-1)
    sync.py        Colab 쪽 번들 설치·검증
  tests/           pytest (교차 언어 Fixture, 고속 경로 동등성, 규칙, MCTS, Self-Play, 학습, 체크포인트, 복구)
  fixtures/        engine_fixtures.json — TS 엔진이 만든 정답 (npm run fixtures:engine)
  tools/           ab_compare.py (6A ↔ 6B-1 비교), halted_analysis.py (중단 대국 정책 분석)
  results/         측정 결과 (stage6b1/)
  notebooks/       quoridor_alphazero.ipynb (6A 스모크), stage6b1_gpu_verification.ipynb (6B-1 GPU 검증·Pilot)
```

## 1. VS Code ⇄ Colab 실행 구조

| 위치 | 하는 일 |
|---|---|
| 로컬 VS Code (Windows) | 코드 편집, Git, `npm run colab:bundle`, (선택) 로컬 CPU로 pytest |
| Colab 커널 (원격 Linux) | 노트북 셀 실행: GPU 학습·추론, Neural MCTS, Self-Play |
| Google Drive | 체크포인트, Replay Buffer, 메트릭 (`MyDrive/QuoridorAI/runs/<RUN_NAME>`) |

로컬 터미널의 `python`과 노트북 셀은 **다른 컴퓨터**에서 실행됩니다. 노트북은 경로를 `pathlib`로 다루고 실행 위치(Colab/로컬)를 스스로 판별합니다.

### 연결

1. VS Code 확장: **Google Colab**(google.colab)과 Jupyter가 필요합니다(이 PC에는 설치되어 있음).
2. `training/notebooks/quoridor_alphazero.ipynb`를 열고 **Select Kernel → Colab → New Colab Server → GPU**를 고릅니다.
   처음 한 번은 브라우저에서 Google 로그인이 필요합니다.
3. 셀을 위에서부터 실행합니다.

### 소스 코드 동기화 (중요)

Colab 커널을 연결해도 **로컬 파일이 원격 런타임에 자동으로 동기화되지 않습니다.** 확장 v0.9.7 기준으로 확인한 기능은 다음과 같습니다.

- **Upload to Colab**(탐색기 우클릭, 기본 켜짐) — 파일·폴더를 `/content`로 업로드. ← **기본 방식**
- Mount Server to Workspace — 실험 기능(`colab.serverMounting`, 기본 꺼짐). 안정성 문제로 사용하지 않음.
- Mount Google Drive to Server — Drive를 `/content/drive`에 연결하는 코드 셀을 추가.

그래서 코드는 **검증 가능한 번들**로 옮깁니다.

```bash
npm run colab:bundle      # 로컬: training/dist/quoridor_az_bundle.tar.gz 생성, bundle_id 출력
```

1. 탐색기에서 `training/dist/quoridor_az_bundle.tar.gz` 우클릭 → **Upload to Colab** (또는 Drive `MyDrive/QuoridorAI/bundles/`에 복사).
2. 노트북 2번 셀이 압축을 풀고 **파일마다 sha256을 매니페스트와 대조**한 뒤 import합니다. `EXPECTED_BUNDLE_ID`에
   로컬에서 출력된 id를 넣으면 다른 버전이면 즉시 실패합니다. 매니페스트에는 git 커밋과 미커밋 변경 여부도 기록됩니다.
3. 로컬 코드를 고치면: 번들 재생성 → 다시 업로드 → 2번 셀 재실행(이미 import된 모듈을 지우고 다시 불러옴).
4. 런타임이 재시작되면 1–2번 셀을 다시 실행하고, 9번 셀로 Drive 연결과 학습 재개를 합니다.

GitHub에 push하지 않은 최신 코드도 이 방식으로 그대로 전달됩니다(clone에 의존하지 않음).

## 2. 규약 (TypeScript와 공유)

- **좌표·행동 인덱스**: `src/engine/encoding.ts`와 동일 — `[0,81)` 말 이동(목적지 row·9+col), `[81,145)` 가로벽, `[145,209)` 세로벽(앵커 row·8+col).
- **관점(canonical view)**: 항상 "차례인 플레이어" 시점. 플레이어 1은 보드를 180° 회전(칸 (r,c)→(8−r,8−c), 벽 앵커 (r,c)→(7−r,7−c)).
  행동 인덱스도 같은 회전을 적용하며, 변환은 자기 자신이 역함수입니다(`canonical_action_index`, TS `canonicalActionIndex`).
- **입력 텐서** (`qz-features-v1`, 11×9×9 float32): 내 말, 상대 말, 가로벽 앵커, 세로벽 앵커, 남쪽 막힘, 동쪽 막힘,
  내 남은 벽/10, 상대 남은 벽/10, 내 BFS 거리/80, 상대 BFS 거리/80(도달 불가=1), 1로 채운 평면. TS `encodeStatePlanes`와 동일.
- **출력**: 정책 로짓 209개(관점 좌표), 가치 1개(tanh, 차례인 플레이어 관점, 승리 +1 / 패배 −1).
  합법 마스크는 네트워크 밖에서 적용(`masked_log_softmax`, 불법 행동 확률 정확히 0) — ONNX 그래프를 단순하게 유지.
- **검증**: TS 엔진이 만든 433개 상태(경계 사례 25개 + 무작위 대국)의 합법 행동 순서, 128개 벽 판정 사유, 최단 거리,
  상태 전이, 관점 인덱스, 입력 텐서를 Python이 그대로 재현해야 합니다(`tests/test_engine_fixtures.py`).
  TS 쪽 `scripts/engineFixtures.test.ts`는 커밋된 Fixture가 현재 엔진과 같은지 매번 확인합니다.

## 3. Self-Play와 중단 대국 정책

샘플 = (관점 텐서, MCTS 방문 분포(관점 좌표), 관점 합법 마스크, 가치 목표, 차례 플레이어).
가치 목표는 대국 결과를 각 상태의 차례 플레이어 관점으로 바꾼 값(이김 +1, 짐 −1)입니다.

최대 ply·반복 포지션으로 **중단된 대국은 승패가 없습니다.** 처리 방식은 `SelfPlayConfig.halted_policy`로 명시합니다.

| 정책 | 처리 |
|---|---|
| `discard` (기본) | 샘플을 버림 — 근거 없는 라벨을 만들지 않음 |
| `policy-only` (6B-1) | 정책 학습에는 쓰고 가치 라벨은 붙이지 않음(`value_weight` 0) — 데이터를 버리지도, 라벨을 지어내지도 않음 |
| `draw` | 가치 0 (명시적으로 선택할 때만) |
| `adjudicate` | 0.5·tanh(BFS 거리 차/3) — 약한 추정 라벨 |

버린 샘플 수, 가치 라벨 없이 남긴 샘플 수, 중단 사유는 `SelfPlayStats`에 기록됩니다.
가치 손실은 `value_weight`로 가중 평균합니다(가중치가 모두 1이면 기존 평균과 같음). Replay Buffer 형식은
`qz-replay-v2`(가중치·반복 번호 포함)이고 v1 파일도 읽습니다(가중치 1).

## 4. 체크포인트

`RUN_DIR/checkpoints/iter_XXXXXX.pt`(모델·옵티마이저·스케줄러·학습 스텝·반복 번호·설정·RNG 상태·메트릭·모델 메타데이터),
`latest.json`(sha256 포함 포인터), `replay.npz`, `metrics.jsonl`.
쓰기는 임시 파일 → fsync → 원자적 이름 변경이고, 로드 시 해시가 다르면 이전 체크포인트로 넘어갑니다.
인코딩 버전(`qz-features-v1`, `qz-resnet-v1`)이 다르면 재개를 거부합니다.

6B-1에서 추가된 복구 규칙:
- 저장 순서는 Replay Buffer → 체크포인트 → 메트릭 행. Replay 파일은 자신의 반복 번호를 기록하고, 재개할 때
  체크포인트와 다르면 `resume_warnings`로 알립니다.
- 재개 시 `metrics.jsonl`을 체크포인트 이력에 맞춥니다(체크포인트에 도달하지 못한 반복의 행 제거, 빠진 행 복원).
- 반복 도중 예외(CUDA 오류, 셀 중단, Drive 문제)가 나면 마지막 체크포인트(없으면 초기 상태)로 되돌린 뒤 예외를 다시 던집니다.
- Self-Play가 실패하면 대기 중인 리프를 정리하고 부분 결과 없이 예외를 전달합니다(버퍼는 그대로).
- CUDA OOM이 나면 추론 배치를 반으로 나눠 다시 시도합니다(`EvalStats.oom_splits`).

## 5. 로컬 테스트 (선택)

```bash
py -3.12 -m venv training/.venv
training/.venv/Scripts/python -m pip install numpy pytest
training/.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu   # 신경망 테스트용 (선택)
cd training && .venv/Scripts/python -m pytest -q
```

torch가 없으면 신경망 테스트는 건너뜁니다. GPU 검증은 Colab 노트북에서 합니다.

ONNX 내보내기 확인(선택): `pip install onnx onnxscript onnxruntime` 후 `tests/test_onnx_export.py`가
`export_onnx`(동적 배치, 입력 `planes`, 출력 `policy_logits`·`value`) 결과를 onnxruntime으로 PyTorch와 대조합니다.
패키지가 없으면 건너뜁니다. 노트북 11번 셀(`EXPORT_ONNX = True`)도 같은 확인을 합니다.

## 6. 성능 (실측값과 예상값을 구분)

### 실측 — 로컬 CPU, 2026-10-12

Windows 11 노트북, Python 3.12, torch 2.14.1+cpu, 네트워크 64채널×4블록(파라미터 381,218). 노트북 8번 셀(`bench.measure`)과
1–11번 셀 전체 실행을 두 번 측정했습니다. 같은 코드인데 실행 A와 B가 2–3배 차이 납니다 — 노트북 PC의 전원·클럭 상태
차이로 보이며, 절대값보다 **비율(어디에 시간이 쓰이는지)**을 보는 것이 맞습니다.

| 항목 | 실행 A | 실행 B |
|---|---|---|
| 추론 batch 1 | 5.0 ms (202 pos/s) | 7.4 ms (135 pos/s) |
| 추론 batch 32 | 36 ms (886 pos/s) | 23 ms (1,364 pos/s) |
| 추론 batch 256 | 182 ms (1,406 pos/s) | 67 ms (3,829 pos/s) |
| 학습 스텝 batch 256 | 0.61 s | 0.27 s |
| 입력 텐서 인코딩 1회 (BFS 거리 맵 2개 포함) | 1.0 ms | 0.34 ms |
| 합법 행동 생성 (초기 상태) | 12.8 ms | 3.7 ms |
| Neural MCTS 100 시뮬레이션, 단일 대국 | 46 sims/s — 신경망 38%, 인코딩 60% | 156 sims/s — 신경망 32%, **인코딩 65%** |
| Self-Play 2대국 병렬, 100 시뮬레이션 | 대국당 60 s, 평균 배치 1.3 | 대국당 30 s, 평균 배치 1.3 |
| 노트북 6번 셀 Self-Play (64 시뮬레이션, 2대국) | 70 s | 41 s |
| 파이프라인 1회 반복의 Self-Play (2대국, 32 시뮬레이션) | 52 s(반복 전체) | 24 s |
| ONNX 내보내기 (11번 셀) | — | PyTorch 대비 최대 오차 6e-7, 1.5 MB |
| 노트북 전체 | 416 s (1–10번) | 485 s (1–11번, ONNX 포함) |

노트북을 오래 돌릴 때 이 PC는 **Modern Standby로 들어가 실행이 멈춥니다**(실제로 두 번 셀 타임아웃이 났고 이벤트 로그로 확인).
로컬에서 길게 돌릴 때는 전원을 연결하고 화면 꺼짐/절전을 막아야 합니다. Colab에서는 해당 없음.

### 실행하지 않은 것

- **Colab GPU 스모크 테스트는 이 PC에서 실행하지 않았습니다.** 노트북 1·4·8번 셀이 GPU 이름, CUDA 순전파/역전파,
  GPU 최대 메모리를 출력하도록 준비되어 있습니다.
- 장시간 학습은 하지 않았습니다(이번 단계 범위 밖).

### 예상 — GPU (측정 전 추정, 실측으로 바꿔야 함)

T4급 GPU에서 batch 256 추론은 CPU보다 수십 배 빠를 것으로 예상하지만, 현재 구조에서는 **신경망보다 Python 쪽
(인코딩·합법 행동·트리)이 병목**이라 GPU만으로는 Self-Play가 크게 빨라지지 않습니다. 병렬 대국 수를 늘려
배치를 키우고 Python 쪽을 줄이는 것이 먼저입니다.

## 7. Stage 6B 권장 사항

1. **Self-Play 처리량 먼저**
   - `parallel_games` 32–128로 배치 키우기. 한 대국 안에서도 리프를 여러 개 모으는 virtual loss 추가.
   - 인코딩·합법 행동 가속: 상태별 거리 맵 캐시, 벽 마스크 비트 연산 벡터화 또는 numba, 리프 확장 시 합법 행동 재사용.
   - 목표: GPU에서 평균 배치 64 이상, 전체 시간 중 신경망 비중 50% 이상.
2. **모델**: 64×4로 시작하고 학습이 정체되면 96×6. 입력·출력 규약(`qz-features-v1`, 209 로짓)은 유지.
3. **하이퍼파라미터 시작점**: 시뮬레이션 100–200, 반복당 100대국 이상, batch 256–512, lr 1e-3(코사인 감쇠),
   weight decay 1e-4, Replay 100k–200k, Dirichlet α 0.3 / ε 0.25, 처음 12수는 temperature 1, 중단 대국은 `discard`.
4. **평가**: 반복마다 이전 체크포인트, 탐욕 기준선과 선후공 교환 대국. Wilson 구간이 겹치지 않을 때만 개선으로 판단.
5. **웹 연동 준비**: `export_onnx`로 내보낸 모델을 TS `encodeStatePlanes` + `canonicalActionIndex`와 묶어 브라우저에서
   onnxruntime-web으로 실행. 같은 입력에 대해 Python과 TS 출력이 같은지 Fixture로 검증.

## 8. Stage 6B-1 — GPU 검증 준비와 Self-Play 최적화

### 최적화 (규칙·인코딩은 그대로)

6A에서 "인코딩 60–65%"로 보고된 시간은 실제로는 **합법 벽 생성(BFS 도달성 검사)이 대부분**이었습니다(평가기가 둘을
한 타이머로 쟀음). 6B-1에서는 타이머를 인코딩·합법 행동·추론·후처리로 나눴습니다.

- **비트보드**(`bitboard.py`): 칸 81비트 정수, 한 BFS 층을 시프트·마스크 몇 번으로 확장. 도달성·거리 맵·벽 겹침이 모두 정수 연산.
- **벽 배치 기준 캐시**: 열린 변, 빈 벽 자리, 거리 층, "이 벽이 플레이어를 가두는가"는 벽 배치(+말 하나)에만 의존하므로
  `lru_cache`로 공유 — 탐색 트리의 대부분 노드는 부모와 말 위치만 다름.
- **경로 차단 후보만 검사 + 지역 우회 확인**: 최단 경로 하나를 끊는 벽만 검사하고, 끊긴 변 양 끝이 8걸음 안에 다시
  이어지면 연결 유지(정확함), 아니면 전체 flood fill.
- **입력 텐서**: 벽 평면(2–5, 8, 9)을 벽 배치별로 캐시(읽기 전용), 배치 전체를 한 배열에 바로 기록(`encode_batch`).
- **MCTS**: Q·방문 합을 증분 갱신, `net.eval()`은 학습 모드일 때만 호출, 행동 객체 표(`ACTIONS`) 재사용.
- **Numba**: 검토했지만 적용하지 않음 — 이 PC에서는 Windows 애플리케이션 제어 정책이 `llvmlite.dll` 로드를 막아 로컬에서
  동등성을 검증할 수 없었음. 검증 못 한 커널은 넣지 않았고, Colab(numba 기본 설치)에서 6B-2 후보로 남김.

**동등성 검사**: `reference.py`(6A 원본)와 고속 경로를 비교 — 433개 교차 언어 Fixture + 벽이 많은 무작위 대국(벽 15개 이상
포지션 50개 초과)에서 합법 행동 순서, 벽 판정 사유 128종, 거리, 상태 전이, 입력 텐서 **바이트 단위 일치**(`tests/test_fast_paths.py`).
`tools/ab_compare.py`는 6A 패키지와 6B-1 패키지를 별도 프로세스로 번갈아 실행하며 합법 행동·텐서·MCTS 방문 수·Self-Play 기보의
해시까지 비교합니다 — 모두 동일.

### 실측: 6A ↔ 6B-1 (로컬 CPU, `results/stage6b1/ab_compare.md`)

| 항목 | 6A | 6B-1 | 배율 |
|---|---:|---:|---:|
| 합법 행동, 캐시 비움 (µs/포지션) | 1195 | 27 | 44× |
| 합법 행동, 두 번째 (µs/포지션) | 1196 | 4.6 | 259× |
| 입력 텐서, 캐시 비움 (µs/포지션) | 384 | 19 | 20× |
| 입력 텐서, 두 번째 (µs/포지션) | 382 | 3.8 | 101× |
| MCTS sims/s (배치 1, CPU 신경망) | 391 | 1180 | 3.0× |
| Self-Play 대국당 초 (32 sims, 2대국) | 8.7 | 3.6 | 2.4× |

935개 포지션, 3회 교대 실행의 중앙값. MCTS·Self-Play는 이제 CPU 신경망 추론이 대부분이라 배율이 작습니다.

### Batched MCTS와 Virtual Loss

- `SelfPlayConfig.parallel_games`(동시 대국) × `leaves_per_game`(게임당 라운드별 리프 수)로 배치 크기를 조절.
- `leaves_per_game > 1`이면 Virtual Loss: 대기 중인 리프 경로의 간선에 가상 방문(패배로 계산)을 별도 배열에 더해 다음 하강이
  다른 가지로 가게 하고, 실제 백업 직전에 정확히 제거(N·W·Q에는 실제 결과만 남음). 이미 대기 중인 리프에 다시 닿으면
  그 라운드는 멈춤(충돌, `collisions`로 집계) — 같은 포지션을 두 번 평가하지 않음. `leaves_per_game = 1`이면 6A와 비트 단위로 같음.
- 배치 안의 중복 포지션은 한 번만 평가, 포지션 캐시(LRU), 추론 호출 수·평균/최대 배치·리프 대기 시간·CPU 시간 기록.

로컬 CPU 스윕(`results/stage6b1/verification_cpu_*.json`, 64×4, 32 sims, 설정당 30초):

| 동시 대국 × 리프 | sims/s | 평균 배치 | 추론 비중 | CPU 측 µs/sim |
|---|---:|---:|---:|---:|
| 2 × 1 | 928 | 1.4 | 86% | 153 |
| 2 × 4 | 1534 | 4.2 | 82% | 119 |
| 8 × 1 | 1698 | 4.6 | 82% | 108 |
| 8 × 4 | 2883 | 14.1 | 71% | 101 |
| 16 × 1 | 2338 | 9.4 | 75% | 107 |
| 16 × 4 | 3660 | 28.7 | 64% | 99 |
| 32 × 1 | 2833 | 20.3 | 67% | 115 |
| 32 × 4 | 4014 | 62.3 | 57% | 106 |

"CPU 측 µs/sim" = 신경망을 뺀 모든 일(트리·규칙·인코딩·기록)의 시뮬레이션당 시간. 이 값의 역수(이 PC에서 약
9,000–10,000 sims/s)가 GPU가 아무리 빨라도 한 프로세스로 넘을 수 없는 상한입니다. Colab vCPU의 값은 노트북에서 측정합니다.

### 중단 대국 정책 분석 (`tools/halted_analysis.py`, `results/stage6b1/halted_analysis.json`)

학습 전(무작위 가중치) 64×4 신경망, 32 sims, 32대국:

| max_plies | 완료 / 중단 | `discard`가 남기는 포지션 | 선공 승률(완료 대국) |
|---:|---|---:|---:|
| 200 | 16 / 16 (50%) | 2046 / 5246 (39%) | 50% (16판) |
| 300 | 21 / 11 (34%) | 3238 / 6538 (50%) | 38% (21판) |

초기 반복에서 `discard`는 데이터의 절반 이상을 버리고, 남는 것은 빨리 끝난 대국뿐입니다(길이 편향). 선후공 편향은 표본이 작아
판단할 수 없습니다(파일럿에서 계속 기록). 그래서 Pilot·6B-2 설정은 **`policy-only`**: 모든 포지션을 정책 학습에 쓰고, 가치
라벨은 실제 승패가 난 대국에만 붙입니다. 라이브러리 기본값(`discard`)은 기존 설정의 의미가 바뀌지 않도록 그대로 둡니다.

### GPU 검증 절차 (VS Code + Colab) — 아직 실행하지 않음

1. 로컬: `npm run colab:bundle` → `bundle_id` 확인.
2. 탐색기에서 `training/dist/quoridor_az_bundle.tar.gz` 우클릭 → **Upload to Colab**.
3. `training/notebooks/stage6b1_gpu_verification.ipynb` 열기 → **Select Kernel → Colab → New Colab Server → GPU**.
4. 2번 셀의 `EXPECTED_BUNDLE_ID`에 id 입력 후 1→6번 셀 순서대로 실행(5번이 GPU 검증, 약 10분).
5. 7번(안정성 검사) 실행. 8번 Pilot은 `RUN_PILOT = True`로 바꿔야만 실행되고, 5번에서 `gpu_verified`가 True가 아니면 거부합니다.
6. 10번이 `MyDrive/QuoridorAI/stage6b1/stage6b1_summary.json`을 저장 — 이 파일(또는 출력)을 공유하면 6B-2 설정을 확정할 수 있습니다.
7. 재연결 후: 1, 2, 4번 → 9번(재개). `CONTINUE = True`면 한 반복 더.

GPU 측정값(이름·VRAM·호환성·순전파/역전파·배치별 처리량·MCTS·Self-Play·체크포인트)은 **모두 미검증** 상태입니다.

### Stage 6B-2 제안 (측정값 기반, GPU 확인 후 조정)

| 항목 | 제안 | 근거 |
|---|---|---|
| 모델 | 64×4로 시작, 손실이 정체되면 96×6 | 6A/6B-1 스모크에서 안정 |
| 동시 대국 × 리프 | GPU 스윕 결과의 `recommend_selfplay` (CPU에서는 16×4) | 처리량 상위 10% 안의 가장 작은 설정 |
| MCTS | 64 sims → 가치 헤드가 의미 있어지면 128 | 시뮬레이션 수에 비례해 비용 증가 |
| 반복당 대국 | 64 | 반복당 약 1만 포지션 |
| 학습 | batch 512(CPU 측정 기준, GPU에서 재확인), 반복당 100 스텝 | 각 샘플을 약 4–5회 사용 |
| Replay | 200k, `policy-only`, max_plies 200 | 위 분석 |
| 반복 수 | 1차 100회, 5회마다 평가 | |

계획 A(100반복 × 64대국 × 64 sims, 평균 164수 — 학습 전 신경망 실측) = 6,700만 시뮬레이션:
- 이 PC CPU 실측 처리량(16×4, 3,660 sims/s)이면 Self-Play 5.1시간 + 학습 1.2시간(CPU batch 512) ≈ 6.9시간(평가 10% 포함).
- 이 PC의 CPU 측 상한(약 10,000 sims/s)이면 Self-Play만 최소 1.8시간 — GPU를 써도 한 프로세스로는 이보다 빨라질 수 없음.
- Replay 메모리 약 0.6 GB, 체크포인트 4.6 MB × 5개.

계획 B(100반복 × 128대국 × 128 sims)는 시뮬레이션이 4배라 같은 기준으로 Self-Play 7.4–20시간입니다. Colab GPU에서의 실제 시간은
노트북 10번 셀이 GPU 실측값으로 다시 계산합니다(평균 수는 Pilot 값 사용).

6B-2에서 고려할 것: Self-Play 다중 프로세스(Colab vCPU 수만큼), Colab에서 Numba 커널(동등성 테스트 포함), 탐색 트리 재사용.
