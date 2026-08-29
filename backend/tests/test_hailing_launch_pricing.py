import unittest

from app.database import COLLECTION_NAMES, database
from app.services.hailing_city_service import (
    DEFAULT_CITY_PRICING,
    LEGACY_CITY_PRICING_V1,
    PRICING_VERSION,
    get_city,
    seed_zimbabwe_service_areas,
)
from app.services.hailing_fare_service import calculate_fare


class HailingLaunchPricingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_new_service_areas_use_driver_first_launch_pricing(self):
        await seed_zimbabwe_service_areas()
        city = await get_city("zw-harare")
        self.assertIsNotNone(city)
        self.assertEqual(city["pricing_version"], PRICING_VERSION)

        economy = city["pricing"]["ECONOMY"]
        self.assertEqual(economy, DEFAULT_CITY_PRICING["ECONOMY"])
        self.assertEqual(economy["platform_commission_percent"], 3.0)
        self.assertEqual(economy["booking_fee"], 0.0)
        self.assertEqual(economy["minimum_fare"], 1.0)

        fare = calculate_fare(city, "ECONOMY", 4.7, 15)
        self.assertEqual(fare["total_fare"], 2.15)
        self.assertEqual(fare["platform_commission"], 0.06)
        self.assertEqual(fare["estimated_driver_earnings"], 2.09)

    async def test_seed_migrates_only_exact_legacy_classes_and_preserves_admin_customization(self):
        await seed_zimbabwe_service_areas()
        legacy_pricing = {ride_class: dict(values) for ride_class, values in LEGACY_CITY_PRICING_V1.items()}
        legacy_pricing["COMFORT"]["base_fare"] = 9.99
        await database.update_one(
            "hailing_cities",
            "zw-harare",
            {"pricing": legacy_pricing, "pricing_version": 1},
        )

        await seed_zimbabwe_service_areas()
        migrated = await get_city("zw-harare")

        self.assertEqual(migrated["pricing_version"], PRICING_VERSION)
        self.assertEqual(migrated["pricing"]["ECONOMY"], DEFAULT_CITY_PRICING["ECONOMY"])
        self.assertEqual(migrated["pricing"]["XL"], DEFAULT_CITY_PRICING["XL"])
        self.assertEqual(migrated["pricing"]["COMFORT"]["base_fare"], 9.99)
        self.assertEqual(
            migrated["pricing"]["COMFORT"]["platform_commission_percent"],
            LEGACY_CITY_PRICING_V1["COMFORT"]["platform_commission_percent"],
        )


if __name__ == "__main__":
    unittest.main()
