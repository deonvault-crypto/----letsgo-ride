import inspect
import pytest

from app.routers import admin as admin_router
from app.routers.admin import (
    _is_pending_driver_verification,
    _is_verified_driver_verification,
    _status_tone,
)


@pytest.mark.parametrize("status", ["approved", "verified", "active"])
def test_admin_counts_current_approved_driver_statuses(status):
    assert _is_verified_driver_verification(status) is True
    assert _status_tone(status) == "success"


@pytest.mark.parametrize(
    "status",
    ["pending", "pending_uploads", "pending_auto_check", "needs_review", "needs_resubmission"],
)
def test_admin_counts_all_actionable_verification_statuses(status):
    assert _is_pending_driver_verification(status) is True
    assert _status_tone(status) == "warning"


def test_rejected_verification_is_not_counted_as_pending_or_approved():
    assert _is_pending_driver_verification("rejected") is False
    assert _is_verified_driver_verification("rejected") is False
    assert _status_tone("rejected") == "danger"


def test_live_admin_overview_uses_counts_and_bounded_recent_tails():
    source = inspect.getsource(admin_router.overview)
    assert 'database.count("users")' in source
    assert 'database.count("drivers", verified_filter)' in source
    assert 'limit=8' in source
    assert 'limit=6' in source
    assert 'database.find_many("users")' not in source
    assert 'apply_ride_lifecycle' not in source
