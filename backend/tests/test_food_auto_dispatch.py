import unittest

from app.database import COLLECTION_NAMES, database
from app.services.courier_service import update_delivery_status
from app.services.food_service import create_food_order
from app.services.merchant_service import update_restaurant_order_status


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
        self.merchant = {
            "id": "merchant-food-1",
            "role": "merchant",
            "name": "Harare Kitchen Team",
        }
        self.courier = {
            "id": "courier-food-1",
            "role": "courier",
            "name": "Tawanda Courier",
        }
        for user in (self.customer, self.merchant, self.courier):
            await database.insert_one("users", user)

        await database.insert_one(
            "restaurants",
            {
                "id": "restaurant-food-1",
                "owner_user_id": self.merchant["id"],
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

    async def create_order(self):
        return await create_food_order(
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

    async def test_checkout_enters_kitchen_and_creates_delivery_without_accept_step(self):
        order = await self.create_order()

        self.assertEqual(order["status"], "PREPARING")
        self.assertEqual(order["restaurant_status"], "PREPARING")
        self.assertEqual(order["payment_status"], "PAY_ON_DELIVERY")
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
        self.assertIn("ORDER_CONFIRMED", event_types)
        self.assertIn("RESTAURANT_PREPARING", event_types)
        self.assertIn("COURIER_FULFILLMENT_CREATED", event_types)
        self.assertIn("COURIER_MATCHING_STARTED", event_types)

    async def test_courier_cannot_collect_food_until_restaurant_marks_ready(self):
        order = await self.create_order()
        delivery_id = order["courier_delivery_id"]
        await database.update_one(
            "courier_deliveries",
            delivery_id,
            {
                "courier_user_id": self.courier["id"],
                "courier_name": self.courier["name"],
                "status": "COURIER_TO_PICKUP",
                "live_tracking_active": True,
            },
        )

        with self.assertRaisesRegex(ValueError, "not marked this order ready"):
            await update_delivery_status(delivery_id, "PICKED_UP", self.courier)

        ready_order = await update_restaurant_order_status(order["id"], "READY_FOR_PICKUP", None, self.merchant)
        self.assertEqual(ready_order["restaurant_status"], "READY_FOR_PICKUP")

        delivery = await update_delivery_status(delivery_id, "PICKED_UP", self.courier)
        self.assertEqual(delivery["status"], "IN_TRANSIT")

    async def test_closed_restaurant_or_unavailable_item_blocks_order_before_creation(self):
        await database.update_one("restaurants", "restaurant-food-1", {"is_accepting_orders": False})
        with self.assertRaises(ValueError):
            await self.create_order()
        self.assertEqual(await database.find_many("food_orders"), [])

        await database.update_one("restaurants", "restaurant-food-1", {"is_accepting_orders": True})
        await database.update_one("menu_items", "meal-1", {"is_available": False})
        with self.assertRaises(ValueError):
            await self.create_order()
        self.assertEqual(await database.find_many("food_orders"), [])


if __name__ == "__main__":
    unittest.main()
