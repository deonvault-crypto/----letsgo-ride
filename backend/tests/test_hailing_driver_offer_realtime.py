import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.services.hailing_realtime_service import publish_hailing_driver_offer_realtime


class HailingDriverOfferRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_offer_event_is_private_to_the_target_driver(self):
        offer = {
            "id": "offer-1",
            "trip_id": "trip-1",
            "driver_id": "driver-profile-1",
            "driver_user_id": "driver-user-1",
            "status": "pending",
            "expires_at": "2099-01-01T00:00:30+00:00",
            "updated_at": "2099-01-01T00:00:00+00:00",
        }
        publish = AsyncMock(return_value=True)
        with patch("app.services.hailing_realtime_service.realtime_event_service.publish_user_event", new=publish):
            result = await publish_hailing_driver_offer_realtime(offer, "hailing.offer.created", version=1)

        self.assertTrue(result)
        publish.assert_awaited_once()
        kwargs = publish.await_args.kwargs
        self.assertEqual(kwargs["event_type"], "hailing.offer.created")
        self.assertEqual(kwargs["resource_type"], "hailing_offer")
        self.assertEqual(kwargs["resource_id"], "offer-1")
        self.assertEqual(kwargs["user_ids"], ["driver-user-1"])
        self.assertEqual(kwargs["payload"]["trip_id"], "trip-1")

    def test_dispatch_creation_wires_realtime_and_push_fallback(self):
        source = (Path(__file__).resolve().parents[1] / "app" / "services" / "hailing_trip_service.py").read_text()
        self.assertIn('publish_hailing_driver_offer_realtime(offer, "hailing.offer.created"', source)
        self.assertIn('notification_target": "hailing_driver_offer"', source)
        self.assertIn('title="New Ride Now request"', source)


if __name__ == "__main__":
    unittest.main()
