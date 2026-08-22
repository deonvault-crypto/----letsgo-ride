import unittest
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.delivery_quote_service import (
    apply_calculated_delivery_quote,
    customer_quote_preview,
)


class CourierQuotePreviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_customer_preview_hides_courier_payout_and_returns_real_route_shape(self):
        route = {
            "provider": "google",
            "distance_km": 11.765,
            "estimated_duration_minutes": 20,
            "origin_address": "Harare CBD, Harare, Zimbabwe",
            "destination_address": "Borrowdale, Harare, Zimbabwe",
            "origin": {"latitude": -17.8292, "longitude": 31.0522},
            "destination": {"latitude": -17.7700, "longitude": 31.0800},
        }
        pricing = {
            "currency": "USD",
            "price_usd": 7.21,
            "courier_payout_usd": 5.41,
            "platform_fee_usd": 1.80,
            "distance_km": 11.765,
            "estimated_duration_minutes": 20,
            "pricing_source": "AUTOMATIC_POLICY",
        }

        with patch(
            "app.services.delivery_quote_service.calculate_delivery_quote",
            new=AsyncMock(return_value={"route": route, "pricing": pricing}),
        ):
            preview = await customer_quote_preview(
                "Harare CBD, Harare, Zimbabwe",
                "Borrowdale, Harare, Zimbabwe",
            )

        self.assertEqual(preview["price_usd"], 7.21)
        self.assertEqual(preview["distance_km"], 11.765)
        self.assertEqual(preview["estimated_duration_minutes"], 20)
        self.assertEqual(preview["route_provider"], "google")
        self.assertEqual(preview["pickup_location"], route["origin"])
        self.assertEqual(preview["dropoff_location"], route["destination"])
        self.assertNotIn("courier_payout_usd", preview)
        self.assertNotIn("platform_fee_usd", preview)

    async def test_applying_server_quote_persists_map_coordinates_and_matching_state(self):
        delivery = await database.insert_one(
            "courier_deliveries",
            {
                "id": "delivery-preview-1",
                "sender_user_id": "sender-1",
                "status": "REQUESTED",
                "quote_status": "PENDING",
                "courier_user_id": None,
                "pickup_address": "Harare CBD",
                "dropoff_address": "Borrowdale",
                "pickup_location": None,
                "dropoff_location": None,
                "source_type": "COURIER_REQUEST",
            },
        )
        calculated = {
            "route": {
                "provider": "google",
                "origin": {"latitude": -17.8292, "longitude": 31.0522},
                "destination": {"latitude": -17.7700, "longitude": 31.0800},
            },
            "pricing": {
                "currency": "USD",
                "price_usd": 7.21,
                "courier_payout_usd": 5.41,
                "platform_fee_usd": 1.80,
                "distance_km": 11.765,
                "estimated_duration_minutes": 20,
                "pricing_source": "AUTOMATIC_POLICY",
            },
        }

        updated = await apply_calculated_delivery_quote(
            delivery,
            calculated,
            actor_user_id="sender-1",
        )

        self.assertEqual(updated["status"], "MATCHING")
        self.assertEqual(updated["quote_status"], "READY")
        self.assertEqual(updated["pickup_location"], calculated["route"]["origin"])
        self.assertEqual(updated["dropoff_location"], calculated["route"]["destination"])
        self.assertEqual(updated["price_usd"], 7.21)

        events = await database.find_many("courier_events", {"delivery_id": delivery["id"]})
        self.assertEqual([event["type"] for event in events], ["DELIVERY_AUTO_QUOTED"])


if __name__ == "__main__":
    unittest.main()
