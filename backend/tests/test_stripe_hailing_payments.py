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

    def test_invalid_webhook_signature_is_rejected(self):
        with self.assertRaises(ValueError):
            verify_webhook_signature(b"{}", f"t={int(time.time())},v1=bad", "whsec_example")


if __name__ == "__main__":
    unittest.main()
