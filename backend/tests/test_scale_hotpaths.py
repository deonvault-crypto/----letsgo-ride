import unittest
from unittest.mock import AsyncMock, patch

from app.services.food_service import create_food_order, get_restaurant_menu, list_restaurants
from app.services.review_context_service import _confirmed_requests_for_ride


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

    async def test_public_restaurants_filter_status_in_database(self):
        rows = [
            {"id": "active", "name": "Alpha", "status": "ACTIVE", "is_accepting_orders": True},
            {"id": "soon", "name": "Beta", "status": "COMING_SOON", "is_accepting_orders": True},
        ]
        with patch("app.services.food_service.database.find_many", AsyncMock(return_value=rows)) as find_many:
            result = await list_restaurants()

        find_many.assert_awaited_once_with(
            "restaurants",
            {"status": {"$in": ["ACTIVE", "COMING_SOON"]}},
        )
        self.assertTrue(result[0]["is_orderable"])
        self.assertFalse(result[1]["is_orderable"])

    async def test_restaurant_menu_filters_and_sorts_in_database(self):
        restaurant = {"id": "restaurant-1", "name": "Menu Kitchen", "status": "ACTIVE"}
        categories = [{"id": "cat-1", "restaurant_id": "restaurant-1", "sort_order": 1}]
        items = [{"id": "item-1", "restaurant_id": "restaurant-1", "is_available": True}]
        find_many = AsyncMock(side_effect=[categories, items])
        with (
            patch("app.services.food_service.get_restaurant", AsyncMock(return_value=restaurant)),
            patch("app.services.food_service.database.find_many", find_many),
        ):
            menu = await get_restaurant_menu("restaurant-1")

        self.assertEqual(
            find_many.await_args_list[0].args,
            ("menu_categories", {"restaurant_id": "restaurant-1"}),
        )
        self.assertEqual(find_many.await_args_list[0].kwargs, {"sort": [("sort_order", 1)]})
        self.assertEqual(
            find_many.await_args_list[1].args,
            ("menu_items", {"restaurant_id": "restaurant-1", "is_available": {"$ne": False}}),
        )
        self.assertEqual(menu["items"], items)

    async def test_review_participants_filter_confirmed_requests_in_database(self):
        find_many = AsyncMock(
            return_value=[
                {"id": "request-1", "ride_id": "ride-1", "status": "confirmed", "user_id": "passenger-1"},
                {"id": "request-2", "ride_id": "ride-1", "status": "confirmed", "user_id": None},
            ]
        )
        with patch("app.services.review_context_service.database.find_many", find_many):
            requests = await _confirmed_requests_for_ride("ride-1")

        find_many.assert_awaited_once_with(
            "ride_requests",
            {"ride_id": "ride-1", "status": "confirmed"},
        )
        self.assertEqual([request["id"] for request in requests], ["request-1"])


if __name__ == "__main__":
    unittest.main()
