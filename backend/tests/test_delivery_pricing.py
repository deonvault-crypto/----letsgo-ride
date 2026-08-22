import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.delivery_quote_service import maybe_auto_quote_delivery
from app.services.pricing_service import calculate_delivery_pricing


class DeliveryPricingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    def pricing_settings(self):
        return SimpleNamespace(
            courier_auto_pricing_enabled=True,
            courier_pricing_configured=True,
            courier_base_price_usd=1.0,
            courier_price_per_km_usd=0.5,
            courier_price_per_minute_usd=0.05,
            courier_minimum_price_usd=2.0,
            courier_payout_percent=70.0,
        )

    async def test_pricing_policy_is_server_calculated_and_split(self):
        with patch("app.services.pricing_service.get_settings", return_value=self.pricing_settings()):
            result = calculate_delivery_pricing(distance_km=6.0, estimated_duration_minutes=20)

        self.assertEqual(result["price_usd"], 5.0)
        self.assertEqual(result["courier_payout_usd"], 3.5)
        self.assertEqual(result["platform_fee_usd"], 1.5)
        self.assertEqual(result["pricing_source"], "AUTOMATIC_POLICY")

    async def test_auto_quote_moves_job_to_matching_and_syncs_food_total(self):
        await database.insert_one(
            "food_orders",
            {
                "id": "food-1",
                "status": "READY_FOR_PICKUP",
                "subtotal_usd": 12.0,
                "delivery_fee_usd": None,
                "total_usd": None,
                "pricing_status": "DELIVERY_FEE_PENDING",
            },
        )
        await database.insert_one(
            "courier_deliveries",
            {
                "id": "delivery-1",
                "status": "REQUESTED",
                "quote_status": "PENDING",
                "courier_user_id": None,
                "pickup_address": "1 Samora Machel Ave, Harare",
                "dropoff_address": "20 Borrowdale Road, Harare",
                "pickup_location": {"latitude": -17.8252, "longitude": 31.0335},
                "dropoff_location": {"latitude": -17.78, "longitude": 31.08},
                "food_order_id": "food-1",
                "source_type": "FOOD_ORDER",
            },
        )

        route_result = {
            "provider": "google",
            "distance_km": 7.2,
            "estimated_duration_minutes": 24,
        }
        price_result = {
            "currency": "USD",
            "price_usd": 4.0,
            "courier_payout_usd": 2.8,
            "platform_fee_usd": 1.2,
            "distance_km": 7.2,
            "estimated_duration_minutes": 24,
            "pricing_source": "AUTOMATIC_POLICY",
        }

        with patch(
            "app.services.delivery_quote_service.routing_status",
            return_value={"configured": True, "provider": "google", "region_code": "ZW"},
        ), patch(
            "app.services.delivery_quote_service.resolve_route",
            new=AsyncMock(return_value=route_result),
        ), patch(
            "app.services.delivery_quote_service.calculate_delivery_pricing",
            return_value=price_result,
        ):
            quoted = await maybe_auto_quote_delivery("delivery-1", actor_user_id="merchant-1")

        self.assertEqual(quoted["status"], "MATCHING")
        self.assertEqual(quoted["quote_status"], "READY")
        self.assertEqual(quoted["price_usd"], 4.0)
        self.assertEqual(quoted["courier_payout_usd"], 2.8)
        self.assertEqual(quoted["route_provider"], "google")

        order = await database.find_one("food_orders", {"id": "food-1"})
        self.assertEqual(order["delivery_fee_usd"], 4.0)
        self.assertEqual(order["total_usd"], 16.0)
        self.assertEqual(order["pricing_status"], "READY")

        events = await database.find_many("courier_events", {"delivery_id": "delivery-1"})
        self.assertEqual([event["type"] for event in events], ["DELIVERY_AUTO_QUOTED"])

    async def test_auto_quote_fails_safe_when_routing_is_disabled(self):
        await database.insert_one(
            "courier_deliveries",
            {
                "id": "delivery-2",
                "status": "REQUESTED",
                "quote_status": "PENDING",
                "pickup_address": "Harare",
                "dropoff_address": "Bulawayo",
            },
        )

        with patch(
            "app.services.delivery_quote_service.routing_status",
            return_value={"configured": False, "provider": "disabled", "region_code": "ZW"},
        ):
            delivery = await maybe_auto_quote_delivery("delivery-2")

        self.assertEqual(delivery["status"], "REQUESTED")
        self.assertEqual(delivery["quote_status"], "PENDING")
        self.assertIsNone(delivery.get("price_usd"))


if __name__ == "__main__":
    unittest.main()
