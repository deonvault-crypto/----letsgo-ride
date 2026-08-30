from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.courier_scale_service import (
    _persist_location_snapshot_if_due,
    list_delivery_events_scaled,
)
from app.services.database_scale_service import find_many_bounded
from app.services.hailing_scale_service import driver_stats_scaled, sweep_due_searching_trips
from app.services.ride_scale_service import RIDE_LIFECYCLE_BATCH, sweep_ride_lifecycle_scaled


class ScaleHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_bounded_query_sorts_and_limits_in_memory_mode(self):
        for index in range(150):
            await database.insert_one(
                "app_notifications",
                {
                    "id": f"notification-{index:03d}",
                    "user_id": "user-1",
                    "created_at": f"{index:03d}",
                },
            )

        rows = await find_many_bounded(
            "app_notifications",
            {"user_id": "user-1"},
            sort=[("created_at", -1)],
            limit=50,
        )

        self.assertEqual(len(rows), 50)
        self.assertEqual(rows[0]["id"], "notification-149")
        self.assertEqual(rows[-1]["id"], "notification-100")

    async def test_courier_telemetry_is_downsampled_but_large_movement_is_retained(self):
        first = {
            "id": "snapshot-1",
            "delivery_id": "delivery-1",
            "courier_user_id": "courier-1",
            "latitude": -17.824858,
            "longitude": 31.053028,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        nearby = {
            **first,
            "id": "snapshot-2",
            "latitude": -17.8247,
            "longitude": 31.0532,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        moved = {
            **first,
            "id": "snapshot-3",
            "latitude": -17.8180,
            "longitude": 31.053028,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }

        self.assertTrue(await _persist_location_snapshot_if_due(first))
        self.assertFalse(await _persist_location_snapshot_if_due(nearby))
        self.assertTrue(await _persist_location_snapshot_if_due(moved))

        rows = await database.find_many("courier_location_snapshots", {"delivery_id": "delivery-1"})
        self.assertEqual([row["id"] for row in rows], ["snapshot-1", "snapshot-3"])
        self.assertTrue(all(isinstance(row.get("expires_at"), datetime) for row in rows))

    async def test_courier_event_history_keeps_only_latest_hundred_in_chronological_order(self):
        user = {"id": "customer-1", "role": "passenger"}
        await database.insert_one(
            "courier_deliveries",
            {"id": "delivery-1", "sender_user_id": user["id"], "status": "DELIVERED"},
        )
        for index in range(150):
            await database.insert_one(
                "courier_events",
                {
                    "id": f"event-{index:03d}",
                    "delivery_id": "delivery-1",
                    "created_at": f"{index:03d}",
                },
            )

        events = await list_delivery_events_scaled("delivery-1", user)

        self.assertEqual(len(events), 100)
        self.assertEqual(events[0]["id"], "event-050")
        self.assertEqual(events[-1]["id"], "event-149")

    async def test_hailing_search_sweep_never_processes_more_than_one_bounded_batch(self):
        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        for index in range(150):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"trip-{index:03d}",
                    "status": "SEARCHING",
                    "next_dispatch_at": past,
                    "search_expires_at": past,
                },
            )

        with patch(
            "app.services.hailing_scale_service.close_search_no_driver",
            new=AsyncMock(return_value=None),
        ) as close_search:
            result = await sweep_due_searching_trips()

        self.assertEqual(result["checked"], 100)
        self.assertEqual(result["timed_out"], 100)
        self.assertEqual(close_search.await_count, 100)

    async def test_scheduled_ride_sweep_is_bounded(self):
        for index in range(RIDE_LIFECYCLE_BATCH + 25):
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
            "app.services.ride_scale_service.apply_ride_lifecycle",
            new=AsyncMock(side_effect=lambda ride: ride),
        ) as apply_lifecycle:
            result = await sweep_ride_lifecycle_scaled()

        self.assertEqual(result["checked"], RIDE_LIFECYCLE_BATCH)
        self.assertEqual(apply_lifecycle.await_count, RIDE_LIFECYCLE_BATCH)

    async def test_driver_stats_reads_only_harare_today(self):
        user = {"id": "driver-user", "role": "driver"}
        await database.insert_one(
            "drivers",
            {
                "id": "driver-1",
                "user_id": user["id"],
                "status": "approved",
                "verified": True,
                "verification_status": "approved",
            },
        )
        harare_tz = timezone(timedelta(hours=2))
        today_local = datetime.now(harare_tz).replace(hour=12, minute=0, second=0, microsecond=0)
        yesterday_local = today_local - timedelta(days=1)
        for trip_id, completed_at, fare in [
            ("today-1", today_local.astimezone(timezone.utc).isoformat(), 2.0),
            ("today-2", (today_local + timedelta(hours=1)).astimezone(timezone.utc).isoformat(), 3.0),
            ("old", yesterday_local.astimezone(timezone.utc).isoformat(), 99.0),
        ]:
            await database.insert_one(
                "hailing_trips",
                {
                    "id": trip_id,
                    "driver_id": "driver-1",
                    "status": "COMPLETED",
                    "completed_at": completed_at,
                    "fare": {"total_fare": fare, "platform_commission": fare * 0.03},
                },
            )

        result = await driver_stats_scaled(user)

        self.assertEqual(result["today_ride_count"], 2)
        self.assertEqual(result["today_gross_fares"], 5.0)
        self.assertEqual(result["today_platform_commission"], 0.15)
        self.assertEqual(result["today_estimated_earnings"], 4.85)


if __name__ == "__main__":
    unittest.main()
