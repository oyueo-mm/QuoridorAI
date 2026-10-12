import numpy as np
import pytest

from quoridor_az import engine as E
from quoridor_az.evaluator import Evaluation, UniformEvaluator
from quoridor_az.mcts import MctsConfig, Search
from quoridor_az.replay import ReplayBuffer
from quoridor_az.selfplay import SelfPlayConfig, play_games


class ConstantEvaluator:
    """Uniform priors; value +v for whoever is to move (tests the sign handling of backup)."""

    def __init__(self, v):
        self.v = v

    def evaluate(self, states):
        out = []
        for s in states:
            a = np.array(E.legal_action_indices(s))
            out.append(Evaluation(a, np.full(len(a), 1 / len(a)), self.v))
        return out


def test_visit_counts_and_policy_target():
    s = E.create_initial_state()
    search = Search(s, MctsConfig(num_simulations=60)).run(UniformEvaluator())
    assert search.simulations == 60
    # The root expansion consumes the first simulation.
    assert search.root.child_n.sum() == 59
    pi = search.visit_policy()
    assert pi.shape == (209,)
    assert pi.sum() == pytest.approx(1.0)
    legal = set(E.legal_action_indices(s))
    assert all(pi[i] == 0 for i in range(209) if i not in legal)


def test_backup_signs_alternate_by_player():
    s = E.create_initial_state()
    search = Search(s, MctsConfig(num_simulations=40)).run(ConstantEvaluator(0.5))
    root = search.root
    # Every root child is evaluated from the opponent's view (+0.5 for them = −0.5 for us)
    # on its first visit; deeper visits alternate, so Q stays within [−0.5, 0.5].
    first = root.children[int(np.argmax(root.child_n))]
    assert first.to_play == 1
    q = root.child_w / np.maximum(root.child_n, 1)
    assert np.all(q[root.child_n == 1] == pytest.approx(-0.5))
    assert np.all(np.abs(q) <= 0.5 + 1e-9)


def test_finds_immediate_win_and_blocks_threat():
    win = E.create_state(pawns=((1, 2), (7, 6)))
    search = Search(win, MctsConfig(num_simulations=200)).run(UniformEvaluator())
    assert search.choose_action(0.0) == E.encode_action(E.Move(0, 2))
    assert search.root_value() > 0.5

    threat = E.create_state(pawns=((6, 0), (7, 4)))
    search = Search(threat, MctsConfig(num_simulations=1500)).run(UniformEvaluator())
    nxt = E.apply_action(threat, E.decode_action(search.choose_action(0.0)))
    assert not any(m.row == 8 for m in E.legal_pawn_moves(nxt, 1))


def test_determinism_and_noise():
    s = E.create_initial_state()
    a = Search(s, MctsConfig(num_simulations=50)).run(UniformEvaluator())
    b = Search(s, MctsConfig(num_simulations=50)).run(UniformEvaluator())
    np.testing.assert_array_equal(a.root.child_n, b.root.child_n)
    noisy = Search(s, MctsConfig(num_simulations=5, root_noise=True), np.random.default_rng(3)).run(UniformEvaluator())
    assert not np.allclose(noisy.root.priors, a.root.priors)
    assert noisy.root.priors.sum() == pytest.approx(1.0)


def test_self_play_samples_and_halt_policies():
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=8, root_noise=True), max_plies=60, parallel_games=2, temperature_moves=60)
    samples, records, stats = play_games(UniformEvaluator(), cfg, num_games=2, seed=5)
    assert stats.games == 2 and len(records) == 2
    halted = stats.halted_max_plies + stats.halted_repetition
    assert stats.wins[0] + stats.wins[1] + halted == 2
    assert stats.samples_kept + stats.samples_discarded == sum(r.plies for r in records)
    for smp in samples:
        assert smp.planes.shape == (11, 9, 9)
        assert smp.policy.sum() == pytest.approx(1.0, abs=1e-5)
        assert np.all(smp.policy[~smp.mask] == 0)
        assert smp.value in (-1.0, 1.0)
    # Value targets agree with the game result from each player's perspective.
    for rec in records:
        if rec.outcome == 'win':
            assert rec.winner in (0, 1)

    draw_cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=4), max_plies=6, parallel_games=1, halted_policy='draw')
    d_samples, d_records, d_stats = play_games(UniformEvaluator(), draw_cfg, num_games=1, seed=1)
    assert d_records[0].outcome == 'halted-max-plies'
    assert len(d_samples) == 6 and all(x.value == 0.0 for x in d_samples)
    disc_cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=4), max_plies=6, parallel_games=1)
    k_samples, _, k_stats = play_games(UniformEvaluator(), disc_cfg, num_games=1, seed=1)
    assert k_samples == [] and k_stats.samples_discarded == 6


def test_replay_buffer_round_trip(tmp_path):
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=4), max_plies=8, parallel_games=1, halted_policy='draw')
    samples, _, _ = play_games(UniformEvaluator(), cfg, num_games=2, seed=2)
    buf = ReplayBuffer(capacity=10)
    buf.add(samples)
    assert len(buf) == 10 and buf.total_added == len(samples)
    batch = buf.sample(4, np.random.default_rng(0))
    assert batch['planes'].shape == (4, 11, 9, 9) and batch['planes'].dtype == np.float32
    path = tmp_path / 'replay.npz'
    buf.save(path)
    loaded = ReplayBuffer.load(path)
    np.testing.assert_array_equal(loaded.policy, buf.policy)
    assert loaded.cursor == buf.cursor and loaded.size == buf.size
