"""The bitboard / cached fast paths must reproduce the Stage 6A implementations exactly.

reference.py holds the original code. Positions come from the TS fixtures plus random games that
place many walls (maze-like boards, long detours, players out of walls), from both sides.
"""

import json
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from quoridor_az import bitboard as bb
from quoridor_az import engine as E
from quoridor_az import features as F
from quoridor_az import reference as R

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures' / 'engine_fixtures.json'


def random_states(seed: int, games: int, wall_prob: float) -> list[E.GameState]:
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(games):
        s = E.create_initial_state()
        for _ in range(160):
            out.append(s)
            walls = R.legal_wall_placements(s) if rng.random() < wall_prob else []
            moves = R.legal_pawn_moves(s)
            if walls:
                a = walls[int(rng.integers(len(walls)))]
            else:
                # Mostly greedy pawn moves so games end; sometimes random ones.
                if rng.random() < 0.7:
                    p = s.current_player
                    a = min(moves, key=lambda m: R.distance_to_row(s.h_walls, s.v_walls, (m.row, m.col), E.goal_row(p)))
                else:
                    a = moves[int(rng.integers(len(moves)))]
            s = E.apply_action_unchecked(s, a)
            if s.winner is not None:
                out.append(s)
                break
    return out


def fixture_states() -> list[E.GameState]:
    data = json.loads(FIXTURES.read_text(encoding='utf-8'))
    return [E.state_from_dict(c['state']) for c in data['cases']]


@pytest.fixture(scope='module')
def states() -> list[E.GameState]:
    all_states = fixture_states() + random_states(11, 12, 0.35) + random_states(12, 8, 0.8)
    assert sum(1 for s in all_states if bin(s.h_walls).count('1') + bin(s.v_walls).count('1') >= 15) > 50
    return all_states


def test_legal_actions_match_reference_in_order(states):
    for s in states:
        assert E.legal_action_indices(s) == R.legal_action_indices(s)
        assert E.legal_pawn_moves(s) == R.legal_pawn_moves(s)
        assert E.legal_actions(s) == R.legal_actions(s)


def test_legal_walls_match_brute_force(states):
    for s in states[::7]:
        assert E.legal_wall_placements(s) == R.legal_wall_placements_brute_force(s)


def test_distances_match_reference(states):
    for s in states[::3]:
        for target in (0, 8):
            assert E.distance_map(s.h_walls, s.v_walls, target) == R.distance_map(s.h_walls, s.v_walls, target)
        for p in (0, 1):
            assert E.distance_to_row(s.h_walls, s.v_walls, s.pawns[p], E.goal_row(p)) == R.distance_to_row(s.h_walls, s.v_walls, s.pawns[p], E.goal_row(p))


def test_wall_checks_match_reference(states):
    for s in states[::11]:
        for i in range(E.H_WALL_ACTION_OFFSET, E.ACTION_SPACE_SIZE):
            w = E.decode_action(i)
            assert E.check_wall_placement(s, w) == R.check_wall_placement(s, w)


def test_planes_are_bitwise_identical(states):
    for s in states:
        if s.winner is not None:
            continue
        fast = F.encode_state_planes(s)
        ref = R.encode_state_planes(s)
        assert fast.dtype == ref.dtype and fast.tobytes() == ref.tobytes()
        assert F.canonical_view(s) == R.canonical_view(s)


def test_batch_encoding_and_cold_cache_agree(states):
    sample = [s for s in states if s.winner is None][::5]
    warm = F.encode_batch(sample)
    F.clear_caches()
    cold = np.stack([F.encode_state_planes(s) for s in sample])
    assert warm.tobytes() == cold.tobytes()
    assert not F.wall_planes(0, 0).flags.writeable  # cached arrays cannot be modified by callers


def test_transitions_match_dataclass_replace(states):
    def old_apply(state, action):
        player = state.current_player
        if isinstance(action, E.Move):
            pawns = list(state.pawns)
            pawns[player] = (action.row, action.col)
            won = action.row == E.goal_row(player)
            return replace(state, pawns=(pawns[0], pawns[1]), current_player=player if won else 1 - player, winner=player if won else None, ply=state.ply + 1)
        h, v = E.with_wall(state.h_walls, state.v_walls, action.orientation, action.row, action.col)
        remaining = list(state.walls_remaining)
        remaining[player] -= 1
        return replace(state, h_walls=h, v_walls=v, walls_remaining=(remaining[0], remaining[1]), current_player=1 - player, ply=state.ply + 1)

    for s in states[::4]:
        for a in E.legal_actions(s)[:12]:
            assert E.apply_action_unchecked(s, a) == old_apply(s, a)


def test_bit_helpers():
    assert bb.bit_indices(0) == []
    assert bb.bit_indices((1 << 80) | (1 << 9) | 1, 5) == [5, 14, 85]
    assert F._reverse_mask(1) == 1 << 63 and F._reverse_mask(R._reverse_mask(12345)) == 12345
    info = bb.cache_info()
    assert set(info) >= {'open_masks', 'disconnecting_walls'}
