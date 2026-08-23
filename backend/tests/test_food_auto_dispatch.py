import unittest

from app.database import COLLECTION_NAMES, database
from app.services.food_service import create_food_order
from app.services.merchant_order_orchestration_service import transition_merchant_order


class FoodAutoDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

        self.customer = {
            "id": "customer-food-1",
            "role": "passenger",
            "name": "Tariro Customer",
            "phone": "+263770000011",
        }
        await database.insert_one("users", self.customer)
        self.merchant = {
            "id": "merchant-food-1",
            "role": "merchant",
            "name": "Kitchen Owner",
        }
        await database.insert_one("users", self.merchant)
        await database.insert_one(
            "restaurants",
            {
                "id": "restaurant-food-1",
                "owner_user_id": "merchant-food-1",
                "name": "Harare Kitchen",
                "address": "1 Samora Machel Ave, Harare",
                "location": {"latitude": -17.8252, "longitude": 31.0335},
                "status": "ACTIVE",
                "is_accepting_orders": True,
            },
        )
        await database.insert_one(
            "menu_items",
            {
                "id": "meal-1",
                "restaurant_id": "restaurant-food-1",
                "category_id": "category-1",
                "name": "Chicken and chips",
                "price_usd": 8.5,
                "is_available": True,
            },
        )

    async def test_restaurant_acceptance_starts_kitchen_and_courier_matching(self):
        order = await create_food_order(
            {
                "restaurant_id": "restaurant-food-1",
                "delivery_address": "Borrowdale, Harare",
                "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                "recipient_name": self.customer["name"],
                "recipient_phone": self.customer["phone"],
                "items": [{"menu_item_id": "meal-1", "quantity": 2}],
                "customer_note": None,
                "payment_method": "CASH_ON_DELIVERY",
            },
            self.customer,
        )

        self.assertEqual(order["status"], "PENDING_RESTAURANT")
        self.assertEqual(order["restaurant_status"], "PENDING_RESTAURANT")
        self.assertEqual(order["payment_status"], "PAY_ON_DELIVERY")
        self.assertIsNone(order["courier_delivery_id"])
        self.assertEqual(await database.find_many("courier_deliveries"), [])

        order = await transition_merchant_order(
            order["id"],
            "PREPARING",
            None,
            self.merchant,
        )

        self.assertEqual(order["status"], "PREPARING")
        self.assertEqual(order["restaurant_status"], "PREPARING")
        self.assertIsNotNone(order["courier_delivery_id"])

        delivery = await database.find_one("courier_deliveries", {"id": order["courier_delivery_id"]})
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery["package_type"], "food")
        self.assertEqual(delivery["food_order_id"], order["id"])
        self.assertIn(delivery["status"], {"REQUESTED", "MATCHING"})

        event_types = {
            event["type"]
            for event in await database.find_many("food_order_events", {"order_id": order["id"]})
        }
        self.assertIn("ORDER_PLACED", event_types)
        self.assertIn("ORDER_CONFIRMED", event_types)
        self.assertIn("RESTAURANT_PREPARING", event_types)
        self.assertIn("COURIER_FULFILLMENT_CREATED", event_types)
        self.assertIn("COURIER_MATCHING_STARTED", event_types)

    async def test_restaurant_can_reject_before_dispatch(self):
        order = await create_food_order(
            {
                "restaurant_id": "restaurant-food-1",
                "delivery_address": "Borrowdale, Harare",
                "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                "recipient_name": self.customer["name"],
                "recipient_phone": self.customer["phone"],
                "items": [{"menu_item_id": "meal-1", "quantity": 1}],
                "payment_method": "CASH_ON_DELIVERY",
            },
            self.customer,
        )

        rejected = await transition_merchant_order(
            order["id"],
            "REJECTED",
            "Kitchen is closing early.",
            self.merchant,
        )

        self.assertEqual(rejected["status"], "REJECTED")
        self.assertEqual(rejected["fulfillment_status"], "CANCELLED")
        self.assertIsNone(rejected["courier_delivery_id"])
        self.assertEqual(await database.find_many("courier_deliveries"), [])

    async def test_closed_restaurant_or_unavailable_item_blocks_order_before_creation(self):
        await database.update_one("restaurants", "restaurant-food-1", {"is_accepting_orders": False})
        with self.assertRaises(ValueError):
            await create_food_order(
                {
                    "restaurant_id": "restaurant-food-1",
                    "delivery_address": "Borrowdale, Harare",
                    "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                    "recipient_name": self.customer["name"],
                    "recipient_phone": self.customer["phone"],
                    "items": [{"menu_item_id": "meal-1", "quantity": 1}],
                    "payment_method": "CASH_ON_DELIVERY",
                },
                self.customer,
            )

        self.assertEqual(await database.find_many("food_orders"), [])

    async def test_real_brand_coming_soon_listing_cannot_be_ordered(self):
        await database.insert_one(
            "restaurants",
            {
                "id": "brand-coming-soon",
                "name": "Recognizable Restaurant",
                "address": "Harare",
                "status": "COMING_SOON",
                "is_accepting_orders": False,
                "partner_status": "NOT_CONTRACTED",
            },
        )
        with self.assertRaises(ValueError):
            await create_food_order(
                {
                    "restaurant_id": "brand-coming-soon",
                    "delivery_address": "Borrowdale, Harare",
                    "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                    "recipient_name": self.customer["name"],
                    "recipient_phone": self.customer["phone"],
                    "items": [{"menu_item_id": "meal-1", "quantity": 1}],
                    "payment_method": "CASH_ON_DELIVERY",
                },
                self.customer,
            )
        self.assertEqual(await database.find_many("food_orders"), [])


if __name__ == "__main__":
    unittest.main()
