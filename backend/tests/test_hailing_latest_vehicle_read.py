import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.hailing_trip_service import latest_vehicle


class HailingLatestVehicleReadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_vehicles = list(database.memory["vehicles"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["vehicles"] = self.original_vehicles

    async def test_latest_vehicle_uses_newest_first_bounded_query(self):
        expected = {
            "id": "vehicle-new",
            "driver_id": "driver-1",
            "created_at": "2026-09-16T10:00:00Z",
        }
        with patch.object(database, "find_many", new=AsyncMock(return_value=[expected])) as mocked_find_many:
            result = await latest_vehicle({"id": "driver-1"})

        self.assertEqual(result, expected)
        mocked_find_many.assert_awaited_once_with(
            "vehicles",
            {"driver_id": "driver-1"},
            sort=[("created_at", -1)],
            limit=1,
        )

    async def test_memory_read_preserves_newest_vehicle_semantics(self):
        database.db = None
        database.memory["vehicles"] = [
            {
                "id": "vehicle-old",
                "driver_id": "driver-1",
                "created_at": "2026-09-15T10:00:00Z",
            },
            {
                "id": "other-driver-newer",
                "driver_id": "driver-2",
                "created_at": "2026-09-17T10:00:00Z",
            },
            {
                "id": "vehicle-new",
                "driver_id": "driver-1",
                "created_at": "2026-09-16T10:00:00Z",
            },
        ]

        result = await latest_vehicle({"id": "driver-1"})

        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "vehicle-new")

    async def test_latest_vehicle_returns_none_when_driver_has_no_vehicle(self):
        with patch.object(database, "find_many", new=AsyncMock(return_value=[])):
            result = await latest_vehicle({"id": "driver-1"})

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
