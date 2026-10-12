"""Stage 6B-1: virtual-loss batching, instrumentation, halted-game policies, failure recovery."""

import numpy as np
import pytest

from quoridor_az import engine as E
from quoridor_az.evaluator import UniformEvaluator
from quoridor_az.mcts import MctsConfig, Search
from quoridor_az.replay import ReplayBuffer
from quoridor_az.report import estimate_resources, recommend_selfplay, recommend_train_batch
from quoridor_az.selfplay import SelfPlayConfig, play_games

torch = pytest.importorskip('torch')

from quoridor_az.evaluator import NeuralEvaluator  # noqa: E402
from quoridor_az.network import NetConfig, PolicyValueNet  # noqa: E402

SMALL = NetConfig(channels=16, blocks=1, value_hidden=16)


def all_nodes(node):
    yield node
    for c in node.children:
        if c is not None:
            yield from all_nodes(c)


# ---------------------------------------------------------------- MCTS with virtual loss

def test_single_leaf_steps_match_run_loop():
    s = E.create_state(pawns=((5, 4), (3, 3)), walls=(('h', 4, 3),), current_player=0)
    a = Search(s, MctsConfig(num_simulations=150)).run(UniformEvaluator())
    b = Search(s, MctsConfig(num_simulations=150))
    ev = UniformEvaluator()
    while not b.done():
        leaf = b.select_leaf()
        if leaf is not None:
            b.provide(ev.evaluate([leaf])[0])
    assert a.root.child_n.tolist() == b.root.child_n.tolist()
    assert np.array_equal(a.root.child_w, b.root.child_w)


@pytest.mark.parametrize('k', [2, 8, 32])
def test_virtual_loss_batches_are_exact_and_leave_no_residue(k):
    s = E.create_initial_state()
    search = Search(s, MctsConfig(num_simulations=200), np.random.default_rng(0))
    ev = UniformEvaluator()
    batches = []
    while not search.done():
        leaves = search.select_leaves(k)
        assert len(leaves) == len(set(id(x) for x in leaves))
        if leaves:
            batches.append(len(leaves))
            search.provide_many(ev.evaluate(leaves))
    assert search.simulations == 200  # budget respected exactly
    assert max(batches) > 1
    for node in all_nodes(search.root):
        assert node.inflight == 0 and not node.pending
        if node.expanded:
            assert node.vl is None or not node.vl.any()
            assert node.total == int(node.child_n.sum())
            visited = node.child_n > 0
            assert np.array_equal(node.child_q[visited], node.child_w[visited] / node.child_n[visited])
    # Every simulation after the first (which only expands the root) is one root visit.
    assert search.root.total == 199


def test_virtual_loss_spreads_leaves_and_reports_collisions():
    s = E.create_initial_state()
    search = Search(s, MctsConfig(num_simulations=64))
    ev = UniformEvaluator()
    search.provide_many(ev.evaluate(search.select_leaves(4)))  # root only: second descent collides
    assert search.collisions == 1 and search.simulations == 1
    leaves = search.select_leaves(8)
    assert len(leaves) == 8 and len(set(leaves)) == 8  # different children thanks to virtual loss
    search.cancel_pending()
    for node in all_nodes(search.root):
        assert node.inflight == 0 and not node.pending
    assert search.simulations == 1


def test_terminal_leaves_finish_inside_select():
    s = E.create_state(pawns=((1, 4), (7, 4)), current_player=0)
    search = Search(s, MctsConfig(num_simulations=30))
    search.run(UniformEvaluator(), leaves_per_batch=4)
    assert search.terminal_hits > 0 and search.simulations == 30


# ---------------------------------------------------------------- self-play

def test_selfplay_with_several_leaves_and_instrumentation():
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=24, root_noise=True), max_plies=40, parallel_games=3, leaves_per_game=4, halted_policy='policy-only')
    ev = UniformEvaluator()
    samples, records, stats = play_games(ev, cfg, num_games=3, seed=2)
    d = stats.to_dict()
    assert stats.games == 3 and stats.moves == sum(r.plies for r in records)
    assert d['leaves_per_round'] > 3  # more than one leaf per game per round
    for key in ('select_seconds', 'eval_seconds', 'backup_seconds', 'move_seconds', 'cpu_seconds'):
        assert d[key] >= 0
    assert stats.evaluator['positions'] == stats.nn_positions
    halted = [r for r in records if r.outcome != 'win']
    assert stats.samples_value_masked == sum(r.plies for r in halted)
    assert stats.samples_kept == sum(r.plies for r in records)  # nothing discarded
    assert all(s.value_weight in (0.0, 1.0) for s in samples)
    assert all(s.value == 0.0 for s in samples if s.value_weight == 0.0)


def test_policy_only_keeps_exactly_what_discard_drops():
    base = dict(mcts=MctsConfig(num_simulations=8, root_noise=True), max_plies=30, parallel_games=2)
    s1, r1, st1 = play_games(UniformEvaluator(), SelfPlayConfig(halted_policy='discard', **base), 4, seed=5)
    s2, r2, st2 = play_games(UniformEvaluator(), SelfPlayConfig(halted_policy='policy-only', **base), 4, seed=5)
    assert [r.moves for r in r1] == [r.moves for r in r2]  # same games
    assert st2.samples_kept == st1.samples_kept + st1.samples_discarded
    assert st2.samples_value_masked == st1.samples_discarded


def test_time_budget_abandons_unfinished_games():
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=16, root_noise=True), parallel_games=2)
    samples, records, stats = play_games(UniformEvaluator(), cfg, num_games=50, seed=1, time_budget=0.3)
    assert stats.games < 50 and stats.abandoned == 50 - stats.games and stats.moves > 0


def test_failed_evaluator_releases_pending_leaves():
    class Failing(UniformEvaluator):
        def __init__(self):
            super().__init__()
            self.n = 0

        def evaluate(self, states):
            self.n += 1
            if self.n == 5:
                raise RuntimeError('boom')
            return super().evaluate(states)

    with pytest.raises(RuntimeError, match='boom'):
        play_games(Failing(), SelfPlayConfig(mcts=MctsConfig(num_simulations=16), parallel_games=2, leaves_per_game=4), 2, seed=0)


# ---------------------------------------------------------------- evaluator

def test_evaluator_splits_batches_on_out_of_memory_and_respects_max_batch():
    class Flaky(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.inner = PolicyValueNet(SMALL).eval()

        def forward(self, x):
            if x.shape[0] > 3:
                raise torch.cuda.OutOfMemoryError('simulated')
            return self.inner(x)

    states = []
    s = E.create_initial_state()
    for a in E.legal_actions(s)[:10]:
        states.append(E.apply_action_unchecked(s, a))
    torch.manual_seed(0)
    flaky = Flaky()
    ref = NeuralEvaluator(flaky.inner, torch.device('cpu')).evaluate(states)
    out = NeuralEvaluator(flaky, torch.device('cpu')).evaluate(states)
    ev = NeuralEvaluator(flaky, torch.device('cpu'))
    ev.evaluate(states)
    assert ev.stats.oom_splits > 0
    for a, b in zip(ref, out):
        np.testing.assert_allclose(a.priors, b.priors, atol=1e-6)
    capped = NeuralEvaluator(flaky.inner, torch.device('cpu'), max_batch=3)
    capped.evaluate(states)
    assert capped.stats.nn_calls == 4


def test_evaluator_cache_smaller_than_batch_and_precision_validation():
    states = [E.apply_action_unchecked(E.create_initial_state(), a) for a in E.legal_actions(E.create_initial_state())[:6]]
    ev = NeuralEvaluator(PolicyValueNet(SMALL), torch.device('cpu'), cache_size=2)
    out = ev.evaluate(states + states[:2])
    assert len(out) == 8 and ev.stats.duplicates == 2
    with pytest.raises(ValueError):
        NeuralEvaluator(PolicyValueNet(SMALL), torch.device('cpu'), precision='int8')


# ---------------------------------------------------------------- training data / recovery

def test_value_weight_zero_does_not_train_the_value_head():
    from quoridor_az.features import canonical_legal_mask, encode_state_planes
    from quoridor_az.train import TrainConfig, compute_losses, to_tensors

    torch.manual_seed(0)
    net = PolicyValueNet(SMALL)
    s = E.create_initial_state()
    batch = {
        'planes': encode_state_planes(s)[None].repeat(4, axis=0),
        'policy': np.full((4, 209), 1 / 131, dtype=np.float32) * canonical_legal_mask(s),
        'mask': canonical_legal_mask(s)[None].repeat(4, axis=0),
        'value': np.ones(4, dtype=np.float32),
        'value_weight': np.zeros(4, dtype=np.float32),
    }
    losses = compute_losses(net, to_tensors(batch, torch.device('cpu')), TrainConfig().value_weight)
    assert float(losses['value_loss'].detach()) == 0.0
    losses['loss'].backward()
    value_head = [p for n, p in net.named_parameters() if n.startswith('value')]
    assert value_head and all(p.grad is None or float(p.grad.abs().sum()) == 0.0 for p in value_head)


def test_replay_v1_files_load_with_unit_weights(tmp_path):
    path = tmp_path / 'old.npz'
    n = 3
    np.savez_compressed(
        path,
        format=np.array('qz-replay-v1'),
        capacity=np.array(10),
        cursor=np.array(n),
        total_added=np.array(n),
        planes=np.zeros((n, 11, 9, 9), dtype=np.float16),
        policy=np.zeros((n, 209), dtype=np.float32),
        mask=np.zeros((n, 209), dtype=bool),
        value=np.array([1, -1, 1], dtype=np.float32),
        player=np.zeros(n, dtype=np.int8),
    )
    buf = ReplayBuffer.load(path)
    assert len(buf) == 3 and buf.value_weight[:3].tolist() == [1.0, 1.0, 1.0] and buf.iteration == -1


def tiny_config(seed=4):
    from quoridor_az.pipeline import EvalConfig, RunConfig
    from quoridor_az.train import TrainConfig

    return RunConfig(
        seed=seed,
        games_per_iteration=2,
        replay_capacity=400,
        net=SMALL,
        selfplay=SelfPlayConfig(mcts=MctsConfig(num_simulations=4, root_noise=True), max_plies=24, parallel_games=2, leaves_per_game=2, halted_policy='policy-only'),
        train=TrainConfig(batch_size=8, steps_per_iteration=2),
        eval=EvalConfig(pairs=1, simulations=2, opening_plies=0),
    )


def test_failed_iteration_rolls_back_to_the_checkpoint(tmp_path, monkeypatch):
    from quoridor_az import pipeline

    t = pipeline.Trainer(tmp_path, tiny_config(), torch.device('cpu'))
    t.run_iteration(log=lambda *_: None)
    saved = (t.iteration, t.train_steps, len(t.buffer), t.rng.bit_generator.state)

    def broken_train_step(*args, **kwargs):
        raise RuntimeError('simulated CUDA failure')

    monkeypatch.setattr(pipeline, 'train_step', broken_train_step)
    messages = []
    with pytest.raises(RuntimeError, match='simulated'):
        t.run_iteration(log=messages.append)
    assert 'rolled back to checkpoint iteration 1' in messages[-1]
    assert (t.iteration, t.train_steps, len(t.buffer), t.rng.bit_generator.state) == saved
    monkeypatch.undo()
    row = t.run_iteration(log=lambda *_: None)
    assert row['iteration'] == 2 and [r['iteration'] for r in t.ckpt.read_metrics()] == [1, 2]
    assert row['data']['halted_policy'] == 'policy-only' and 'checkpoint' in row


def test_failure_before_any_checkpoint_resets_to_initial_state(tmp_path, monkeypatch):
    from quoridor_az import pipeline

    t = pipeline.Trainer(tmp_path, tiny_config(), torch.device('cpu'))
    fresh_state = {k: v.clone() for k, v in t.net.state_dict().items()}
    monkeypatch.setattr(pipeline, 'train_step', lambda *a, **k: (_ for _ in ()).throw(RuntimeError('x')))
    with pytest.raises(RuntimeError):
        t.run_iteration(log=lambda *_: None)
    assert t.iteration == 0 and len(t.buffer) == 0
    assert all(torch.equal(v, t.net.state_dict()[k]) for k, v in fresh_state.items())


def test_pilot_requires_gpu_verification_and_runs_as_cpu_dry_run(tmp_path):
    from quoridor_az.pilot import run_pilot

    with pytest.raises(RuntimeError, match='CUDA'):
        run_pilot(tmp_path, tiny_config(), 1, torch.device('cpu'))
    report = run_pilot(tmp_path, tiny_config(), 2, torch.device('cpu'), require_gpu=False, log=lambda *_: None)
    assert report['dry_run_on_cpu'] and len(report['iterations']) == 2
    res = report['checks']['resume']
    assert res['restored'] and res['outputs_identical'] and res['rng_matches'] and res['buffer_matches']
    assert (tmp_path / 'pilot_report.json').exists()


# ---------------------------------------------------------------- reports

def test_recommendations_and_estimates():
    rows = [
        {'parallel_games': 2, 'leaves_per_game': 1, 'simulations_per_second': 500, 'peak_memory_mb': 100},
        {'parallel_games': 16, 'leaves_per_game': 1, 'simulations_per_second': 1900, 'peak_memory_mb': 200},
        {'parallel_games': 32, 'leaves_per_game': 1, 'simulations_per_second': 2000, 'peak_memory_mb': 300},
        {'parallel_games': 64, 'leaves_per_game': 4, 'error': 'out of memory'},
    ]
    pick = recommend_selfplay(rows, memory_total_mb=15000)
    assert pick['parallel_games'] == 16  # within 10 % of the best, smaller
    assert recommend_selfplay(rows, memory_total_mb=150)['parallel_games'] == 2  # memory cap (80 % of 150 MB)
    tb = recommend_train_batch([{'batch': 256, 'seconds': 0.1, 'samples_per_second': 2560}, {'batch': 512, 'seconds': 0.19, 'samples_per_second': 2700}])
    assert tb['batch_size'] == 256
    est = estimate_resources(1000.0, 0.1, {'iterations': 10, 'games_per_iteration': 100, 'simulations': 100, 'avg_plies': 100, 'train_steps_per_iteration': 100, 'replay_capacity': 100_000})
    assert est['simulations'] == 10 * 100 * 100 * 100
    assert est['selfplay_hours'] == pytest.approx(1e7 / 1000 / 3600)


def test_verification_on_cpu_is_labelled_and_never_claims_gpu(tmp_path):
    from quoridor_az.report import markdown_summary
    from quoridor_az.verify import load_latest, run_verification

    report = run_verification(tmp_path, torch.device('cpu'), net_config=SMALL, quick=True, parallel=(2,), leaves=(1,), selfplay_simulations=8, selfplay_seconds=1.0, log=lambda *_: None)
    assert report['measured_on'] == 'cpu' and report['gpu_verified'] is False
    assert all(v == 'ok' for v in report['status'].values()), report['status']
    assert report['checkpoint']['identical_outputs']
    assert report['selfplay'][0]['cpu_side_us_per_simulation'] > 0
    assert load_latest(tmp_path, 'cpu')['created'] == report['created']
    assert load_latest(tmp_path, 'cuda') is None
    assert 'gpu_verified: False' in markdown_summary(report)
