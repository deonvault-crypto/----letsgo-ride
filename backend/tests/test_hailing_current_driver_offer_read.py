import unittest
from unittest.mock import AsyncMock, call, patch

from app.database import database
from app.services.hailing_trip_service import current_driver_offer


class HailingCurrentDriverOfferReadTests(unittest.IsolatedAsyncioTestCase):
    user = {"id": "driver-user-1", "role": "driver"}
    driver = {"id": "driver-1"}

    @staticmethod
    def offer(
        offer_id: str,
        *,
        trip_id: str,
        expires_at: str,
        offered_at: str,
    ):
        return {
            "id": offer_id,
            "trip_id": trip_id,
            "driver_id": "driver-1",
            "driver_user_id": "driver-user-1",
            "status": "pending",
            "expires_at": expires_at,
            "offered_at": offered_at,
        }

    async def test_single_pending_offer_uses_bounded_probe(self):
        offer = self.offer(
            "offer-1",
            trip_id="trip-1",
            expires_at="2999-01-01T00:00:00+00:00",
            offered_at="2026-09-16T10:00:00+00:00",
        )
        trip = {
            "id": "trip-1",
            "status": "SEARCHING",
            "driver_user_id": "driver-user-1",
            "passenger_user_id": "passenger-1",
        }

        with (
            patch(
                "app.services.hailing_trip_service.driver_profile_for_user",
                new=AsyncMock(return_value=self.driver),
            ),
            patch.object(database, "find_many", new=AsyncMock(return_value=[offer])) as find_many,
            patch.object(database, "find_one", new=AsyncMock(return_value=trip)) as find_one,
        ):
            result = await current_driver_offer(self.user)

        self.assertEqual(result["offer"]["id"], "offer-1")
        find_many.assert_awaited_once_with(
            "hailing_dispatch_offers",
            {"driver_id": "driver-1", "status": "pending"},
            limit=2,
        )
        find_one.assert_awaited_once_with("hailing_trips", {"id": "trip-1"})

    async def test_single_expired_offer_returns_none_without_full_scan(self):
        expired = self.offer(
            "offer-expired",
            trip_id="trip-old",
            expires_at="2000-01-01T00:00:00+00:00",
            offered_at="2026-09-16T09:00:00+00:00",
        )

        with (
            patch(
                "app.services.hailing_trip_service.driver_profile_for_user",
                new=AsyncMock(return_value=self.driver),
            ),
            patch.object(database, "find_many", new=AsyncMock(return_value=[expired])) as find_many,
            patch.object(database, "find_one", new=AsyncMock()) as find_one,
        ):
            result = await current_driver_offer(self.user)

        self.assertIsNone(result)
        self.assertEqual(find_many.await_count, 1)
        find_one.assert_not_awaited()

    async def test_single_malformed_expiry_preserves_existing_exclusion(self):
        malformed = self.offer(
            "offer-malformed",
            trip_id="trip-malformed",
            expires_at="not-a-timestamp",
            offered_at="2026-09-16T09:00:00+00:00",
        )

        with (
            patch(
                "app.services.hailing_trip_service.driver_profile_for_user",
                new=AsyncMock(return_value=self.driver),
            ),
            patch.object(database, "find_many", new=AsyncMock(return_value=[malformed])),
            patch.object(database, "find_one", new=AsyncMock()) as find_one,
        ):
            result = await current_driver_offer(self.user)

        self.assertIsNone(result)
        find_one.assert_not_awaited()

    async def test_multiple_pending_offers_fall_back_to_original_selection_semantics(self):
        expired = self.offer(
            "offer-expired",
            trip_id="trip-expired",
            expires_at="2000-01-01T00:00:00+00:00",
            offered_at="2026-09-16T08:00:00+00:00",
        )
        later = self.offer(
            "offer-later",
            trip_id="trip-later",
            expires_at="2999-01-01T00:00:00+00:00",
            offered_at="2026-09-16T10:00:00+00:00",
        )
        earlier = self.offer(
            "offer-earlier",
            trip_id="trip-earlier",
            expires_at="2999-01-01T00:00:00+00:00",
            offered_at="2026-09-16T09:00:00+00:00",
        )
        trip = {
            "id": "trip-earlier",
            "status": "SEARCHING",
            "driver_user_id": "driver-user-1",
            "passenger_user_id": "passenger-1",
        }
        filters = {"driver_id": "driver-1", "status": "pending"}

        with (
            patch(
                "app.services.hailing_trip_service.driver_profile_for_user",
                new=AsyncMock(return_value=self.driver),
            ),
            patch.object(
                database,
                "find_many",
                new=AsyncMock(side_effect=[[expired, later], [later, expired, earlier]]),
            ) as find_many,
            patch.object(database, "find_one", new=AsyncMock(return_value=trip)),
        ):
            result = await current_driver_offer(self.user)

        self.assertEqual(result["offer"]["id"], "offer-earlier")
        self.assertEqual(
            find_many.await_args_list,
            [
                call("hailing_dispatch_offers", filters, limit=2),
                call("hailing_dispatch_offers", filters),
            ],
        )

    async def test_no_pending_offer_returns_none(self):
        with (
            patch(
                "app.services.hailing_trip_service.driver_profile_for_user",
                new=AsyncMock(return_value=self.driver),
            ),
            patch.object(database, "find_many", new=AsyncMock(return_value=[])) as find_many,
            patch.object(database, "find_one", new=AsyncMock()) as find_one,
        ):
            result = await current_driver_offer(self.user)

        self.assertIsNone(result)
        find_many.assert_awaited_once_with(
            "hailing_dispatch_offers",
            {"driver_id": "driver-1", "status": "pending"},
            limit=2,
        )
        find_one.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
