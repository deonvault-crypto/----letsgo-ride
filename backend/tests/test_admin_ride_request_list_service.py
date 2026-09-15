import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.admin_ride_request_list_service import (
    list_admin_requests,
    list_admin_rides,
)


class _AsyncCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.index >= len(self.rows):
            raise StopAsyncIteration
        row = self.rows[self.index]
        self.index += 1
        return row


class _Collection:
    def __init__(self, rows):
        self.rows = list(rows)
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return _AsyncCursor(self.rows)


class _MongoDb:
    def __init__(self, collections):
        self.collections = dict(collections)

    def __getitem__(self, name):
        if name not in self.collections:
            raise AssertionError(f"unexpected raw collection access: {name}")
        return self.collections[name]


class AdminRideRequestListServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_rides = list(database.memory["rides"])
        self.original_requests = list(database.memory["ride_requests"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["rides"] = self.original_rides
        database.memory["ride_requests"] = self.original_requests

    async def test_memory_rides_preserve_filters_search_and_recent_order(self):
        database.db = None
        database.memory["rides"] = [
            {
                "id": "old",
                "origin": "Harare",
                "destination": "Mutare",
                "status": "SCHEDULED",
                "available_seats": 0,
                "created_at": "2026-09-14T10:00:00Z",
            },
            {
                "id": "new",
                "origin": "Harare",
                "destination": "Bulawayo",
                "status": "SCHEDULED",
                "available_seats": 0,
                "created_at": "2026-09-15T10:00:00Z",
            },
        ]
        enrich = AsyncMock(
            side_effect=lambda rows: [
                {**row, "pending_request_count": 1, "status": "SCHEDULED"}
                for row in rows
            ]
        )

        with patch("app.services.admin_ride_request_list_service.enrich_admin_rides", new=enrich):
            result = await list_admin_rides(
                search="harare",
                status="SCHEDULED",
                filter_name="full",
                limit=1,
            )

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "new")

    async def test_upcoming_filter_excludes_canonical_cancelled_rides(self):
        database.db = None
        database.memory["rides"] = [
            {"id": "cancelled", "status": "cancelled", "created_at": "2026-09-15T11:00:00Z"},
            {"id": "open", "status": "open", "created_at": "2026-09-15T10:00:00Z"},
        ]
        enrich = AsyncMock(
            side_effect=lambda rows: [
                {**row, "status": "CANCELLED" if row["id"] == "cancelled" else "SCHEDULED", "pending_request_count": 0}
                for row in rows
            ]
        )

        with patch("app.services.admin_ride_request_list_service.enrich_admin_rides", new=enrich):
            result = await list_admin_rides(
                search=None,
                status=None,
                filter_name="upcoming",
                limit=10,
            )

        self.assertEqual([row["id"] for row in result["items"]], ["open"])

    async def test_mongo_rides_enrich_only_bounded_batches_until_limit(self):
        raw_rows = [
            {"id": f"ride-{index}", "origin": "Other", "status": "SCHEDULED", "created_at": f"2026-09-15T10:{index:02d}:00Z"}
            for index in range(50)
        ] + [
            {"id": "target", "origin": "Needle", "status": "SCHEDULED", "created_at": "2026-09-15T09:00:00Z"},
            {"id": "after-target", "origin": "Needle", "status": "SCHEDULED", "created_at": "2026-09-15T08:00:00Z"},
        ]
        rides = _Collection(raw_rows)
        database.db = _MongoDb({"rides": rides})
        calls = []

        async def enrich(rows):
            calls.append(list(rows))
            return [{**row, "pending_request_count": 0} for row in rows]

        with patch(
            "app.services.admin_ride_request_list_service.enrich_admin_rides",
            new=AsyncMock(side_effect=enrich),
        ):
            result = await list_admin_rides(
                search="needle",
                status=None,
                filter_name=None,
                limit=1,
            )

        self.assertEqual(result["items"][0]["id"], "target")
        self.assertEqual([len(batch) for batch in calls], [50, 2])
        self.assertIn("$addFields", rides.pipeline[0])
        self.assertEqual(rides.pipeline[1], {"$sort": {"_admin_recent_at": -1}})
        self.assertNotIn({"$limit": 1}, rides.pipeline)

    async def test_memory_requests_preserve_status_and_derived_search(self):
        database.db = None
        database.memory["ride_requests"] = [
            {"id": "old", "status": "pending", "created_at": "2026-09-14T10:00:00Z"},
            {"id": "new", "status": "pending", "created_at": "2026-09-15T10:00:00Z"},
            {"id": "confirmed", "status": "confirmed", "created_at": "2026-09-16T10:00:00Z"},
        ]

        async def enrich(rows):
            return [
                {
                    **row,
                    "passenger_name": "Needle Passenger" if row["id"] == "new" else "Other",
                    "driver_name": "Driver",
                    "passenger_email": "p@example.com",
                    "driver_email": "d@example.com",
                    "ride_snapshot": {"origin": "Harare", "destination": "Mutare"},
                }
                for row in rows
            ]

        with patch(
            "app.services.admin_ride_request_list_service.enrich_admin_requests",
            new=AsyncMock(side_effect=enrich),
        ):
            result = await list_admin_requests(
                search="needle",
                status="pending",
                limit=10,
            )

        self.assertEqual([row["id"] for row in result["items"]], ["new"])

    async def test_mongo_requests_push_status_filter_and_batch_enrichment(self):
        raw_rows = [
            {"id": f"request-{index}", "status": "pending", "created_at": f"2026-09-15T10:{index:02d}:00Z"}
            for index in range(50)
        ] + [
            {"id": "target", "status": "pending", "created_at": "2026-09-15T09:00:00Z"}
        ]
        requests = _Collection(raw_rows)
        database.db = _MongoDb({"ride_requests": requests})
        calls = []

        async def enrich(rows):
            calls.append(list(rows))
            return [
                {
                    **row,
                    "passenger_name": "Needle" if row["id"] == "target" else "Other",
                    "driver_name": "Driver",
                    "passenger_email": "p@example.com",
                    "driver_email": "d@example.com",
                }
                for row in rows
            ]

        with patch(
            "app.services.admin_ride_request_list_service.enrich_admin_requests",
            new=AsyncMock(side_effect=enrich),
        ):
            result = await list_admin_requests(
                search="needle",
                status="pending",
                limit=1,
            )

        self.assertEqual(result["items"][0]["id"], "target")
        self.assertEqual([len(batch) for batch in calls], [50, 1])
        self.assertEqual(requests.pipeline[0], {"$match": {"status": "pending"}})
        self.assertIn("$addFields", requests.pipeline[1])


if __name__ == "__main__":
    unittest.main()
