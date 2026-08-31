from pathlib import Path


def test_worker_payout_history_index_has_single_startup_owner():
    product_source = Path("app/services/product_hardening_storage_service.py").read_text(encoding="utf-8")
    finance_source = Path("app/services/worker_finance_index_service.py").read_text(encoding="utf-8")

    assert 'name="worker_payout_history"' in product_source
    assert 'database.db["worker_payouts"].create_index' not in finance_source
    assert 'name="worker_payouts_by_user_status_time"' not in finance_source
