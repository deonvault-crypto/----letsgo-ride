import unittest
from unittest.mock import AsyncMock, patch

from app.services import data_retention_consistency_service as consistency


class DataRetentionConsistencyTests(unittest.IsolatedAsyncioTestCase):
    def test_completed_shared_rides_do_not_create_actionable_request_workload(self):
        rides = [
            {"id": "ride-1", "status": "COMPLETED"},
            {"id": "ride-2", "status": "COMPLETED"},
        ]
        requests = [
            {"id": "request-1", "ride_id": "ride-1", "status": "pending"},
            {"id": "request-2", "ride_id": "ride-1", "status": "confirmed"},
            {"id": "request-3", "ride_id": "ride-2", "status": "pending"},
        ]

        self.assertEqual(
            consistency.actionable_shared_ride_request_status_counts(requests, rides),
            {"pending": 0, "confirmed": 0},
        )

    def test_active_shared_rides_keep_pending_and_confirmed_requests_actionable(self):
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

        self.assertEqual(
            consistency.actionable_shared_ride_request_status_counts(requests, rides),
            {"pending": 1, "confirmed": 1},
        )

    async def test_existing_approved_driver_reconciles_submitted_worker_application(self):
        application = {
            "id": "worker-1",
            "user_id": "user-1",
            "product": "driver",
            "status": "SUBMITTED",
        }
        approved_driver = {
            "id": "driver-1",
            "user_id": "user-1",
            "status": "approved",
            "verification_status": "approved",
        }

        with patch.object(consistency.database, "find_one", AsyncMock(return_value=approved_driver)):
            reconciled = await consistency.reconcile_worker_application_status(application)

        self.assertEqual(reconciled["status"], "APPROVED")
        self.assertEqual(reconciled["stored_status"], "SUBMITTED")
        self.assertEqual(reconciled["status_source"], "driver_profile")
        self.assertEqual(application["status"], "SUBMITTED")

    async def test_unapproved_driver_application_remains_submitted(self):
        application = {
            "id": "worker-1",
            "user_id": "user-1",
            "product": "driver",
            "status": "SUBMITTED",
        }
        pending_driver = {
            "id": "driver-1",
            "user_id": "user-1",
            "status": "pending_review",
        }

        with patch.object(
            consistency.database,
            "find_one",
            AsyncMock(side_effect=[pending_driver, None]),
        ):
            reconciled = await consistency.reconcile_worker_application_status(application)

        self.assertEqual(reconciled["status"], "SUBMITTED")
        self.assertNotIn("stored_status", reconciled)
        self.assertNotIn("status_source", reconciled)


if __name__ == "__main__":
    unittest.main()
