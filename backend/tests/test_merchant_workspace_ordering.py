import unittest
from unittest.mock import AsyncMock, call, patch

from app.database import database
from app.services.merchant_workspace_service import get_restaurant_workspace


class MerchantWorkspaceOrderingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_categories = list(database.memory["menu_categories"])
        self.original_items = list(database.memory["menu_items"])
        self.original_orders = list(database.memory["food_orders"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["menu_categories"] = self.original_categories
        database.memory["menu_items"] = self.original_items
        database.memory["food_orders"] = self.original_orders

    async def test_workspace_pushes_category_and_order_sort_to_database(self):
        restaurant = {"id": "restaurant-1", "name": "Test Restaurant"}

        async def find_many(collection, filters=None, *, sort=None, limit=None):
            self.assertEqual(filters, {"restaurant_id": "restaurant-1"})
            self.assertIsNone(limit)
            if collection == "menu_categories":
                self.assertEqual(sort, [("sort_order", 1)])
                return [
                    {"id": "category-1", "restaurant_id": "restaurant-1", "sort_order": 1},
                    {"id": "category-2", "restaurant_id": "restaurant-1", "sort_order": 2},
                ]
            if collection == "menu_items":
                self.assertIsNone(sort)
                return [
                    {"id": "item-z", "restaurant_id": "restaurant-1", "category_id": "category-1", "name": "zebra"},
                    {"id": "item-a", "restaurant_id": "restaurant-1", "category_id": "category-1", "name": "Apple"},
                    {"id": "item-b", "restaurant_id": "restaurant-1", "category_id": "category-2", "name": "Banana"},
                ]
            if collection == "food_orders":
                self.assertEqual(sort, [("created_at", -1)])
                return [
                    {"id": "order-new", "restaurant_id": "restaurant-1", "created_at": "2026-09-16T10:00:00Z"},
                    {"id": "order-old", "restaurant_id": "restaurant-1", "created_at": "2026-09-15T10:00:00Z"},
                ]
            raise AssertionError(f"unexpected collection: {collection}")

        with (
            patch(
                "app.services.merchant_workspace_service.require_restaurant_access",
                new=AsyncMock(return_value=restaurant),
            ),
            patch.object(database, "find_many", new=AsyncMock(side_effect=find_many)) as mocked_find_many,
        ):
            workspace = await get_restaurant_workspace("restaurant-1", {"id": "merchant-1"})

        self.assertEqual([item["id"] for item in workspace["categories"]], ["category-1", "category-2"])
        self.assertEqual([item["id"] for item in workspace["items"]], ["item-a", "item-z", "item-b"])
        self.assertEqual([item["id"] for item in workspace["orders"]], ["order-new", "order-old"])
        self.assertEqual(
            mocked_find_many.await_args_list,
            [
                call(
                    "menu_categories",
                    {"restaurant_id": "restaurant-1"},
                    sort=[("sort_order", 1)],
                ),
                call("menu_items", {"restaurant_id": "restaurant-1"}),
                call(
                    "food_orders",
                    {"restaurant_id": "restaurant-1"},
                    sort=[("created_at", -1)],
                ),
            ],
        )

    async def test_memory_workspace_preserves_existing_ordering_contract(self):
        database.db = None
        database.memory["menu_categories"] = [
            {"id": "category-2", "restaurant_id": "restaurant-1", "sort_order": 2},
            {"id": "other-category", "restaurant_id": "restaurant-2", "sort_order": 0},
            {"id": "category-1", "restaurant_id": "restaurant-1", "sort_order": 1},
        ]
        database.memory["menu_items"] = [
            {"id": "item-b", "restaurant_id": "restaurant-1", "category_id": "category-2", "name": "Banana"},
            {"id": "item-z", "restaurant_id": "restaurant-1", "category_id": "category-1", "name": "zebra"},
            {"id": "item-a", "restaurant_id": "restaurant-1", "category_id": "category-1", "name": "Apple"},
        ]
        database.memory["food_orders"] = [
            {"id": "order-old", "restaurant_id": "restaurant-1", "created_at": "2026-09-15T10:00:00Z"},
            {"id": "other-order", "restaurant_id": "restaurant-2", "created_at": "2026-09-17T10:00:00Z"},
            {"id": "order-new", "restaurant_id": "restaurant-1", "created_at": "2026-09-16T10:00:00Z"},
        ]

        with patch(
            "app.services.merchant_workspace_service.require_restaurant_access",
            new=AsyncMock(return_value={"id": "restaurant-1"}),
        ):
            workspace = await get_restaurant_workspace("restaurant-1", {"id": "merchant-1"})

        self.assertEqual([item["id"] for item in workspace["categories"]], ["category-1", "category-2"])
        self.assertEqual([item["id"] for item in workspace["items"]], ["item-a", "item-z", "item-b"])
        self.assertEqual([item["id"] for item in workspace["orders"]], ["order-new", "order-old"])


if __name__ == "__main__":
    unittest.main()
