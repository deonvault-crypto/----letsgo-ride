import unittest

from app.database import COLLECTION_NAMES, database
from app.models.courier import CourierLocationBody
from app.services.auth_service import create_or_update_user
from app.services.food_service import get_restaurant
from app.services.merchant_service import (
    activate_restaurant,
    create_menu_category,
    create_menu_item,
    create_restaurant,
    review_restaurant,
    submit_restaurant_for_review,
    update_restaurant,
)


class MarketReadinessBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_public_phone_identity_never_self_assigns_a_worker_role(self):
        customer = await create_or_update_user("+263770000101", "courier", "New user")
        self.assertEqual(customer["role"], "passenger")

        await database.insert_one(
            "users",
            {"id": "courier-user", "phone": "+263770000102", "name": "Courier", "role": "courier"},
        )
        existing = await create_or_update_user("+263770000102", "passenger")
        self.assertEqual(existing["role"], "courier")

    def test_ios_location_sentinel_values_are_treated_as_unavailable(self):
        location = CourierLocationBody(
            latitude=-17.825,
            longitude=31.033,
            accuracy=-1,
            heading=-1,
            speed=-1,
        )
        self.assertIsNone(location.accuracy)
        self.assertIsNone(location.heading)
        self.assertIsNone(location.speed)

    async def test_restaurant_requires_review_then_admin_activation(self):
        merchant = {"id": "merchant-1", "role": "merchant", "name": "Merchant"}
        admin = {"id": "admin-1", "role": "admin", "name": "Admin"}
        restaurant = await create_restaurant(
            {
                "name": "Market Ready Kitchen",
                "phone": "+263770000103",
                "address": "1 First Street, Harare",
                "location": {"latitude": -17.825, "longitude": 31.033},
                "opening_hours": {"daily": "08:00-21:00"},
                "contact_person_name": "Tariro Owner",
            },
            merchant,
        )
        self.assertEqual(restaurant["status"], "DRAFT")
        self.assertEqual(restaurant["payout_status"], "NOT_REQUIRED_CASH_ON_DELIVERY")
        with self.assertRaises(ValueError):
            await get_restaurant(restaurant["id"])
        with self.assertRaises(ValueError):
            await update_restaurant(restaurant["id"], {"is_accepting_orders": True}, merchant)

        category = await create_menu_category(
            restaurant["id"], {"name": "Mains", "sort_order": 0, "image_url": None}, merchant
        )
        await create_menu_item(
            restaurant["id"],
            {
                "category_id": category["id"],
                "name": "Chicken and rice",
                "price_usd": 8.0,
                "preparation_minutes": 20,
                "is_available": True,
            },
            merchant,
        )
        submitted = await submit_restaurant_for_review(restaurant["id"], merchant)
        self.assertEqual(submitted["status"], "SUBMITTED")
        with self.assertRaises(ValueError):
            await submit_restaurant_for_review(restaurant["id"], merchant)

        reviewing = await review_restaurant(restaurant["id"], "UNDER_REVIEW", None, admin)
        self.assertEqual(reviewing["status"], "UNDER_REVIEW")
        approved = await review_restaurant(restaurant["id"], "APPROVED", "Checks complete", admin)
        self.assertEqual(approved["status"], "APPROVED")
        self.assertFalse(approved["is_accepting_orders"])

        with self.assertRaises(PermissionError):
            await activate_restaurant(restaurant["id"], merchant)
        active = await activate_restaurant(restaurant["id"], admin)
        self.assertEqual(active["status"], "ACTIVE")
        self.assertTrue(active["is_accepting_orders"])
        self.assertEqual((await get_restaurant(restaurant["id"]))["id"], restaurant["id"])


if __name__ == "__main__":
    unittest.main()
