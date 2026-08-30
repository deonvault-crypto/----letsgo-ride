from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.courier_scale_service import (
    COURIER_EVENT_LIMIT,
    COURIER_HISTORY_LIMIT,
    TELEMETRY_MIN_SECONDS,
    _telemetry_due,
    list_delivery_events_scaled,
    list_user_deliveries_scaled,
)
from app.services.ride_lifecycle_scale_service import (
    RIDE_LIFECYCLE_BATCH,
    sweep_ride_lifecycle_bounded,
)
from app.services.stripe_reconciliation_service import (
    STRIPE_RECONCILIATION_BATCH,
    reconcile_hailing_card_payments_bounded,
)


class ProductionScaleConsolidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_courier_history_is_bounded_and_newest_first(self):
        user = {"id": "courier-user", "role": "courier"}
        for index in range(COURIER_HISTORY_LIMIT + 25):
            await database.insert_one(
                "courier_deliveries",
                {
                    "id": f"delivery-{index:03d}",
                    "courier_user_id": user["id"],
                    "created_at": f"{index:03d}",
                },
            )
        rows = await list_user_deliveries_scaled(user)
        self.assertEqual(len(rows), COURIER_HISTORY_LIMIT)
        self.assertEqual(rows[0]["id"], "delivery-124")
        self.assertEqual(rows[-1]["id"], "delivery-025")

    async def test_courier_event_tail_is_bounded_and_chronological(self):
        user = {"id": "sender-user", "role": "passenger"}
        await database.insert_one(
            "courier_deliveries",
            {"id": "delivery-1", "sender_user_id": user["id"], "status": "DELIVERED"},
        )
        for index in range(COURIER_EVENT_LIMIT + 25):
            await database.insert_one(
                "courier_events",
                {
                    "id": f"event-{index:03d}",
                    "delivery_id": "delivery-1",
                    "created_at": f"{index:03d}",
                },
            )
        rows = await list_delivery_events_scaled("delivery-1", user)
        self.assertEqual(len(rows), COURIER_EVENT_LIMIT)
        self.assertEqual(rows[0]["id"], "event-025")
        self.assertEqual(rows[-1]["id"], "event-124")

    def test_courier_telemetry_watermark_downsamples_without_history_read(self):
        now = datetime.now(timezone.utc)
        recent = {
            "telemetry_last_persisted_at": (now - timedelta(seconds=TELEMETRY_MIN_SECONDS - 5)).isoformat(),
            "telemetry_last_latitude": -17.824858,
            "telemetry_last_longitude": 31.053028,
        }
        nearby = {"latitude": -17.8247, "longitude": 31.0532}
        far = {"latitude": -17.8180, "longitude": 31.053028}
        stale = {
            **recent,
            "telemetry_last_persisted_at": (now - timedelta(seconds=TELEMETRY_MIN_SECONDS + 5)).isoformat(),
        }
        self.assertFalse(_telemetry_due(recent, nearby, now))
        self.assertTrue(_telemetry_due(recent, far, now))
        self.assertTrue(_telemetry_due(stale, nearby, now))
        self.assertTrue(_telemetry_due({}, nearby, now))

    async def test_scheduled_ride_sweeper_never_processes_more_than_batch(self):
        for index in range(RIDE_LIFECYCLE_BATCH + 20):
            await database.insert_one(
                "rides",
                {
                    "id": f"ride-{index:03d}",
                    "status": "SCHEDULED",
                    "date": "2099-01-01",
                    "time": "12:00",
                    "is_demo": False,
                },
            )
        with patch(
            "app.services.ride_lifecycle_scale_service.apply_ride_lifecycle",
            new=AsyncMock(side_effect=lambda ride: ride),
        ) as apply_lifecycle:
            result = await sweep_ride_lifecycle_bounded()
        self.assertEqual(result["checked"], RIDE_LIFECYCLE_BATCH)
        self.assertEqual(apply_lifecycle.await_count, RIDE_LIFECYCLE_BATCH)

    async def test_stripe_reconciliation_only_reads_bounded_unresolved_terminal_work(self):
        for index in range(STRIPE_RECONCILIATION_BATCH + 20):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"completed-{index:03d}",
                    "payment_method": "card",
                    "payment_status": "capture_pending",
                    "status": "COMPLETED",
                    "updated_at": f"{index:03d}",
                },
            )
        # Historical settled rows must not be selected by the recovery worker.
        for index in range(100):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"settled-{index:03d}",
                    "payment_method": "card",
                    "payment_status": "paid",
                    "status": "COMPLETED",
                    "updated_at": f"settled-{index:03d}",
                },
            )

        with patch(
            "app.services.stripe_reconciliation_service.capture_hailing_trip_payment",
            new=AsyncMock(return_value="paid"),
        ) as capture, patch(
            "app.services.stripe_reconciliation_service.update_versioned_hailing_trip",
            new=AsyncMock(return_value=None),
        ), patch(
            "app.services.stripe_reconciliation_service.publish_hailing_trip_realtime",
            new=AsyncMock(return_value=None),
        ):
            result = await reconcile_hailing_card_payments_bounded()

        self.assertEqual(capture.await_count, STRIPE_RECONCILIATION_BATCH)
        self.assertEqual(result["captured"], STRIPE_RECONCILIATION_BATCH)

    async def test_terminal_failed_stripe_records_do_not_hot_loop(self):
        await database.insert_one(
            "hailing_trips",
            {
                "id": "failed-card-trip",
                "payment_method": "card",
                "payment_status": "failed",
                "status": "COMPLETED",
                "updated_at": "001",
            },
        )
        with patch(
            "app.services.stripe_reconciliation_service.capture_hailing_trip_payment",
            new=AsyncMock(return_value="capture_pending"),
        ) as capture, patch(
            "app.services.stripe_reconciliation_service.cancel_hailing_card_authorization",
            new=AsyncMock(return_value="cancel_pending"),
        ) as cancel:
            result = await reconcile_hailing_card_payments_bounded()

        self.assertEqual(capture.await_count, 0)
        self.assertEqual(cancel.await_count, 0)
        self.assertEqual(result, {"captured": 0, "released": 0, "deferred": 0})


if __name__ == "__main__":
    unittest.main()
