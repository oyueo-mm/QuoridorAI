"""The network exports to ONNX and onnxruntime reproduces the PyTorch outputs (skipped without onnx tools)."""

import numpy as np
import pytest

torch = pytest.importorskip('torch')
ort = pytest.importorskip('onnxruntime')
pytest.importorskip('onnx')
pytest.importorskip('onnxscript')

from quoridor_az import engine as E  # noqa: E402
from quoridor_az.features import encode_state_planes  # noqa: E402
from quoridor_az.network import NetConfig, PolicyValueNet, export_onnx  # noqa: E402


def test_onnx_export_matches_torch(tmp_path):
    torch.manual_seed(0)
    net = PolicyValueNet(NetConfig(channels=16, blocks=2, value_hidden=16))
    net.train()
    states = [E.create_initial_state(), E.create_state(pawns=((4, 4), (3, 4)), current_player=1), E.create_state(pawns=((2, 2), (6, 7)), walls_remaining=(3, 9))]
    x = torch.from_numpy(np.stack([encode_state_planes(s) for s in states]))
    path = tmp_path / 'model.onnx'
    export_onnx(net, path)
    assert net.training  # the training network is left untouched
    net.eval()
    with torch.no_grad():
        logits, value = net(x)
    session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    out_logits, out_value = session.run(None, {'planes': x.numpy()})
    np.testing.assert_allclose(out_logits, logits.numpy(), atol=1e-4)
    np.testing.assert_allclose(out_value, value.numpy(), atol=1e-5)
    single_logits, _ = session.run(None, {'planes': x[:1].numpy()})  # dynamic batch axis
    np.testing.assert_allclose(single_logits, logits[:1].numpy(), atol=1e-4)
    assert [p.name for p in tmp_path.iterdir()] == ['model.onnx']  # weights embedded, no external data file
