import unittest
from unittest.mock import AsyncMock, patch

from app.services.food_service import create_food_order


class ScaleHotpathTests(unittest.IsolatedAsyncioTestCase):
    async def test_food_checkout_fetches_menu_items_in_one_batch(self):
        restaurant = {
            "id": "restaurant-1",
            "name": "Batch Kitchen",
            "owner_user_id": "merchant-1",
            "status": "ACTIVE",
            "is_accepting_orders": True,
        }
        menu_items = [
            {"id": "item-1", "restaurant_id": "restaurant-1", "name": "Meal One", "price_usd": 4.0, "is_available": True},
            {"id": "item-2", "restaurant_id": "restaurant-1", "name": "Meal Two", "price_usd": 6.0, "is_available": True},
        ]
        payload = {
            "restaurant_id": "restaurant-1",
            "delivery_location": {"latitude": -17.82, "longitude": 31.04},
            "payment_method": "CASH_ON_DELIVERY",
            "recipient_name": "Customer",
            "recipient_phone": "+263700000000",
            "delivery_address": "Harare",
            "items": [
                {"menu_item_id": "item-1", "quantity": 2, "note": None},
                {"menu_item_id": "item-2", "quantity": 1, "note": "No onions"},
            ],
        }
        saved_order = {
            "id": "food-order-1",
            "subtotal_usd": 14.0,
            "restaurant_id": "restaurant-1",
        }

        with (
            patch("app.services.food_service.get_restaurant", AsyncMock(return_value=restaurant)),
            patch("app.services.food_service.database.find_many", AsyncMock(return_value=menu_items)) as find_many,
            patch("app.services.food_service.insert_versioned_food_order", AsyncMock(return_value=saved_order)) as insert_order,
            patch("app.services.food_service.append_order_event", AsyncMock(return_value={"id": "event-1"})),
            patch("app.services.food_service.publish_food_order_realtime", AsyncMock()),
            patch("app.services.food_service.create_app_notification", AsyncMock()),
        ):
            created = await create_food_order(payload, {"id": "customer-1", "name": "Customer"})

        find_many.assert_awaited_once_with("menu_items", {"id": {"$in": ["item-1", "item-2"]}})
        inserted = insert_order.await_args.args[0]
        self.assertEqual(inserted["subtotal_usd"], 14.0)
        self.assertEqual([item["menu_item_id"] for item in inserted["items"]], ["item-1", "item-2"])
        self.assertEqual(created["id"], "food-order-1")


if __name__ == "__main__":
    unittest.main()
