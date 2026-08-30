from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.routers.hailing import admin_hailing_drivers, admin_trips


class HailingAdminScaleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.admin = {"id": "admin-1", "role": "admin"}

    async def test_find_many_skip_applies_after_sort_and_before_limit(self):
        for index in range(6):
            await database.insert_one("audit_logs", {"id": f"row-{index}", "created_at": index})
        rows = await database.find_many(
            "audit_logs", sort=[("created_at", 1)], skip=2, limit=2
        )
        self.assertEqual([row["id"] for row in rows], ["row-2", "row-3"])

    async def test_admin_driver_page_bulk_loads_presence_without_n_plus_one(self):
        for index in range(5):
            driver_id = f"driver-{index}"
            await database.insert_one(
                "drivers",
                {
                    "id": driver_id,
                    "user_id": f"user-{index}",
                    "name": f"Driver {index}",
                    "created_at": f"2026-08-3{index}T12:00:00+00:00",
                    "hailing_enabled": True,
                },
            )
            await database.insert_one(
                "hailing_driver_presence",
                {"id": f"presence-{index}", "driver_id": driver_id, "status": "available"},
            )

        with patch.object(
            database,
            "find_one",
            new=AsyncMock(side_effect=AssertionError("N+1 presence lookup")),
        ):
            response = await admin_hailing_drivers(limit=2, offset=1, user=self.admin)

        page = response["data"]
        self.assertEqual(page["count"], 5)
        self.assertEqual(page["limit"], 2)
        self.assertEqual(page["offset"], 1)
        self.assertTrue(page["has_more"])
        self.assertEqual(len(page["items"]), 2)
        self.assertTrue(all(item["current_presence"] for item in page["items"]))

    async def test_admin_trip_page_is_bounded_and_can_filter_to_active(self):
        statuses = ["SEARCHING", "DRIVER_ARRIVED", "COMPLETED", "CANCELLED", "IN_PROGRESS"]
        for index, status in enumerate(statuses):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"trip-{index}",
                    "status": status,
                    "created_at": f"2026-08-3{index}T12:00:00+00:00",
                    "passenger_user_id": f"passenger-{index}",
                },
            )

        response = await admin_trips(
            limit=2, offset=0, active_only=True, status=None, user=self.admin
        )
        page = response["data"]
        self.assertEqual(page["count"], 3)
        self.assertEqual(len(page["items"]), 2)
        self.assertTrue(page["has_more"])
        self.assertTrue(
            all(item["status"] not in {"COMPLETED", "CANCELLED"} for item in page["items"])
        )


if __name__ == "__main__":
    unittest.main()
