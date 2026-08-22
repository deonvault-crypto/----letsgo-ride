import unittest

from app.database import COLLECTION_NAMES, database
from app.services.courier_service import set_delivery_quote
from app.services.fulfillment_link_service import ensure_food_order_delivery
from app.services.operations_service import claim_courier_offer, list_courier_offers


class PlatformV2FulfillmentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

        self.customer = {
            "id": "customer-1",
            "role": "passenger",
            "name": "Tatenda Customer",
            "phone": "+263770000001",
        }
        self.courier = {
            "id": "courier-1",
            "role": "driver",
            "name": "Tafadzwa Courier",
            "phone": "+263770000002",
        }
        self.other_courier = {
            "id": "courier-2",
            "role": "driver",
            "name": "Nyasha Courier",
            "phone": "+263770000003",
        }
        self.admin = {"id": "admin-1", "role": "admin", "name": "Operations"}

        await database.insert_one("users", self.customer)
        await database.insert_one("users", self.courier)
        await database.insert_one("users", self.other_courier)
        await database.insert_one(
            "restaurants",
            {
                "id": "restaurant-1",
                "owner_user_id": "merchant-1",
                "name": "Test Kitchen",
                "address": "1 Samora Machel Ave, Harare",
                "location": {"latitude": -17.8252, "longitude": 31.0335},
                "status": "ACTIVE",
                "is_accepting_orders": True,
            },
        )
        await database.insert_one(
            "food_orders",
            {
                "id": "order-1",
                "restaurant_id": "restaurant-1",
                "restaurant_name": "Test Kitchen",
                "customer_user_id": self.customer["id"],
                "customer_name": self.customer["name"],
                "status": "READY_FOR_PICKUP",
                "delivery_address": "20 Borrowdale Road, Harare",
                "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                "recipient_name": self.customer["name"],
                "recipient_phone": self.customer["phone"],
                "items": [],
                "subtotal_usd": 12.0,
                "delivery_fee_usd": None,
                "total_usd": None,
                "pricing_status": "DELIVERY_FEE_PENDING",
                "currency": "USD",
                "courier_delivery_id": None,
                "created_at": "2026-08-22T12:00:00+00:00",
                "updated_at": "2026-08-22T12:00:00+00:00",
            },
        )
        for profile_id, user in (("profile-1", self.courier), ("profile-2", self.other_courier)):
            await database.insert_one(
                "courier_profiles",
                {
                    "id": profile_id,
                    "user_id": user["id"],
                    "name": user["name"],
                    "status": "APPROVED",
                    "online": True,
                    "transport_mode": "motorbike",
                },
            )

    async def test_food_fulfillment_is_idempotent_priced_then_claimed_atomically(self):
        delivery = await ensure_food_order_delivery("order-1", actor_user_id="merchant-1")
        self.assertEqual(delivery["status"], "REQUESTED")
        self.assertEqual(delivery["quote_status"], "PENDING")
        self.assertEqual(delivery["package_type"], "food")
        self.assertIsNone(delivery["courier_payout_usd"])

        same_delivery = await ensure_food_order_delivery("order-1", actor_user_id="merchant-1")
        self.assertEqual(same_delivery["id"], delivery["id"])
        all_deliveries = await database.find_many("courier_deliveries")
        self.assertEqual(len(all_deliveries), 1)

        self.assertEqual(await list_courier_offers(self.courier), [])

        quoted = await set_delivery_quote(
            delivery["id"],
            {
                "price_usd": 4.0,
                "courier_payout_usd": 2.75,
                "distance_km": 7.2,
                "estimated_duration_minutes": 24,
            },
            self.admin,
        )
        self.assertEqual(quoted["status"], "MATCHING")
        self.assertEqual(quoted["courier_payout_usd"], 2.75)

        food_order = await database.find_one("food_orders", {"id": "order-1"})
        self.assertEqual(food_order["delivery_fee_usd"], 4.0)
        self.assertEqual(food_order["total_usd"], 16.0)
        self.assertEqual(food_order["pricing_status"], "READY")

        offers = await list_courier_offers(self.courier)
        self.assertEqual([item["id"] for item in offers], [delivery["id"]])

        claimed = await claim_courier_offer(delivery["id"], self.courier)
        self.assertEqual(claimed["status"], "ASSIGNED")
        self.assertEqual(claimed["courier_user_id"], self.courier["id"])

        food_order = await database.find_one("food_orders", {"id": "order-1"})
        self.assertEqual(food_order["status"], "COURIER_ASSIGNED")

        with self.assertRaises(ValueError):
            await claim_courier_offer(delivery["id"], self.other_courier)

        final_delivery = await database.find_one("courier_deliveries", {"id": delivery["id"]})
        self.assertEqual(final_delivery["courier_user_id"], self.courier["id"])

    async def test_conditional_update_allows_only_first_claim(self):
        await database.insert_one(
            "courier_deliveries",
            {"id": "job-1", "status": "MATCHING", "courier_user_id": None},
        )
        first = await database.update_one_if(
            "courier_deliveries",
            {"id": "job-1", "status": "MATCHING", "courier_user_id": None},
            {"status": "ASSIGNED", "courier_user_id": "courier-1"},
        )
        second = await database.update_one_if(
            "courier_deliveries",
            {"id": "job-1", "status": "MATCHING", "courier_user_id": None},
            {"status": "ASSIGNED", "courier_user_id": "courier-2"},
        )
        self.assertEqual(first["courier_user_id"], "courier-1")
        self.assertIsNone(second)


if __name__ == "__main__":
    unittest.main()
