import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services.activity_service import get_customer_activity


class ActivitySnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.user = {"id": "activity-user", "role": "passenger", "name": "Tariro"}
        await database.insert_one("users", self.user)

    async def test_snapshot_composes_only_the_current_customers_domain_records(self):
        await database.insert_one("rides", {
            "id": "ride-1", "user_id": "driver-1", "origin": "Harare", "destination": "Mutare",
            "status": "SCHEDULED", "available_seats": 2, "date": "2026-09-01", "time": "08:00",
        })
        await database.insert_one("ride_requests", {
            "id": "request-1", "ride_id": "ride-1", "user_id": self.user["id"], "status": "confirmed",
        })
        await database.insert_one("ride_requests", {
            "id": "request-other", "ride_id": "ride-1", "user_id": "other-user", "status": "pending",
        })
        await database.insert_one("food_orders", {
            "id": "food-1", "customer_user_id": self.user["id"], "status": "PREPARING", "created_at": "2",
        })
        await database.insert_one("food_orders", {
            "id": "food-other", "customer_user_id": "other-user", "status": "DELIVERED", "created_at": "1",
        })
        await database.insert_one("courier_deliveries", {
            "id": "delivery-1", "sender_user_id": self.user["id"], "status": "MATCHING", "created_at": "2",
        })
        await database.insert_one("courier_deliveries", {
            "id": "delivery-other", "sender_user_id": "other-user", "status": "DELIVERED", "created_at": "1",
        })

        snapshot = await get_customer_activity(self.user)

        self.assertEqual([item["id"] for item in snapshot["rides"]], ["request-1"])
        self.assertEqual([item["id"] for item in snapshot["food_orders"]], ["food-1"])
        self.assertEqual([item["id"] for item in snapshot["courier_deliveries"]], ["delivery-1"])
        self.assertEqual(snapshot["rides"][0]["ride_snapshot"]["id"], "ride-1")


    async def test_ride_enrichment_batches_rides_and_passengers(self):
        for ride_id in ("ride-a", "ride-b"):
            await database.insert_one("rides", {
                "id": ride_id, "user_id": "driver-1", "origin": "Harare", "destination": "Mutare",
                "status": "SCHEDULED", "available_seats": 3, "date": "2099-09-01", "time": "08:00",
            })
        for request_id, ride_id in (("request-a", "ride-a"), ("request-b", "ride-a"), ("request-c", "ride-b")):
            await database.insert_one("ride_requests", {
                "id": request_id, "ride_id": ride_id, "user_id": self.user["id"],
                "passenger_name": "Stored fallback", "passenger_phone": "+263700000000", "status": "confirmed",
            })

        original_find_many = database.find_many
        with patch.object(database, "find_many", side_effect=original_find_many) as find_many:
            snapshot = await get_customer_activity(self.user)

        ride_bulk_calls = [
            call for call in find_many.await_args_list
            if len(call.args) > 1 and call.args[0] == "rides" and call.args[1].get("id", {}).get("$in") == ["ride-a", "ride-b"]
        ]
        passenger_bulk_calls = [
            call for call in find_many.await_args_list
            if len(call.args) > 1 and call.args[0] == "users" and call.args[1].get("id", {}).get("$in") == [self.user["id"]]
        ]
        self.assertEqual(len(ride_bulk_calls), 1)
        self.assertEqual(len(passenger_bulk_calls), 1)
        self.assertEqual([item["id"] for item in snapshot["rides"]], ["request-a", "request-b", "request-c"])
        self.assertEqual(
            [item["ride_snapshot"]["id"] for item in snapshot["rides"]],
            ["ride-a", "ride-a", "ride-b"],
        )
        self.assertTrue(all(item["passenger_name"] == self.user["name"] for item in snapshot["rides"]))
        self.assertTrue(all("passenger_phone" not in item for item in snapshot["rides"]))
