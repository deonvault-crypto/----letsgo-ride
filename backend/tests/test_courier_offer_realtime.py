import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.courier_offer_realtime_service import (
    eligible_courier_user_ids,
    publish_courier_offer_transition,
)
from app.services.courier_service import assign_delivery, cancel_delivery, set_delivery_quote, update_delivery_status
from app.services.event_service import realtime_event_service
from app.services.food_service import cancel_food_order
from app.services.operations_service import claim_courier_offer, courier_workspace_snapshot, list_courier_offers
from app.services.realtime_connection_manager import RealtimePrincipal, principal_can_receive


class CourierOfferRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.customer = {"id": "customer-1", "role": "passenger", "name": "Customer"}
        self.admin = {"id": "admin-1", "role": "admin", "name": "Admin"}
        self.courier_a = {"id": "courier-a", "role": "courier", "name": "Courier A"}
        self.courier_b = {"id": "courier-b", "role": "courier", "name": "Courier B"}
        self.offline = {"id": "courier-offline", "role": "courier", "name": "Offline"}
        self.unapproved = {"id": "courier-review", "role": "courier", "name": "Review"}
        self.sender_courier = {"id": "courier-sender", "role": "courier", "name": "Sender"}
        self.normal_user = {"id": "customer-other", "role": "passenger", "name": "Other"}
        self.active_courier = {"id": "courier-active", "role": "courier", "name": "Busy"}
        for user in (
            self.customer, self.admin, self.courier_a, self.courier_b, self.offline,
            self.unapproved, self.sender_courier, self.normal_user, self.active_courier,
        ):
            await database.insert_one("users", user)
        for user, status, online in (
            (self.courier_a, "APPROVED", True),
            (self.courier_b, "APPROVED", True),
            (self.offline, "APPROVED", False),
            (self.unapproved, "UNDER_REVIEW", True),
            (self.sender_courier, "APPROVED", True),
            (self.active_courier, "APPROVED", True),
        ):
            await database.insert_one(
                "courier_profiles",
                {"id": f"profile-{user['id']}", "user_id": user["id"], "name": user["name"], "status": status, "online": online},
            )
        await database.insert_one(
            "courier_deliveries",
            {"id": "busy-job", "sender_user_id": self.customer["id"], "courier_user_id": self.active_courier["id"], "status": "IN_TRANSIT", "realtime_version": 2},
        )
        self.publish = AsyncMock(return_value=True)
        self.publish_patch = patch.object(realtime_event_service, "publish", self.publish)
        self.publish_patch.start()

    async def asyncTearDown(self):
        self.publish_patch.stop()

    async def offer(self, delivery_id="offer-1", **overrides):
        item = {
            "id": delivery_id,
            "realtime_version": 1,
            "sender_user_id": self.customer["id"],
            "courier_user_id": None,
            "source_type": "COURIER_REQUEST",
            "status": "MATCHING",
            "quote_status": "READY",
            "pickup_address": "Joina City, Harare",
            "dropoff_address": "Borrowdale, Harare",
            "pickup_location": {"latitude": -17.8318, "longitude": 31.0460},
            "dropoff_location": {"latitude": -17.78, "longitude": 31.08},
            "recipient_phone": "+263770000001",
            "handoff_pin_hash": "protected",
            "price_usd": 7.0,
            "courier_payout_usd": 5.0,
            "distance_km": 4.2,
            "estimated_duration_minutes": 12,
            "created_at": "2027-01-01T10:00:00+00:00",
            "updated_at": "2027-01-01T10:00:00+00:00",
            **overrides,
        }
        return await database.insert_one("courier_deliveries", item)

    def offer_publications(self):
        return [call.args[0] for call in self.publish.await_args_list if call.args[0].envelope.resource_type == "courier_offer"]

    async def test_available_offer_has_server_derived_audience_and_safe_payload(self):
        after = await self.offer(sender_user_id=self.sender_courier["id"])
        await publish_courier_offer_transition({**after, "status": "REQUESTED", "quote_status": "PENDING"}, after)
        event = self.offer_publications()[-1]
        self.assertEqual(event.envelope.type, "courier_offer.available")
        self.assertEqual(event.envelope.version, after["realtime_version"])
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.courier_a["id"], "courier"), event.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.courier_b["id"], "courier"), event.audience))
        for excluded in (self.offline, self.unapproved, self.sender_courier, self.active_courier, self.normal_user):
            self.assertFalse(principal_can_receive(RealtimePrincipal(excluded["id"], excluded["role"]), event.audience))
        encoded = json.dumps(event.envelope.payload).lower()
        for protected in ("phone", "handoff_pin", "token", "document", "recipient_name", "notes"):
            self.assertNotIn(protected, encoded)

    async def test_audience_resolution_uses_three_set_reads_not_n_plus_one(self):
        original = database.find_many
        find_many = AsyncMock(side_effect=original)
        with patch.object(database, "find_many", find_many):
            recipients = await eligible_courier_user_ids(sender_user_id=self.sender_courier["id"])
        self.assertEqual(find_many.await_count, 3)
        self.assertEqual(recipients, {self.courier_a["id"], self.courier_b["id"]})

    async def test_quote_available_and_quote_change_updated_publish_once_each(self):
        pending = await self.offer(status="REQUESTED", quote_status="PENDING", price_usd=None, courier_payout_usd=None)
        quoted = await set_delivery_quote(pending["id"], {"price_usd": 8, "courier_payout_usd": 5.5}, self.admin)
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.available")
        updated = await set_delivery_quote(quoted["id"], {"price_usd": 9, "courier_payout_usd": 6}, self.admin)
        self.assertGreater(updated["realtime_version"], quoted["realtime_version"])
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.updated")

    async def test_claim_and_admin_assignment_remove_offer_without_changing_delivery_audience(self):
        claimed = await claim_courier_offer((await self.offer("claim"))["id"], self.courier_a)
        offer_event = self.offer_publications()[-1]
        self.assertEqual(offer_event.envelope.type, "courier_offer.removed")
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.courier_a["id"], "courier"), offer_event.audience))
        delivery_event = [call.args[0] for call in self.publish.await_args_list if call.args[0].envelope.resource_type == "courier_delivery"][-1]
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.customer["id"], "passenger"), delivery_event.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.courier_a["id"], "courier"), delivery_event.audience))
        self.assertEqual(claimed["courier_user_id"], self.courier_a["id"])

        self.publish.reset_mock()
        assigned = await assign_delivery((await self.offer("assigned"))["id"], self.courier_b["id"], self.admin)
        self.assertEqual(assigned["courier_user_id"], self.courier_b["id"])
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.removed")

    async def test_cancellation_failure_and_food_cancellation_remove_offers(self):
        await cancel_delivery((await self.offer("cancel"))["id"], self.customer, "Changed plans")
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.removed")

        failed_offer = await self.offer("failed")
        await update_delivery_status(failed_offer["id"], "FAILED", self.admin)
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.removed")

        food_delivery = await self.offer("food-cancel", source_type="FOOD_ORDER", food_order_id="order-1")
        await database.insert_one(
            "food_orders",
            {
                "id": "order-1", "customer_user_id": self.customer["id"], "restaurant_id": "restaurant-1",
                "status": "PREPARING", "restaurant_status": "PREPARING", "fulfillment_status": "MATCHING",
                "courier_delivery_id": food_delivery["id"], "realtime_version": 1,
            },
        )
        await cancel_food_order("order-1", self.customer, "Changed plans")
        self.assertEqual(self.offer_publications()[-1].envelope.type, "courier_offer.removed")

    async def test_duplicate_transition_is_noop_and_publish_failure_never_rolls_back_claim(self):
        offer = await self.offer("no-op")
        self.publish.reset_mock()
        self.assertIsNone(await publish_courier_offer_transition(offer, dict(offer)))
        self.publish.assert_not_awaited()

        failing = await self.offer("redis-failure")
        self.publish.side_effect = RuntimeError("redis unavailable")
        claimed = await claim_courier_offer(failing["id"], self.courier_a)
        stored = await database.find_one("courier_deliveries", {"id": failing["id"]})
        self.assertEqual(claimed["courier_user_id"], self.courier_a["id"])
        self.assertEqual(stored["status"], "COURIER_TO_PICKUP")

    async def test_concurrent_claim_has_exactly_one_winner(self):
        offer = await self.offer("race")
        results = await asyncio.gather(
            claim_courier_offer(offer["id"], self.courier_a),
            claim_courier_offer(offer["id"], self.courier_b),
            return_exceptions=True,
        )
        winners = [result for result in results if isinstance(result, dict)]
        self.assertEqual(len(winners), 1)
        stored = await database.find_one("courier_deliveries", {"id": offer["id"]})
        self.assertEqual(stored["courier_user_id"], winners[0]["courier_user_id"])

    async def test_list_and_workspace_use_canonical_offer_view(self):
        await self.offer("listed")
        await self.offer("own", sender_user_id=self.courier_a["id"])
        offers = await list_courier_offers(self.courier_a)
        self.assertEqual([item["id"] for item in offers], ["listed"])
        self.assertNotIn("recipient_phone", offers[0])
        snapshot = await courier_workspace_snapshot(self.courier_a)
        self.assertEqual([item["id"] for item in snapshot["offers"]], ["listed"])
        self.assertIsNone(snapshot["active_delivery"])
        self.assertIn("earnings", snapshot)
        self.assertIn("next_shift", snapshot)


if __name__ == "__main__":
    unittest.main()
