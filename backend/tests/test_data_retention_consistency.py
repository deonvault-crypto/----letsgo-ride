import pytest

from app.services import data_retention_consistency_service as consistency


def test_completed_shared_rides_do_not_create_actionable_request_workload():
    rides = [
        {"id": "ride-1", "status": "COMPLETED"},
        {"id": "ride-2", "status": "COMPLETED"},
    ]
    requests = [
        {"id": "request-1", "ride_id": "ride-1", "status": "pending"},
        {"id": "request-2", "ride_id": "ride-1", "status": "confirmed"},
        {"id": "request-3", "ride_id": "ride-2", "status": "pending"},
    ]

    assert consistency.actionable_shared_ride_request_status_counts(requests, rides) == {
        "pending": 0,
        "confirmed": 0,
    }


def test_active_shared_rides_keep_pending_and_confirmed_requests_actionable():
    rides = [
        {"id": "ride-scheduled", "status": "SCHEDULED"},
        {"id": "ride-open", "status": "OPEN"},
        {"id": "ride-complete", "status": "COMPLETED"},
    ]
    requests = [
        {"ride_id": "ride-scheduled", "status": "pending"},
        {"ride_id": "ride-open", "status": "confirmed"},
        {"ride_id": "ride-complete", "status": "pending"},
        {"ride_id": "ride-scheduled", "status": "cancelled"},
    ]

    assert consistency.actionable_shared_ride_request_status_counts(requests, rides) == {
        "pending": 1,
        "confirmed": 1,
    }


@pytest.mark.asyncio
async def test_existing_approved_driver_reconciles_submitted_worker_application(monkeypatch):
    async def fake_find_one(collection, filters):
        if collection == "drivers":
            return {
                "id": "driver-1",
                "user_id": filters["user_id"],
                "status": "approved",
                "verification_status": "approved",
            }
        raise AssertionError(f"Unexpected lookup: {collection}")

    monkeypatch.setattr(consistency.database, "find_one", fake_find_one)
    application = {
        "id": "worker-1",
        "user_id": "user-1",
        "product": "driver",
        "status": "SUBMITTED",
    }

    reconciled = await consistency.reconcile_worker_application_status(application)

    assert reconciled["status"] == "APPROVED"
    assert reconciled["stored_status"] == "SUBMITTED"
    assert reconciled["status_source"] == "driver_profile"
    assert application["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_unapproved_driver_application_remains_submitted(monkeypatch):
    async def fake_find_one(collection, filters):
        if collection == "drivers":
            return {"id": "driver-1", "user_id": filters["user_id"], "status": "pending_review"}
        if collection == "driver_applications":
            return None
        raise AssertionError(f"Unexpected lookup: {collection}")

    monkeypatch.setattr(consistency.database, "find_one", fake_find_one)
    application = {
        "id": "worker-1",
        "user_id": "user-1",
        "product": "driver",
        "status": "SUBMITTED",
    }

    reconciled = await consistency.reconcile_worker_application_status(application)

    assert reconciled["status"] == "SUBMITTED"
    assert "stored_status" not in reconciled
    assert "status_source" not in reconciled
