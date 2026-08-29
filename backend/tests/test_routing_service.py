import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.routing_service import (
    RoutingError,
    RoutingNotConfiguredError,
    autocomplete_places,
    compute_route,
    compute_route_matrix,
    geocode_address,
    reverse_geocode_location,
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

    async def test_compute_route_matrix_returns_pickup_eta_by_origin(self):
        provider_payload = [
            {
                "originIndex": 1,
                "destinationIndex": 0,
                "status": {},
                "condition": "ROUTE_EXISTS",
                "distanceMeters": 1800,
                "duration": "240s",
            },
            {
                "originIndex": 0,
                "destinationIndex": 0,
                "status": {},
                "condition": "ROUTE_EXISTS",
                "distanceMeters": 900,
                "duration": "420s",
            },
        ]
        origins = [
            {"latitude": -17.8252, "longitude": 31.0335},
            {"latitude": -17.82, "longitude": 31.045},
        ]
        destination = {"latitude": -17.8248, "longitude": 31.053}

        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json_list", return_value=provider_payload
        ) as request_json:
            result = await compute_route_matrix(origins, destination)

        self.assertEqual(result[0], {"origin_index": 1, "distance_meters": 1800, "duration_seconds": 240})
        self.assertEqual(result[1], {"origin_index": 0, "distance_meters": 900, "duration_seconds": 420})
        kwargs = request_json.call_args.kwargs
        self.assertEqual(kwargs["json"]["routingPreference"], "TRAFFIC_AWARE")
        self.assertEqual(kwargs["json"]["regionCode"], "ZW")
        self.assertEqual(len(kwargs["json"]["origins"]), 2)
        self.assertNotIn("test-key", str(kwargs["json"]))

    async def test_route_matrix_ignores_unroutable_elements(self):
        provider_payload = [
            {
                "originIndex": 0,
                "destinationIndex": 0,
                "condition": "ROUTE_NOT_FOUND",
            },
            {
                "originIndex": 1,
                "destinationIndex": 0,
                "status": {"code": 7},
                "condition": "ROUTE_MATRIX_ELEMENT_CONDITION_UNSPECIFIED",
            },
        ]
        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json_list", return_value=provider_payload
        ):
            with self.assertRaises(RoutingError):
                await compute_route_matrix(
                    [{"latitude": -17.82, "longitude": 31.04}, {"latitude": -17.81, "longitude": 31.05}],
                    {"latitude": -17.8248, "longitude": 31.053},
                )

    async def test_reverse_geocode_returns_customer_facing_address(self):
        provider_payload = {
            "results": [
                {
                    "formattedAddress": "Samora Machel Ave, Harare, Zimbabwe",
                    "placeId": "place-current",
                    "location": {"latitude": -17.8252, "longitude": 31.0335},
                }
            ]
        }
        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json", return_value=provider_payload
        ) as request_json:
            result = await reverse_geocode_location({"latitude": -17.8252, "longitude": 31.0335})

        self.assertEqual(result["formatted_address"], "Samora Machel Ave, Harare, Zimbabwe")
        self.assertEqual(result["place_id"], "place-current")
        self.assertEqual(result["location"]["longitude"], 31.0335)
        self.assertNotIn("api_key", result)
        self.assertIn("-17.8252,31.0335", request_json.call_args.args[1])

    async def test_autocomplete_uses_zimbabwe_fallback_when_provider_is_unavailable(self):
        with patch("app.services.routing_service.get_settings", return_value=self.google_settings()), patch(
            "app.services.routing_service._request_json", side_effect=RoutingError("provider timeout")
        ):
            results = await autocomplete_places("Sam Levy")

        self.assertTrue(results)
        self.assertEqual(results[0]["provider"], "letsgoride_zw")
        self.assertEqual(results[0]["location"]["latitude"], -17.7622)
        self.assertIn("Borrowdale", results[0]["description"])


if __name__ == "__main__":
    unittest.main()
