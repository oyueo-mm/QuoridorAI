# training/ — AlphaZero 학습 인프라 (Stage 6A)

웹 엔진(`src/engine`, TypeScript)과 **같은 규칙·좌표계·행동 인덱스**를 쓰는 Python 패키지 `quoridor_az`와,
VS Code에서 **Colab GPU 커널**로 실행하는 노트북으로 구성됩니다. 이번 단계는 인프라·검증 단계이며 장시간 학습은 하지 않습니다.

```
training/
  quoridor_az/
    engine.py      규칙 (TS 엔진의 1:1 포팅, 벽은 64비트 마스크)
    features.py    신경망 입력 텐서 · 관점(canonical) 변환 · 합법 행동 마스크
    network.py     Policy-Value ResNet (ONNX 친화적 연산만 사용), export_onnx
    evaluator.py   배치 신경망 평가 + 포지션 캐시, UniformEvaluator
    mcts.py        Neural MCTS (PUCT, Dirichlet noise, temperature, 단계형 API)
    selfplay.py    병렬(lockstep) Self-Play, 샘플 생성, 중단 대국 정책
    replay.py      Replay Buffer (원형, 원자적 저장/복원)
    train.py       손실(정책/가치/엔트로피), 학습 스텝, NaN/Inf 검사
    checkpoint.py  원자적 체크포인트 + sha256 검증 + RNG 상태 + 손상 시 이전 체크포인트로 복구
    evaluate.py    선후공 교환 대국 평가, Wilson 신뢰구간, 기준 플레이어
    pipeline.py    Self-Play → 버퍼 → 학습 → 평가 → 체크포인트 반복 (재개 가능)
    bench.py       성능 측정 (모두 실측)
    sync.py        Colab 쪽 번들 설치·검증
  tests/           pytest (교차 언어 Fixture, 규칙, MCTS, Self-Play, 학습, 체크포인트)
  fixtures/        engine_fixtures.json — TS 엔진이 만든 정답 (npm run fixtures:engine)
  notebooks/       quoridor_alphazero.ipynb — VS Code + Colab 커널용
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
| `draw` | 가치 0 (명시적으로 선택할 때만) |
| `adjudicate` | 0.5·tanh(BFS 거리 차/3) — 약한 추정 라벨 |

버린 샘플 수와 중단 사유는 `SelfPlayStats`에 기록됩니다.

## 4. 체크포인트

`RUN_DIR/checkpoints/iter_XXXXXX.pt`(모델·옵티마이저·스케줄러·학습 스텝·반복 번호·설정·RNG 상태·메트릭·모델 메타데이터),
`latest.json`(sha256 포함 포인터), `replay.npz`, `metrics.jsonl`.
쓰기는 임시 파일 → fsync → 원자적 이름 변경이고, 로드 시 해시가 다르면 이전 체크포인트로 넘어갑니다.
인코딩 버전(`qz-features-v1`, `qz-resnet-v1`)이 다르면 재개를 거부합니다.

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
