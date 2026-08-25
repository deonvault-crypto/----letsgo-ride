import unittest

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
