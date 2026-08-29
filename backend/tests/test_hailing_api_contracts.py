import unittest

from app.services.hailing_fare_service import public_quote, public_route


class HailingApiContractTests(unittest.TestCase):
    def test_public_route_normalizes_provider_fields_for_mobile(self):
        route = public_route({
            "distance_meters": 6500,
            "estimated_duration_minutes": 15,
            "encoded_polyline": "encoded",
        })
        self.assertEqual(route["distance_km"], 6.5)
        self.assertEqual(route["duration_minutes"], 15)
        self.assertEqual(route["polyline"], "encoded")

    def test_public_quote_exposes_nested_fare_contract(self):
        quote = public_quote({
            "id": "quote-contract",
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "Pickup"},
            "dropoff": {"formatted_address": "Dropoff"},
            "route": {
                "distance_km": 6.5,
                "estimated_duration_minutes": 15,
                "encoded_polyline": "encoded",
            },
            "fare": {
                "currency": "USD",
                "ride_class": "ECONOMY",
                "base_fare": 2.0,
                "distance_fare": 5.2,
                "time_fare": 1.2,
                "booking_fee": 0.5,
                "minimum_fare": 3.0,
                "surge_multiplier": 1.0,
                "total_fare": 8.9,
                "estimated_driver_earnings": 8.63,
            },
            "expires_at": "2099-01-01T00:00:00+00:00",
        })
        self.assertEqual(quote["ride_class"], "ECONOMY")
        self.assertEqual(quote["currency"], "USD")
        self.assertEqual(quote["fare"]["total_fare"], 8.9)
        self.assertEqual(quote["route"]["duration_minutes"], 15)
        self.assertEqual(quote["route"]["distance_km"], 6.5)


if __name__ == "__main__":
    unittest.main()
