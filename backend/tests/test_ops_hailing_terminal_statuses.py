from app.routers import ops, ops_live_map
from app.services.hailing_state import FINAL_STATUSES


def test_ops_terminal_hailing_statuses_cover_canonical_state_machine():
    assert FINAL_STATUSES.issubset(ops.FINAL_HAILING_STATUSES)
    assert {status.lower() for status in FINAL_STATUSES}.issubset(ops.FINAL_HAILING_STATUSES)


def test_ops_and_live_map_share_hailing_terminal_status_contract():
    assert ops.FINAL_HAILING_STATUSES == ops_live_map.FINAL_HAILING_STATUSES
