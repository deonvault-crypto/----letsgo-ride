import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services.review_read_service import (
    completed_trips_count_for_user,
    public_review_summary_for_restaurant,
    public_review_summary_for_user,
)


class ReviewReadServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_user_summary_batches_transaction_and_reviewer_reads(self):
        await database.insert_one("users", {"id": "reviewer-1", "name": "Alice Example"})
        await database.insert_one("users", {"id": "reviewer-2", "name": "Bob Example"})
        await database.insert_one(
            "hailing_trips",
            {"id": "trip-completed", "driver_user_id": "target", "passenger_user_id": "reviewer-1", "status": "COMPLETED"},
        )
        await database.insert_one(
            "hailing_trips",
            {"id": "trip-active", "driver_user_id": "target", "passenger_user_id": "reviewer-2", "status": "IN_PROGRESS"},
        )
        await database.insert_one(
            "reviews",
            {
                "id": "review-visible",
                "transaction_id": "trip-completed",
                "transaction_type": "hailing",
                "reviewer_id": "reviewer-1",
                "reviewee_id": "target",
                "reviewee_kind": "user",
                "reviewer_role": "passenger",
                "reviewee_role": "driver",
                "rating": 5,
                "comment": "Great ride",
                "created_at": "2026-09-15T10:00:00+00:00",
            },
        )
        await database.insert_one(
            "reviews",
            {
                "id": "review-incomplete",
                "transaction_id": "trip-active",
                "transaction_type": "hailing",
                "reviewer_id": "reviewer-2",
                "reviewee_id": "target",
                "reviewee_kind": "user",
                "reviewer_role": "passenger",
                "reviewee_role": "driver",
                "rating": 1,
                "created_at": "2026-09-15T11:00:00+00:00",
            },
        )
        await database.insert_one(
            "reviews",
            {
                "id": "review-hidden",
                "transaction_id": "trip-completed",
                "transaction_type": "hailing",
                "reviewer_id": "reviewer-2",
                "reviewee_id": "target",
                "reviewee_kind": "user",
                "rating": 1,
                "hidden": True,
                "created_at": "2026-09-15T12:00:00+00:00",
            },
        )

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            summary = await public_review_summary_for_user("target")

        self.assertEqual(summary["average_rating"], 5.0)
        self.assertEqual(summary["review_count"], 1)
        self.assertEqual(summary["latest_reviews"][0]["reviewer_name"], "Alice E.")
        self.assertEqual(summary["latest_reviews"][0]["trip_id"], "trip-completed")
        hailing_reads = [
            call for call in find_many.await_args_list
            if call.args and call.args[0] == "hailing_trips"
        ]
        reviewer_reads = [
            call for call in find_many.await_args_list
            if call.args and call.args[0] == "users"
        ]
        self.assertEqual(len(hailing_reads), 1)
        self.assertIn("$in", hailing_reads[0].args[1]["id"])
        self.assertEqual(len(reviewer_reads), 1)
        self.assertEqual(reviewer_reads[0].args[1], {"id": {"$in": ["reviewer-1"]}})

    async def test_restaurant_summary_preserves_delivered_food_review_contract(self):
        await database.insert_one("restaurants", {"id": "restaurant-1", "name": "Kitchen"})
        await database.insert_one("users", {"id": "customer-1", "name": "Chris Customer"})
        await database.insert_one(
            "food_orders",
            {"id": "order-1", "restaurant_id": "restaurant-1", "fulfillment_status": "DELIVERED"},
        )
        await database.insert_one(
            "reviews",
            {
                "id": "restaurant-review",
                "transaction_id": "order-1",
                "transaction_type": "food_restaurant",
                "reviewer_id": "customer-1",
                "reviewee_id": "restaurant-1",
                "reviewee_kind": "restaurant",
                "reviewer_role": "customer",
                "reviewee_role": "restaurant",
                "rating": 4,
                "created_at": "2026-09-15T10:00:00+00:00",
            },
        )

        summary = await public_review_summary_for_restaurant("restaurant-1")

        self.assertEqual(summary["average_rating"], 4.0)
        self.assertEqual(summary["review_count"], 1)
        self.assertEqual(summary["latest_reviews"][0]["reviewer_name"], "Chris C.")

    async def test_passenger_completed_intercity_count_batches_ride_lookup(self):
        await database.insert_one(
            "ride_requests",
            {"id": "request-1", "user_id": "passenger-1", "ride_id": "ride-1", "status": "confirmed"},
        )
        await database.insert_one(
            "ride_requests",
            {"id": "request-2", "user_id": "passenger-1", "ride_id": "ride-2", "status": "confirmed"},
        )
        await database.insert_one("rides", {"id": "ride-1", "status": "COMPLETED"})
        await database.insert_one("rides", {"id": "ride-2", "status": "CANCELLED"})

        with (
            patch.object(database, "find_many", wraps=database.find_many) as find_many,
            patch.object(database, "find_one", wraps=database.find_one) as find_one,
        ):
            count = await completed_trips_count_for_user("passenger-1", "passenger")

        self.assertEqual(count, 1)
        ride_many = [
            call for call in find_many.await_args_list
            if call.args and call.args[0] == "rides"
        ]
        ride_one = [
            call for call in find_one.await_args_list
            if call.args and call.args[0] == "rides"
        ]
        self.assertEqual(len(ride_many), 1)
        self.assertEqual(ride_many[0].args[1], {"id": {"$in": ["ride-1", "ride-2"]}})
        self.assertEqual(ride_one, [])


if __name__ == "__main__":
    unittest.main()
