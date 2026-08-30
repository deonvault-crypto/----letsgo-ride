import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services.hailing_city_service import resolve_service_area, seed_zimbabwe_service_areas


class HailingStagingExternalLocationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        await seed_zimbabwe_service_areas()

    async def test_staging_maps_external_real_device_coordinates_to_harare_market(self):
        staging = SimpleNamespace(app_env="staging", hailing_enabled=True)
        with patch("app.services.hailing_city_service.get_settings", return_value=staging):
            resolved = await resolve_service_area(50.8860187, 20.5796656)

        self.assertTrue(resolved["supported"])
        self.assertTrue(resolved["enabled"])
        self.assertEqual(resolved["reason"], "staging_external_test_location")
        self.assertEqual(resolved["service_area"]["id"], "zw-harare")
        self.assertIn("ECONOMY", resolved["ride_classes"])
        self.assertIsNone(resolved["distance_to_center_km"])

    async def test_production_still_rejects_locations_outside_zimbabwe(self):
        production = SimpleNamespace(app_env="production", hailing_enabled=True)
        with patch("app.services.hailing_city_service.get_settings", return_value=production):
            resolved = await resolve_service_area(50.8860187, 20.5796656)

        self.assertFalse(resolved["supported"])
        self.assertFalse(resolved["enabled"])
        self.assertEqual(resolved["reason"], "outside_zimbabwe")
        self.assertIsNone(resolved["service_area"])


if __name__ == "__main__":
    unittest.main()
