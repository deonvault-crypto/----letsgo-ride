from app.routers import ops, ops_live_map


def test_ops_terminal_hailing_statuses_include_no_driver_found():
    assert "NO_DRIVER_FOUND" in ops.FINAL_HAILING_STATUSES
    assert "no_driver_found" in ops.FINAL_HAILING_STATUSES


def test_ops_and_live_map_share_hailing_terminal_status_contract():
    assert ops.FINAL_HAILING_STATUSES == ops_live_map.FINAL_HAILING_STATUSES
