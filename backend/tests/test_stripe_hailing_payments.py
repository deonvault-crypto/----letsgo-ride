import hashlib
import hmac
import json
import os
import time
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from app.config import Settings
from app.database import COLLECTION_NAMES, database
from app.models.hailing import HailingCardTripCreateBody, HailingTripCreateBody
from app.services.hailing_city_service import seed_zimbabwe_service_areas
from app.services.stripe_payment_service import (
    create_authorized_hailing_trip,
    create_hailing_authorization,
    handle_stripe_webhook,
    reconcile_hailing_card_payments,
    verify_webhook_signature,
)


STRIPE_SETTINGS = SimpleNamespace(
    stripe_configured=True,
    stripe_enabled=True,
    passenger_card_payments_enabled=True,
    stripe_secret_key="sk_test_example",
    stripe_publishable_key="pk_test_example",
    stripe_webhook_secret="whsec_example",
    stripe_currency="usd",
    stripe_timeout_seconds=2.0,
)


class StripeHailingPaymentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        await seed_zimbabwe_service_areas()
        self.user = await database.insert_one(
            "users",
            {"id": "customer-card", "role": "passenger", "name": "Card Customer"},
        )
        self.quote = await database.insert_one(
            "hailing_quotes",
            {
                "id": "quote-card-123",
                "user_id": self.user["id"],
                "city_id": "zw-harare",
                "pickup": {"formatted_address": "Pickup", "latitude": -17.8248, "longitude": 31.053},
                "dropoff": {"formatted_address": "Dropoff", "latitude": -17.80, "longitude": 31.08},
                "route": {"distance_km": 4.0, "duration_minutes": 10},
                "fare": {
                    "ride_class": "ECONOMY",
                    "total_fare": 3.25,
                    "platform_commission": 0.10,
                    "estimated_driver_earnings": 3.15,
                },
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat(),
            },
        )

    def test_cash_contract_cannot_bypass_stripe_and_card_contract_rejects_raw_card_data(self):
        with self.assertRaises(ValidationError):
            HailingTripCreateBody(
                quote_id="quote-card-123",
                payment_method="card",
                client_request_id="hail-request-123",
            )
        with self.assertRaises(ValidationError):
            HailingCardTripCreateBody(
                quote_id="quote-card-123",
                payment_method="card",
                client_request_id="hail-request-123",
                stripe_payment_intent_id="pi_test123",
                card_number="4242424242424242",
            )

    def test_production_and_internal_test_stripe_modes_fail_closed_when_keys_are_mixed(self):
        base = {
            "MONGODB_URI": "",
            "CORS_ORIGINS": "https://letsgoride.site",
            "PUBLIC_API_BASE_URL": "https://example.invalid",
            "STRIPE_ENABLED": "true",
            "STRIPE_WEBHOOK_SECRET": "whsec_example",
        }
        with patch.dict(
            os.environ,
            {
                **base,
                "APP_ENV": "production",
                "STRIPE_SECRET_KEY": "sk_test_wrong",
                "STRIPE_PUBLISHABLE_KEY": "pk_test_wrong",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Production Stripe payments require live-mode keys"):
                Settings()

        with patch.dict(
            os.environ,
            {
                **base,
                "APP_ENV": "test",
                "STRIPE_SECRET_KEY": "sk_live_wrong",
                "STRIPE_PUBLISHABLE_KEY": "pk_live_wrong",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Non-production Stripe checks require test-mode keys"):
                Settings()

    async def test_authorization_amount_comes_only_from_server_quote_and_is_idempotent(self):
        intent = {
            "id": "pi_authorized123",
            "client_secret": "pi_authorized123_secret_safe",
            "status": "requires_payment_method",
            "amount": 325,
            "currency": "usd",
        }
        stripe_request = AsyncMock(return_value=intent)
        with patch("app.services.stripe_payment_service.get_settings", return_value=STRIPE_SETTINGS), patch(
            "app.services.stripe_payment_service._stripe_request", stripe_request
        ):
            result = await create_hailing_authorization(
                self.quote["id"],
                "hail-request-123",
                self.user,
            )
        self.assertEqual(result["amount"], 325)
        self.assertEqual(result["publishable_key"], "pk_test_example")
        kwargs = stripe_request.await_args.kwargs
        self.assertEqual(kwargs["data"]["amount"], 325)
        self.assertEqual(kwargs["data"]["capture_method"], "manual")
        self.assertEqual(kwargs["idempotency_key"], "hail-auth:customer-card:quote-card-123:hail-request-123")

    async def test_dispatch_starts_only_after_matching_authorization(self):
        intent = {
            "id": "pi_authorized123",
            "status": "requires_capture",
            "amount": 325,
            "currency": "usd",
            "metadata": {
                "product": "ride_now",
                "quote_id": self.quote["id"],
                "user_id": self.user["id"],
                "client_request_id": "hail-request-123",
            },
        }
        with patch("app.services.stripe_payment_service.get_settings", return_value=STRIPE_SETTINGS), patch(
            "app.services.stripe_payment_service.retrieve_payment_intent", new=AsyncMock(return_value=intent)
        ), patch(
            "app.services.hailing_trip_service.create_dispatch_offer", new=AsyncMock(return_value=None)
        ) as dispatch, patch(
            "app.services.stripe_payment_service.publish_hailing_trip_realtime", new=AsyncMock(return_value=True)
        ), patch(
            "app.services.stripe_payment_service.publish_hailing_admin_realtime", new=AsyncMock(return_value=True)
        ):
            trip = await create_authorized_hailing_trip(
                {
                    "quote_id": self.quote["id"],
                    "payment_method": "card",
                    "client_request_id": "hail-request-123",
                    "stripe_payment_intent_id": intent["id"],
                    "verify_ride_with_pin": False,
                },
                self.user,
            )
        self.assertEqual(trip["payment_method"], "card")
        self.assertEqual(trip["payment_status"], "authorized")
        self.assertEqual(trip["status"], "SEARCHING")
        self.assertNotIn("stripe_payment_intent_id", trip)
        dispatch.assert_awaited_once()

    async def test_completed_card_trip_reconciles_capture_without_blocking_trip_state(self):
        await database.insert_one(
            "hailing_trips",
            {
                "id": "trip-card-1",
                "passenger_user_id": self.user["id"],
                "payment_method": "card",
                "payment_status": "authorized",
                "stripe_payment_intent_id": "pi_authorized123",
                "status": "COMPLETED",
                "realtime_version": 4,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        with patch(
            "app.services.stripe_payment_service.capture_hailing_trip_payment",
            new=AsyncMock(return_value="paid"),
        ), patch(
            "app.services.stripe_payment_service.publish_hailing_trip_realtime",
            new=AsyncMock(return_value=True),
        ):
            result = await reconcile_hailing_card_payments()
        stored = await database.find_one("hailing_trips", {"id": "trip-card-1"})
        self.assertEqual(result["captured"], 1)
        self.assertEqual(stored["status"], "COMPLETED")
        self.assertEqual(stored["payment_status"], "paid")
        self.assertEqual(stored["realtime_version"], 5)

    async def test_webhook_signature_and_event_are_idempotent(self):
        trip = await database.insert_one(
            "hailing_trips",
            {
                "id": "trip-webhook",
                "passenger_user_id": self.user["id"],
                "payment_method": "card",
                "payment_status": "authorized",
                "stripe_payment_intent_id": "pi_webhook123",
                "status": "COMPLETED",
                "realtime_version": 2,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        payload = json.dumps(
            {
                "id": "evt_payment_success",
                "type": "payment_intent.succeeded",
                "data": {"object": {"id": "pi_webhook123", "status": "succeeded"}},
            },
            separators=(",", ":"),
        ).encode()
        timestamp = int(time.time())
        signature = hmac.new(
            STRIPE_SETTINGS.stripe_webhook_secret.encode(),
            f"{timestamp}.".encode() + payload,
            hashlib.sha256,
        ).hexdigest()
        header = f"t={timestamp},v1={signature}"
        verify_webhook_signature(payload, header, STRIPE_SETTINGS.stripe_webhook_secret)
        with patch("app.services.stripe_payment_service.get_settings", return_value=STRIPE_SETTINGS), patch(
            "app.services.stripe_payment_service.publish_hailing_trip_realtime", new=AsyncMock(return_value=True)
        ):
            await handle_stripe_webhook(payload, header)
            first = await database.find_one("hailing_trips", {"id": trip["id"]})
            await handle_stripe_webhook(payload, header)
            second = await database.find_one("hailing_trips", {"id": trip["id"]})
        self.assertEqual(first["payment_status"], "paid")
        self.assertEqual(second["realtime_version"], first["realtime_version"])

    def test_invalid_webhook_signature_is_rejected(self):
        with self.assertRaises(ValueError):
            verify_webhook_signature(b"{}", f"t={int(time.time())},v1=bad", "whsec_example")


if __name__ == "__main__":
    unittest.main()
