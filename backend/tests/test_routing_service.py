import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.routing_service import (
    RoutingNotConfiguredError,
    compute_route,
    geocode_address,
    routing_status,
)


class RoutingServiceTests(unittest.IsolatedAsyncioTestCase):
    def google_settings(self):
        return SimpleNamespace(
            routing_provider="google",
            google_maps_api_key="test-key",
            routing_region_code="ZW",
            routing_timeout_seconds=8.0,
            routing_configured=True,
        )

    async def test_disabled_provider_fails_closed(self):
        settings = SimpleNamespace(
            routing_provider="disabled",
            google_maps_api_key="",
            routing_region_code="ZW",
            routing_timeout_seconds=8.0,
            routing_configured=False,
        )
        with patch("app.services.routing_service.get_settings", return_value=settings):
            self.assertEqual(routing_status()["configured"], False)
            with self.assertRaises(RoutingNotConfiguredError):
                await geocode_address("Harare CBD")

    async def test_geocode_returns_normalized_point_without_exposing_key(self):
        provider_payload = {
            "results": [
                {
                    "formattedAddress": "Samora Machel Ave, Harare, Zimbabwe",
                    "placeId": "place-123",
                    "location": {"latitude": -17.8252, "longitude": 31.0335},
                }
            ]
        }
        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json", return_value=provider_payload
        ) as request_json:
            result = await geocode_address("Samora Machel Ave, Harare")

        self.assertEqual(result["provider"], "google")
        self.assertEqual(result["place_id"], "place-123")
        self.assertEqual(result["location"]["latitude"], -17.8252)
        self.assertNotIn("api_key", result)
        kwargs = request_json.call_args.kwargs
        self.assertEqual(kwargs["params"]["regionCode"], "ZW")
        self.assertEqual(kwargs["headers"]["X-Goog-Api-Key"], "test-key")

    async def test_compute_route_parses_distance_duration_and_polyline(self):
        provider_payload = {
            "routes": [
                {
                    "distanceMeters": 7250,
                    "duration": "1440s",
                    "polyline": {"encodedPolyline": "encoded-route"},
                }
            ]
        }
        origin = {"latitude": -17.8252, "longitude": 31.0335}
        destination = {"latitude": -17.78, "longitude": 31.08}

        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json", return_value=provider_payload
        ):
            result = await compute_route(origin, destination)

        self.assertEqual(result["distance_meters"], 7250)
        self.assertEqual(result["distance_km"], 7.25)
        self.assertEqual(result["duration_seconds"], 1440)
        self.assertEqual(result["estimated_duration_minutes"], 24)
        self.assertEqual(result["encoded_polyline"], "encoded-route")
        self.assertEqual(result["origin"], origin)
        self.assertEqual(result["destination"], destination)


if __name__ == "__main__":
    unittest.main()
