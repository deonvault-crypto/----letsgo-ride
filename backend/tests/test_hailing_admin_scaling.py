import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.routers.hailing import admin_hailing_drivers, admin_trips


class HailingAdminScalingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_driver_admin_page_is_bounded_and_batches_presence_lookup(self):
        for driver_id, name, created_at in (
            ("driver-c", "Charlie", "2026-08-30T03:00:00+00:00"),
            ("driver-a", "Alice", "2026-08-30T01:00:00+00:00"),
            ("driver-b", "Bob", "2026-08-30T02:00:00+00:00"),
        ):
            await database.insert_one(
                "drivers",
                {
                    "id": driver_id,
                    "name": name,
                    "created_at": created_at,
                    "hailing_enabled": True,
                },
            )
            await database.insert_one(
                "hailing_driver_presence",
                {
                    "id": f"presence-{driver_id}",
                    "driver_id": driver_id,
                    "status": "online",
                    "city_id": "zw-harare",
                    "ride_class": "ECONOMY",
                },
            )

        with patch.object(database, "find_one", side_effect=AssertionError("admin list must not use N+1 find_one calls")):
            response = await admin_hailing_drivers(
                limit=2,
                offset=1,
                user={"id": "admin", "role": "admin"},
            )

        rows = response["data"]
        self.assertEqual([row["id"] for row in rows], ["driver-b", "driver-c"])
        self.assertTrue(all(row["current_presence"]["status"] == "online" for row in rows))

    async def test_trip_admin_page_is_newest_first_and_bounded(self):
        for index in range(4):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"trip-{index}",
                    "status": "COMPLETED",
                    "created_at": f"2026-08-30T0{index}:00:00+00:00",
                },
            )

        response = await admin_trips(
            limit=2,
            offset=1,
            user={"id": "admin", "role": "admin"},
        )

        self.assertEqual([trip["id"] for trip in response["data"]], ["trip-2", "trip-1"])


if __name__ == "__main__":
    unittest.main()
