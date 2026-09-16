import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.hailing_state import ACTIVE_DRIVER_STATUSES, ACTIVE_PASSENGER_STATUSES
from app.services.hailing_trip_service import active_trip_for_user


class HailingActiveTripReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_driver_read_uses_index_order_and_limit_one(self):
        expected = {"id": "trip-driver-new", "created_at": "2026-09-16T01:00:00Z"}
        with patch.object(database, "find_many", new=AsyncMock(return_value=[expected])) as mocked_find_many:
            result = await active_trip_for_user({"id": "driver-user-1", "role": "driver"})

        self.assertEqual(result, expected)
        mocked_find_many.assert_awaited_once()
        args, kwargs = mocked_find_many.await_args
        self.assertEqual(args[0], "hailing_trips")
        self.assertEqual(args[1]["driver_user_id"], "driver-user-1")
        self.assertEqual(set(args[1]["status"]["$in"]), set(ACTIVE_DRIVER_STATUSES))
        self.assertEqual(kwargs, {"sort": [("created_at", -1)], "limit": 1})

    async def test_passenger_read_uses_index_order_and_limit_one(self):
        expected = {"id": "trip-passenger-new", "created_at": "2026-09-16T01:00:00Z"}
        with patch.object(database, "find_many", new=AsyncMock(return_value=[expected])) as mocked_find_many:
            result = await active_trip_for_user({"id": "passenger-user-1", "role": "customer"})

        self.assertEqual(result, expected)
        mocked_find_many.assert_awaited_once()
        args, kwargs = mocked_find_many.await_args
        self.assertEqual(args[0], "hailing_trips")
        self.assertEqual(args[1]["passenger_user_id"], "passenger-user-1")
        self.assertEqual(set(args[1]["status"]["$in"]), set(ACTIVE_PASSENGER_STATUSES))
        self.assertEqual(kwargs, {"sort": [("created_at", -1)], "limit": 1})

    async def test_memory_read_returns_newest_matching_active_trip(self):
        original_db = database.db
        original_trips = list(database.memory["hailing_trips"])
        database.db = None
        database.memory["hailing_trips"] = [
            {
                "id": "old-active",
                "passenger_user_id": "passenger-user-1",
                "status": next(iter(ACTIVE_PASSENGER_STATUSES)),
                "created_at": "2026-09-15T10:00:00Z",
            },
            {
                "id": "new-active",
                "passenger_user_id": "passenger-user-1",
                "status": next(iter(ACTIVE_PASSENGER_STATUSES)),
                "created_at": "2026-09-16T10:00:00Z",
            },
            {
                "id": "completed-newer",
                "passenger_user_id": "passenger-user-1",
                "status": "COMPLETED",
                "created_at": "2026-09-17T10:00:00Z",
            },
            {
                "id": "other-user",
                "passenger_user_id": "passenger-user-2",
                "status": next(iter(ACTIVE_PASSENGER_STATUSES)),
                "created_at": "2026-09-18T10:00:00Z",
            },
        ]
        try:
            result = await active_trip_for_user({"id": "passenger-user-1", "role": "customer"})
        finally:
            database.db = original_db
            database.memory["hailing_trips"] = original_trips

        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "new-active")

    async def test_returns_none_when_no_active_trip_exists(self):
        with patch.object(database, "find_many", new=AsyncMock(return_value=[])):
            result = await active_trip_for_user({"id": "passenger-user-1", "role": "customer"})
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
