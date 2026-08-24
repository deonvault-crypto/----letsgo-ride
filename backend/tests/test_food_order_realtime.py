import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.event_service import realtime_event_service
from app.services.food_order_realtime_service import (
    food_order_realtime_version,
    update_versioned_food_order,
)
from app.services.food_service import cancel_food_order, create_food_order
from app.services.fulfillment_link_service import sync_food_order_from_delivery, sync_food_order_pricing
from app.services.merchant_order_orchestration_service import transition_merchant_order
from app.services.realtime_connection_manager import RealtimePrincipal, principal_can_receive


class FoodOrderRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.customer = {"id": "customer-food-1", "role": "passenger", "name": "Tariro", "phone": "+263770000001"}
        self.other_customer = {"id": "customer-food-2", "role": "passenger", "name": "Other"}
        self.merchant = {"id": "merchant-food-1", "role": "merchant", "name": "Owner"}
        self.other_merchant = {"id": "merchant-food-2", "role": "merchant", "name": "Other owner"}
        for user in (self.customer, self.other_customer, self.merchant, self.other_merchant):
            await database.insert_one("users", user)
        await database.insert_one(
            "restaurants",
            {
                "id": "restaurant-food-1",
                "owner_user_id": self.merchant["id"],
                "name": "Harare Kitchen",
                "address": "Joina City, Harare",
                "location": {"latitude": -17.8318, "longitude": 31.0460},
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
        self.publish = AsyncMock(return_value=True)
        self.publish_patch = patch.object(realtime_event_service, "publish", self.publish)
        self.publish_patch.start()

    async def asyncTearDown(self):
        self.publish_patch.stop()

    async def create_order(self):
        return await create_food_order(
            {
                "restaurant_id": "restaurant-food-1",
                "delivery_address": "Borrowdale, Harare",
                "delivery_location": {"latitude": -17.78, "longitude": 31.08},
                "recipient_name": "Tariro",
                "recipient_phone": "+263770000001",
                "items": [{"menu_item_id": "meal-1", "quantity": 1}],
                "payment_method": "CASH_ON_DELIVERY",
            },
            self.customer,
        )

    async def test_creation_version_and_audiences_are_server_scoped(self):
        order = await self.create_order()
        self.assertEqual(order["realtime_version"], 1)
        published = self.publish.await_args_list[-1].args[0]
        self.assertEqual(published.envelope.type, "food_order.created")
        self.assertEqual(published.envelope.version, 1)
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.customer["id"], "passenger"), published.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other_customer["id"], "passenger"), published.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.merchant["id"], "merchant", frozenset({"restaurant-food-1"})), published.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other_merchant["id"], "merchant", frozenset({"restaurant-other"})), published.audience))
        encoded = json.dumps(published.envelope.payload).lower()
        for protected in ("recipient_phone", "handoff_pin", "delivery_pin", "authorization", "token", "document_url"):
            self.assertNotIn(protected, encoded)

    async def test_legacy_version_and_concurrent_atomic_increments(self):
        self.assertEqual(food_order_realtime_version({"id": "legacy"}), 0)
        await database.insert_one("food_orders", {"id": "legacy", "status": "PENDING_RESTAURANT"})
        first, second = await asyncio.gather(
            update_versioned_food_order({"id": "legacy"}, {"restaurant_status": "PREPARING"}),
            update_versioned_food_order({"id": "legacy"}, {"fulfillment_status": "MATCHING"}),
        )
        self.assertEqual(sorted([first["realtime_version"], second["realtime_version"]]), [1, 2])

    async def test_customer_cancel_and_merchant_lifecycle_increment_and_publish(self):
        cancelled_source = await self.create_order()
        cancelled = await cancel_food_order(cancelled_source["id"], self.customer, "Changed plans")
        self.assertEqual(cancelled["realtime_version"], 2)
        self.assertEqual(self.publish.await_args_list[-1].args[0].envelope.type, "food_order.terminal")

        order = await self.create_order()
        preparing = await transition_merchant_order(order["id"], "PREPARING", None, self.merchant)
        self.assertGreaterEqual(preparing["realtime_version"], 3)
        self.assertIsNotNone(preparing["courier_delivery_id"])
        ready = await transition_merchant_order(order["id"], "READY_FOR_PICKUP", None, self.merchant)
        self.assertGreater(ready["realtime_version"], preparing["realtime_version"])
        event_types = [call.args[0].envelope.type for call in self.publish.await_args_list]
        self.assertIn("food_order.updated", event_types)
        self.assertIn("food_order.fulfillment_updated", event_types)

    async def test_rejection_is_terminal_and_never_creates_fulfillment(self):
        order = await self.create_order()
        rejected = await transition_merchant_order(order["id"], "REJECTED", "Kitchen closed", self.merchant)
        self.assertEqual(rejected["realtime_version"], 2)
        self.assertEqual(self.publish.await_args_list[-1].args[0].envelope.type, "food_order.terminal")
        self.assertEqual(await database.find_many("courier_deliveries"), [])

    async def test_delivery_sync_changes_only_food_visible_state(self):
        order = await self.create_order()
        delivery = {
            "id": "delivery-food-1",
            "food_order_id": order["id"],
            "status": "ASSIGNED",
            "price_usd": 4.25,
        }
        await sync_food_order_pricing(delivery, actor_user_id="admin-1")
        priced = await database.find_one("food_orders", {"id": order["id"]})
        await sync_food_order_pricing(delivery, actor_user_id="admin-1")
        unchanged_price = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(unchanged_price["realtime_version"], priced["realtime_version"])

        await sync_food_order_from_delivery(delivery, actor_user_id="courier-1")
        unchanged_status = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(unchanged_status["realtime_version"], priced["realtime_version"])
        delivery["status"] = "PICKED_UP"
        await sync_food_order_from_delivery(delivery, actor_user_id="courier-1")
        picked_up = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(picked_up["realtime_version"], priced["realtime_version"] + 1)
        await sync_food_order_from_delivery({**delivery, "last_courier_location": {"latitude": -17.8, "longitude": 31.05}}, actor_user_id="courier-1")
        gps_only = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(gps_only["realtime_version"], picked_up["realtime_version"])

        for status in ("IN_TRANSIT", "ARRIVING", "DELIVERED"):
            delivery["status"] = status
            await sync_food_order_from_delivery(delivery, actor_user_id="courier-1")
        terminal = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(terminal["status"], "DELIVERED")
        self.assertEqual(self.publish.await_args_list[-1].args[0].envelope.type, "food_order.terminal")
        terminal_version = terminal["realtime_version"]
        await sync_food_order_from_delivery({**delivery, "status": "IN_TRANSIT"}, actor_user_id="courier-1")
        late = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(late["status"], "DELIVERED")
        self.assertEqual(late["fulfillment_status"], "DELIVERED")
        self.assertEqual(late["realtime_version"], terminal_version)

    async def test_delivery_failure_and_cancellation_become_terminal_food_truth(self):
        for delivery_status in ("FAILED", "CANCELLED"):
            with self.subTest(delivery_status=delivery_status):
                order = await self.create_order()
                await sync_food_order_from_delivery(
                    {
                        "id": f"delivery-{delivery_status.lower()}",
                        "food_order_id": order["id"],
                        "status": delivery_status,
                        "cancellation_reason": "Courier delivery closed",
                    },
                    actor_user_id="admin-1",
                )
                stored = await database.find_one("food_orders", {"id": order["id"]})
                self.assertEqual(stored["status"], "CANCELLED")
                self.assertEqual(stored["fulfillment_status"], delivery_status)
                self.assertEqual(self.publish.await_args_list[-1].args[0].envelope.type, "food_order.terminal")

    async def test_redis_failure_does_not_fail_committed_food_mutation(self):
        self.publish.side_effect = RuntimeError("redis unavailable")
        order = await self.create_order()
        stored = await database.find_one("food_orders", {"id": order["id"]})
        self.assertEqual(stored["realtime_version"], 1)


if __name__ == "__main__":
    unittest.main()
