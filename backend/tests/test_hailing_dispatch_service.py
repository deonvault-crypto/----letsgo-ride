import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.hailing_dispatch_service import (
    dispatch_policy,
    rank_candidates,
    release_candidate_reservation,
    reserve_candidate,
)
from app.services.routing_service import RoutingError


class HailingDispatchServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.memory.clear()

    async def test_road_eta_can_beat_straight_line_nearest_driver(self):
        trip = {
            "id": "trip-a",
            "pickup": {"latitude": -17.8252, "longitude": 31.0335},
        }
        candidates = [
            {
                "driver_id": "driver-near",
                "distance_km": 0.3,
                "location": {"latitude": -17.824, "longitude": 31.034},
            },
            {
                "driver_id": "driver-fast",
                "distance_km": 0.8,
                "location": {"latitude": -17.82, "longitude": 31.04},
            },
        ]
        policy = dispatch_policy({"dispatch": {"eta_rank_limit": 8, "road_eta_ranking_enabled": True}})
        matrix = [
            {"origin_index": 0, "duration_seconds": 480, "distance_meters": 2000},
            {"origin_index": 1, "duration_seconds": 180, "distance_meters": 1200},
        ]
        with patch("app.services.hailing_dispatch_service.compute_route_matrix", new=AsyncMock(return_value=matrix)):
            ranked = await rank_candidates(trip, candidates, policy)
        self.assertEqual([item["driver_id"] for item in ranked], ["driver-fast", "driver-near"])
        self.assertEqual(ranked[0]["pickup_eta_seconds"], 180)

    async def test_route_provider_failure_falls_back_to_geographic_order(self):
        trip = {
            "id": "trip-a",
            "pickup": {"latitude": -17.8252, "longitude": 31.0335},
        }
        candidates = [
            {
                "driver_id": "driver-near",
                "distance_km": 0.3,
                "location": {"latitude": -17.824, "longitude": 31.034},
            },
            {
                "driver_id": "driver-far",
                "distance_km": 0.8,
                "location": {"latitude": -17.82, "longitude": 31.04},
            },
        ]
        policy = dispatch_policy({"dispatch": {"road_eta_ranking_enabled": True}})
        with patch(
            "app.services.hailing_dispatch_service.compute_route_matrix",
            new=AsyncMock(side_effect=RoutingError("provider unavailable")),
        ):
            ranked = await rank_candidates(trip, candidates, policy)
        self.assertEqual([item["driver_id"] for item in ranked], ["driver-near", "driver-far"])
        self.assertNotIn("pickup_eta_seconds", ranked[0])

    async def test_ineligible_and_busy_drivers_are_removed_before_ranking(self):
        now = datetime.now(timezone.utc).isoformat()
        database.memory["hailing_driver_presence"] = [
            {
                "id": "hailing-presence-driver-one",
                "driver_id": "driver-one",
                "driver_user_id": "user-one",
                "city_id": "harare",
                "ride_class": "economy",
                "status": "available",
                "last_seen_at": now,
                "location": {"type": "Point", "coordinates": [31.0335, -17.8252]},
            },
            {
                "id": "hailing-presence-driver-two",
                "driver_id": "driver-two",
                "driver_user_id": "user-two",
                "city_id": "harare",
                "ride_class": "economy",
                "status": "available",
                "last_seen_at": now,
                "location": {"type": "Point", "coordinates": [31.034, -17.824]},
            },
        ]
        database.memory["drivers"] = [
            {
                "id": "driver-one",
                "user_id": "user-one",
                "verification_status": "approved",
                "hailing_eligible": True,
                "hailing_city_id": "harare",
                "hailing_ride_class": "economy",
            },
            {
                "id": "driver-two",
                "user_id": "user-two",
                "verification_status": "approved",
                "hailing_eligible": False,
                "hailing_city_id": "harare",
                "hailing_ride_class": "economy",
            },
        ]
        database.memory["vehicles"] = [
            {"id": "vehicle-one", "driver_id": "driver-one", "verification_status": "approved"},
            {"id": "vehicle-two", "driver_id": "driver-two", "verification_status": "approved"},
        ]
        trip = {
            "id": "trip-one",
            "city_id": "harare",
            "ride_class": "economy",
            "pickup": {"latitude": -17.8252, "longitude": 31.0335},
        }
        from app.services.hailing_dispatch_service import eligible_candidates

        candidates = await eligible_candidates(trip, 5.0, dispatch_policy(None))
        self.assertEqual([item["driver_id"] for item in candidates], ["driver-one"])

        database.memory["hailing_dispatch_offers"] = [
            {
                "id": "offer-one",
                "trip_id": "another-trip",
                "driver_id": "driver-one",
                "status": "pending",
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat(),
            }
        ]
        candidates = await eligible_candidates(trip, 5.0, dispatch_policy(None))
        self.assertEqual(candidates, [])

    async def test_atomic_reservation_prevents_two_trips_claiming_same_driver(self):
        database.memory["hailing_driver_presence"] = [
            {
                "id": "hailing-presence-driver-one",
                "driver_id": "driver-one",
                "status": "available",
                "offered_trip_id": None,
            }
        ]
        first = await reserve_candidate("driver-one", "trip-a")
        second = await reserve_candidate("driver-one", "trip-b")
        self.assertIsNotNone(first)
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
        self.assertEqual(policy.radius_steps_km, (2.0, 4.0, 8.0, 15.0))
        self.assertEqual(policy.next_radius(2.0), 4.0)
        self.assertEqual(policy.next_radius(8.0), 15.0)
        self.assertEqual(policy.candidate_limit, 40)
        self.assertEqual(policy.eta_rank_limit, 40)


if __name__ == "__main__":
    unittest.main()
