import numpy as np
import pytest

from quoridor_az import engine as E
from quoridor_az import features as F


def random_states(games=6, seed=1, plies=50):
    rng = np.random.default_rng(seed)
    for _ in range(games):
        s = E.create_initial_state()
        for _ in range(plies):
            if s.winner is not None:
                break
            yield s
            moves = E.legal_pawn_moves(s)
            pool = moves if rng.random() < 0.5 else E.legal_actions(s)
            s = E.apply_action(s, pool[int(rng.integers(len(pool)))])


def test_optimised_walls_equal_brute_force():
    n = 0
    for s in random_states():
        assert E.legal_wall_placements(s) == E.legal_wall_placements_brute_force(s)
        n += 1
    assert n > 100


def test_invariants_hold_in_random_playouts():
    for s in random_states(seed=2):
        assert s.pawns[0] != s.pawns[1]
        for p in (0, 1):
            assert E.has_path_to_row(s.h_walls, s.v_walls, s.pawns[p], E.goal_row(p))
        used = bin(s.h_walls).count('1') + bin(s.v_walls).count('1')
        assert used == 20 - sum(s.walls_remaining)
        assert s.h_walls & s.v_walls == 0  # an h and a v wall never share a center


def test_encoding_round_trip_and_notation():
    for i in range(E.ACTION_SPACE_SIZE):
        a = E.decode_action(i)
        assert E.encode_action(a) == i
    with pytest.raises(ValueError):
        E.decode_action(209)
    assert E.format_action(E.Move(8, 4)) == 'e1'
    assert E.format_action(E.Wall('h', 7, 4)) == 'e1h'
    assert E.parse_action(E.create_initial_state(), 'e2') == E.Move(7, 4)
    assert E.parse_action(E.create_initial_state(), 'e3') is None


def test_illegal_actions_raise_and_states_are_immutable():
    s = E.create_initial_state()
    with pytest.raises(E.IllegalActionError):
        E.apply_action(s, E.Move(6, 4))
    s2 = E.apply_action(s, E.Wall('h', 4, 4))
    assert s.h_walls == 0 and s.walls_remaining == (10, 10)
    assert s2.walls_remaining == (9, 10) and s2.current_player == 1


def test_win_and_create_state_validation():
    s = E.create_state(pawns=((1, 2), (5, 5)))
    end = E.apply_action(s, E.Move(0, 2))
    assert end.winner == 0 and end.current_player == 0
    assert E.legal_actions(end) == []
    with pytest.raises(ValueError):
        E.create_state(pawns=((4, 4), (4, 4)))
    with pytest.raises(ValueError):
        E.create_state(walls=(('h', 2, 2), ('v', 2, 2)))
    with pytest.raises(ValueError):
        E.create_state(pawns=((8, 4), (0, 0)), walls=(('h', 0, 0), ('v', 0, 1)))


def test_canonical_view_is_symmetric():
    """A position and its mirror image (players swapped, board rotated) encode identically."""
    for s in random_states(games=3, seed=3, plies=30):
        mirrored = E.GameState(
            pawns=((8 - s.pawns[1][0], 8 - s.pawns[1][1]), (8 - s.pawns[0][0], 8 - s.pawns[0][1])),
            h_walls=F._reverse_mask(s.h_walls),
            v_walls=F._reverse_mask(s.v_walls),
            walls_remaining=(s.walls_remaining[1], s.walls_remaining[0]),
            current_player=1 - s.current_player,
            winner=None,
            ply=s.ply,
        )
        np.testing.assert_array_equal(F.encode_state_planes(s), F.encode_state_planes(mirrored))
        np.testing.assert_array_equal(F.canonical_legal_mask(s), F.canonical_legal_mask(mirrored))


def test_canonical_action_index_is_an_involution():
    for p in (0, 1):
        for i in range(E.ACTION_SPACE_SIZE):
            assert F.canonical_action_index(F.canonical_action_index(i, p), p) == i
    perm = F.action_permutation(1)
    assert sorted(perm.tolist()) == list(range(209))
    policy = np.arange(209, dtype=np.float32)
    np.testing.assert_array_equal(F.view_policy_to_engine(F.engine_policy_to_view(policy, 1), 1), policy)
