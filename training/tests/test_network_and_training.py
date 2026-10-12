"""Network / training / checkpoint smoke tests (CPU here; the notebook repeats them on GPU)."""

import numpy as np
import pytest

torch = pytest.importorskip('torch')

from quoridor_az import engine as E  # noqa: E402
from quoridor_az.evaluator import NeuralEvaluator  # noqa: E402
from quoridor_az.features import canonical_legal_mask, encode_state_planes  # noqa: E402
from quoridor_az.mcts import MctsConfig, Search  # noqa: E402
from quoridor_az.network import NetConfig, PolicyValueNet, count_parameters, masked_log_softmax  # noqa: E402
from quoridor_az.pipeline import EvalConfig, RunConfig, Trainer  # noqa: E402
from quoridor_az.selfplay import SelfPlayConfig  # noqa: E402
from quoridor_az.train import TrainConfig, make_optimizer, train_step  # noqa: E402

SMALL = NetConfig(channels=16, blocks=1, value_hidden=16)


def batch_of(states):
    planes = np.stack([encode_state_planes(s) for s in states])
    masks = np.stack([canonical_legal_mask(s) for s in states])
    return torch.from_numpy(planes), torch.from_numpy(masks)


def test_forward_shapes_value_range_and_mask():
    torch.manual_seed(0)
    net = PolicyValueNet(SMALL).eval()
    states = [E.create_initial_state(), E.create_state(pawns=((4, 4), (3, 4)), current_player=1)]
    x, mask = batch_of(states)
    logits, value = net(x)
    assert logits.shape == (2, 209) and value.shape == (2,)
    assert torch.all(value.abs() <= 1)
    p = masked_log_softmax(logits, mask).exp()
    assert torch.all(p[~mask] == 0)
    assert torch.allclose(p.sum(dim=1), torch.ones(2))
    assert torch.isfinite(logits).all()
    assert count_parameters(net) > 0


def test_backward_has_finite_gradients_and_overfits_a_tiny_dataset():
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    net = PolicyValueNet(SMALL)
    states, s = [], E.create_initial_state()
    for _ in range(16):
        states.append(s)
        s = E.apply_action(s, E.legal_pawn_moves(s)[0])
        if s.winner is not None:
            break
    planes = np.stack([encode_state_planes(x) for x in states])
    masks = np.stack([canonical_legal_mask(x) for x in states])
    policy = np.zeros((len(states), 209), dtype=np.float32)
    for i, m in enumerate(masks):
        legal = np.flatnonzero(m)
        policy[i, legal[rng.integers(len(legal))]] = 1.0  # one-hot targets
    batch = {'planes': planes, 'policy': policy, 'mask': masks, 'value': rng.choice([-1.0, 1.0], len(states)).astype(np.float32)}
    cfg = TrainConfig(learning_rate=3e-3, weight_decay=0.0)
    opt = make_optimizer(net, cfg)
    first = train_step(net, opt, batch, cfg, torch.device('cpu'))
    assert first['finite'] and np.isfinite(first['grad_norm'])
    for _ in range(300):
        last = train_step(net, opt, batch, cfg, torch.device('cpu'))
    assert last['policy_loss'] < 0.1 * first['policy_loss']
    assert last['value_loss'] < 0.05


def test_neural_mcts_runs_with_masking_and_cache():
    torch.manual_seed(0)
    ev = NeuralEvaluator(PolicyValueNet(SMALL), torch.device('cpu'))
    s = E.create_state(pawns=((4, 4), (3, 4)), current_player=1)
    search = Search(s, MctsConfig(num_simulations=40)).run(ev)
    pi = search.visit_policy()
    legal = set(E.legal_action_indices(s))
    assert pi.sum() == pytest.approx(1.0)
    assert all(pi[i] == 0 for i in range(209) if i not in legal)
    ev.evaluate([s])
    assert ev.stats.cache_hits >= 1
    out = ev.evaluate([s])[0]
    assert set(out.actions.tolist()) == legal and out.priors.sum() == pytest.approx(1.0)


def tiny_run_config(seed=3):
    return RunConfig(
        seed=seed,
        games_per_iteration=2,
        replay_capacity=500,
        net=SMALL,
        selfplay=SelfPlayConfig(mcts=MctsConfig(num_simulations=4, root_noise=True), max_plies=30, parallel_games=2, halted_policy='draw'),
        train=TrainConfig(batch_size=8, steps_per_iteration=3),
        eval=EvalConfig(pairs=1, simulations=2, opening_plies=0),
    )


def test_checkpoint_save_resume_and_corruption_fallback(tmp_path):
    t = Trainer(tmp_path, tiny_run_config(), torch.device('cpu'))
    row1 = t.run_iteration(log=lambda *_: None)
    row2 = t.run_iteration(log=lambda *_: None)
    assert row1['train']['steps'] == 3 and row2['iteration'] == 2
    assert row2['train']['non_finite_steps'] == 0

    probe = torch.from_numpy(encode_state_planes(E.create_initial_state())[None])
    t.net.eval()
    with torch.no_grad():
        before = t.net(probe)
    next_random = t.rng.integers(1 << 30, size=3)

    resumed = Trainer(tmp_path, tiny_run_config(seed=999), torch.device('cpu'))
    assert resumed.resume()
    assert resumed.iteration == 2 and resumed.train_steps == t.train_steps
    assert resumed.config.seed == 3  # config comes from the checkpoint
    assert len(resumed.buffer) == len(t.buffer)
    resumed.net.eval()
    with torch.no_grad():
        after = resumed.net(probe)
    assert torch.equal(before[0], after[0]) and torch.equal(before[1], after[1])
    # The RNG stream continues exactly where the saved trainer left off.
    t2 = Trainer(tmp_path, tiny_run_config(), torch.device('cpu'))
    t2.resume()
    np.testing.assert_array_equal(t2.rng.integers(1 << 30, size=3), next_random)

    # Damage the newest checkpoint: loading falls back to the previous one.
    newest = sorted((tmp_path / 'checkpoints').glob('iter_*.pt'))[-1]
    newest.write_bytes(b'corrupted')
    t3 = Trainer(tmp_path, tiny_run_config(), torch.device('cpu'))
    assert t3.resume()
    assert t3.iteration == 1
    assert len(t3.ckpt.read_metrics()) == 2
