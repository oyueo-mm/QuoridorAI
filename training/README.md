# training/

Google Colab(GPU)에서 실행할 Python + PyTorch 학습 코드가 들어갈 자리입니다. (아직 비어 있음)

계획:
- 웹 엔진(`src/engine`)과 동일한 규칙·좌표계·행동 인덱스를 Python으로 구현하고,
  양쪽 결과가 일치하는지 교차 검증합니다. 기준은 `src/engine/encoding.ts`(행동 209개)입니다.
- 학습한 모델은 ONNX로 내보내 `public/models/`에 두고 ONNX Runtime Web으로 추론합니다.
