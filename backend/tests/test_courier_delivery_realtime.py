import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.courier_service import (
    complete_delivery_with_pin,
    create_delivery,
    get_delivery_pin,
    update_courier_location,
    update_delivery_status,
)
from app.services.event_service import realtime_event_service
from app.services.operations_service import claim_courier_offer
from app.services.realtime_connection_manager import RealtimePrincipal, principal_can_receive


class CourierDeliveryRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.customer = {"id": "customer-1", "role": "passenger", "name": "Customer", "phone": "+263770000001"}
        self.courier = {"id": "courier-1", "role": "courier", "name": "Courier", "phone": "+263770000002"}
        self.other_customer = {"id": "customer-2", "role": "passenger", "name": "Other"}
        for user in (self.customer, self.courier, self.other_customer):
            await database.insert_one("users", user)
        await database.insert_one(
            "courier_profiles",
            {"id": "profile-1", "user_id": self.courier["id"], "name": "Courier", "status": "APPROVED", "online": True},
        )
        self.publish = AsyncMock(return_value=True)
        self.publish_patch = patch.object(realtime_event_service, "publish", self.publish)
        self.publish_patch.start()

    async def asyncTearDown(self):
        self.publish_patch.stop()

    async def create_ready_delivery(self):
        delivery = await create_delivery(
            {
                "pickup_address": "Joina City, Harare",
                "dropoff_address": "Sam Levy's Village, Harare",
                "pickup_location": {"latitude": -17.8318, "longitude": 31.0460},
                "dropoff_location": {"latitude": -17.7590, "longitude": 31.0910},
                "recipient_name": "Customer",
                "recipient_phone": "+263770000001",
                "package_type": "parcel",
            },
            self.customer,
        )
        return await database.update_one(
            "courier_deliveries",
            delivery["id"],
            {"status": "MATCHING", "quote_status": "READY", "price_usd": 7.0, "courier_payout_usd": 5.0},
        )

    async def test_creation_initializes_version_and_publication_is_scoped(self):
        delivery = await self.create_ready_delivery()
        self.assertEqual(delivery["realtime_version"], 1)
        published = self.publish.await_args_list[0].args[0]
        self.assertEqual(published.envelope.version, 1)
        self.assertTrue(principal_can_receive(RealtimePrincipal("customer-1", "passenger"), published.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal("customer-2", "passenger"), published.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal("admin-1", "admin"), published.audience))

    async def test_assignment_status_location_arrival_and_terminal_versions_are_monotonic(self):
        delivery = await self.create_ready_delivery()
        claimed = await claim_courier_offer(delivery["id"], self.courier)
        assignment = self.publish.await_args_list[-1].args[0]
        self.assertTrue(principal_can_receive(RealtimePrincipal("customer-1", "passenger"), assignment.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal("courier-1", "courier"), assignment.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal("customer-2", "passenger"), assignment.audience))
        moving = await update_delivery_status(delivery["id"], "PICKED_UP", self.courier)
        location = await update_courier_location(
            delivery["id"],
            {"latitude": -17.80, "longitude": 31.06, "accuracy": 8},
            self.courier,
        )
        arriving = await update_courier_location(
            delivery["id"],
            {"latitude": -17.7592, "longitude": 31.0909, "accuracy": 7},
            self.courier,
        )
        pin = (await get_delivery_pin(delivery["id"], self.customer))["pin"]
        terminal = await complete_delivery_with_pin(delivery["id"], pin, self.courier)
        versions = [claimed["realtime_version"], moving["realtime_version"], location["realtime_version"], arriving["realtime_version"], terminal["realtime_version"]]
        self.assertEqual(versions, sorted(versions))
        self.assertEqual(len(versions), len(set(versions)))
        types = [call.args[0].envelope.type for call in self.publish.await_args_list]
        self.assertIn("courier_delivery.status_changed", types)
        self.assertIn("courier_delivery.location_updated", types)
        self.assertEqual(types[-1], "courier_delivery.terminal")
        for call in self.publish.await_args_list:
            encoded = json.dumps(call.args[0].envelope.payload)
            self.assertNotIn(pin, encoded)
            self.assertNotIn("handoff_pin", encoded.lower())

    async def test_route_refresh_has_its_own_committed_version_and_event(self):
        delivery = await self.create_ready_delivery()
        await claim_courier_offer(delivery["id"], self.courier)
        self.publish.reset_mock()
        route = {"distance_km": 3.2, "estimated_duration_minutes": 8, "encoded_polyline": "abc"}
        with patch("app.services.courier_service.get_settings", return_value=SimpleNamespace(routing_configured=True)), patch(
            "app.services.courier_service.compute_route", new=AsyncMock(return_value=route)
        ):
            updated = await update_courier_location(
                delivery["id"],
                {"latitude": -17.82, "longitude": 31.05, "accuracy": 6},
                self.courier,
            )
        self.assertEqual(updated["remaining_eta_minutes"], 8)
        events = [call.args[0] for call in self.publish.await_args_list]
        self.assertEqual([item.envelope.type for item in events], [
            "courier_delivery.location_updated",
            "courier_delivery.route_updated",
        ])
        self.assertEqual(events[1].envelope.version, events[0].envelope.version + 1)

    async def test_publish_failure_never_rolls_back_committed_rest_truth(self):
        self.publish.side_effect = RuntimeError("redis unavailable")
        delivery = await self.create_ready_delivery()
        stored = await database.find_one("courier_deliveries", {"id": delivery["id"]})
        self.assertEqual(stored["realtime_version"], 1)

    async def test_concurrent_location_mutations_get_unique_increasing_versions(self):
        delivery = await self.create_ready_delivery()
        claimed = await claim_courier_offer(delivery["id"], self.courier)
        with patch("app.services.courier_service.get_settings", return_value=SimpleNamespace(routing_configured=False)):
            first, second = await asyncio.gather(
                update_courier_location(delivery["id"], {"latitude": -17.82, "longitude": 31.05}, self.courier),
                update_courier_location(delivery["id"], {"latitude": -17.81, "longitude": 31.06}, self.courier),
            )
        self.assertEqual(sorted([first["realtime_version"], second["realtime_version"]]), [
            claimed["realtime_version"] + 1,
            claimed["realtime_version"] + 2,
        ])

    async def test_late_gps_cannot_resurrect_terminal_delivery(self):
        delivery = await self.create_ready_delivery()
        await claim_courier_offer(delivery["id"], self.courier)
        await update_delivery_status(delivery["id"], "PICKED_UP", self.courier)
        await update_courier_location(delivery["id"], {"latitude": -17.7592, "longitude": 31.0909}, self.courier)
        pin = (await get_delivery_pin(delivery["id"], self.customer))["pin"]
        terminal = await complete_delivery_with_pin(delivery["id"], pin, self.courier)
        late = await update_courier_location(delivery["id"], {"latitude": -17.75, "longitude": 31.09}, self.courier)
        self.assertEqual(late["status"], "DELIVERED")
        self.assertFalse(late["live_tracking_active"])
        self.assertEqual(late["realtime_version"], terminal["realtime_version"])


if __name__ == "__main__":
    unittest.main()
