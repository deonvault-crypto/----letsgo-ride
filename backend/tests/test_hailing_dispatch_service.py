import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.services.hailing_dispatch_service import (
    dispatch_policy,
    ranked_dispatch_candidates,
    release_candidate_reservation,
    reserve_candidate,
)
from app.services.routing_service import RoutingError
from app.utils import now_iso


class HailingDispatchServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

        self.trip = {
            "id": "trip-a",
            "city_id": "zw-harare",
            "ride_class": "ECONOMY",
            "pickup": {"latitude": -17.8248, "longitude": 31.053},
        }
        self.policy = dispatch_policy(
            {
                "dispatch": {
                    "candidate_limit": 16,
                    "eta_rank_limit": 8,
                    "road_eta_ranking_enabled": True,
                    "driver_stale_seconds": 75,
                }
            }
        )

    async def _add_driver(self, suffix: str, longitude: float):
        driver_id = f"driver-{suffix}"
        user_id = f"user-{suffix}"
        await database.insert_one(
            "drivers",
            {
                "id": driver_id,
                "user_id": user_id,
                "verified": True,
                "verification_status": "approved",
                "status": "active",
                "hailing_enabled": True,
                "approved_hailing_city_ids": ["zw-harare"],
                "approved_hailing_classes": ["ECONOMY"],
            },
        )
        return await database.insert_one(
            "hailing_driver_presence",
            {
                "id": f"hailing-presence-{driver_id}",
                "driver_id": driver_id,
                "user_id": user_id,
                "city_id": "zw-harare",
                "ride_class": "ECONOMY",
                "status": "available",
                "location": {"type": "Point", "coordinates": [longitude, -17.8248]},
                "last_seen_at": now_iso(),
            },
        )

    def _settings(self, *, routing_configured: bool):
        return SimpleNamespace(hailing_enabled=True, routing_configured=routing_configured)

    async def test_road_eta_can_beat_straight_line_nearest_driver(self):
        await self._add_driver("near", 31.054)
        await self._add_driver("fast", 31.058)
        matrix = [
            {"origin_index": 0, "distance_meters": 2400, "duration_seconds": 540},
            {"origin_index": 1, "distance_meters": 1800, "duration_seconds": 180},
        ]
        with patch("app.services.hailing_dispatch_service.get_settings", return_value=self._settings(routing_configured=True)), patch(
            "app.services.hailing_dispatch_service.compute_route_matrix",
            new=AsyncMock(return_value=matrix),
        ):
            ranked = await ranked_dispatch_candidates(self.trip, 2.0, self.policy)

        self.assertEqual([item["driver_id"] for item in ranked], ["driver-fast", "driver-near"])
        self.assertEqual(ranked[0]["ranking_method"], "road_eta")
        self.assertEqual(ranked[0]["pickup_eta_seconds"], 180)

    async def test_route_provider_failure_falls_back_to_geographic_order(self):
        await self._add_driver("near", 31.054)
        await self._add_driver("far", 31.06)
        with patch("app.services.hailing_dispatch_service.get_settings", return_value=self._settings(routing_configured=True)), patch(
            "app.services.hailing_dispatch_service.compute_route_matrix",
            new=AsyncMock(side_effect=RoutingError("provider unavailable")),
        ):
            ranked = await ranked_dispatch_candidates(self.trip, 2.0, self.policy)

        self.assertEqual([item["driver_id"] for item in ranked], ["driver-near", "driver-far"])
        self.assertTrue(all(item["ranking_method"] == "geo_distance" for item in ranked))

    async def test_ineligible_and_busy_drivers_are_removed_before_ranking(self):
        await self._add_driver("free", 31.054)
        await self._add_driver("busy", 31.055)
        await database.insert_one(
            "hailing_dispatch_offers",
            {"id": "offer-busy", "trip_id": "other-trip", "driver_id": "driver-busy", "status": "pending"},
        )
        with patch("app.services.hailing_dispatch_service.get_settings", return_value=self._settings(routing_configured=False)):
            ranked = await ranked_dispatch_candidates(self.trip, 2.0, self.policy)

        self.assertEqual([item["driver_id"] for item in ranked], ["driver-free"])

    async def test_atomic_reservation_prevents_two_trips_claiming_same_driver(self):
        candidate = await self._add_driver("one", 31.054)
        candidate = {**candidate, "pickup_distance_km": 0.1, "dispatch_location": {"latitude": -17.8248, "longitude": 31.054}}
        first = await reserve_candidate(candidate, self.trip, self.policy)
        self.assertIsNotNone(first)

        second_trip = {**self.trip, "id": "trip-b"}
        second = await reserve_candidate(candidate, second_trip, self.policy)
        self.assertIsNone(second)

        wrong_release = await release_candidate_reservation("driver-one", "trip-b")
        self.assertIsNone(wrong_release)
        still_reserved = await database.find_one("hailing_driver_presence", {"driver_id": "driver-one"})
        self.assertEqual(still_reserved["status"], "offered")
        self.assertEqual(still_reserved["offered_trip_id"], "trip-a")

        released = await release_candidate_reservation("driver-one", "trip-a")
        self.assertEqual(released["status"], "available")
        self.assertIsNone(released["offered_trip_id"])

    async def test_policy_normalizes_progressive_radius_and_limits(self):
        policy = dispatch_policy(
            {
                "dispatch": {
                    "radius_steps_km": [8, 2, 4, 4, 20],
                    "maximum_radius_km": 15,
                    "candidate_limit": 200,
                    "eta_rank_limit": 100,
                }
            }
        )
        self.assertEqual(policy.radius_steps_km, (2.0, 4.0, 8.0))
        self.assertEqual(policy.next_radius(2.0), 4.0)
        self.assertEqual(policy.next_radius(8.0), 15.0)
        self.assertEqual(policy.candidate_limit, 40)
        self.assertEqual(policy.eta_rank_limit, 40)


if __name__ == "__main__":
    unittest.main()
