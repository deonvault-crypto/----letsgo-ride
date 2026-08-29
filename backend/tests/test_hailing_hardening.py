import asyncio
import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.models.hailing import HailingCityUpsertBody
from app.services.hailing_city_service import get_city, list_service_areas, seed_zimbabwe_service_areas, upsert_city
from app.services.hailing_security_service import clear_legacy_plaintext_hailing_pins
from app.services.hailing_trip_service import hailing_dispatch_sweeper


class HailingHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_listing_empty_service_areas_does_not_implicitly_seed(self):
        self.assertEqual(await list_service_areas(include_disabled=True), [])
        self.assertEqual(await database.find_many("hailing_cities"), [])

    async def test_disabled_dispatch_sweeper_exits_without_work(self):
        disabled = type("Settings", (), {"hailing_enabled": False})()
        with patch("app.services.hailing_trip_service.get_settings", return_value=disabled):
            await asyncio.wait_for(hailing_dispatch_sweeper(asyncio.Event()), timeout=0.2)
        self.assertEqual(await database.find_many("hailing_dispatch_offers"), [])

    async def test_legacy_plaintext_pin_cleanup_keeps_hash_record(self):
        await database.insert_one(
            "hailing_trips",
            {
                "id": "legacy-pin-trip",
                "plain_trip_pin": "123456",
                "trip_pin_salt": "salt-kept",
                "trip_pin_code_hash": "hash-kept",
            },
        )
        changed = await clear_legacy_plaintext_hailing_pins()
        self.assertEqual(changed, 1)
        stored = await database.find_one("hailing_trips", {"id": "legacy-pin-trip"})
        self.assertIsNone(stored["plain_trip_pin"])
        self.assertEqual(stored["trip_pin_salt"], "salt-kept")
        self.assertEqual(stored["trip_pin_code_hash"], "hash-kept")

    async def test_partial_city_update_preserves_existing_pricing_and_dispatch(self):
        await seed_zimbabwe_service_areas()
        admin = {"id": "admin-test", "role": "admin"}
        first = HailingCityUpsertBody(
            name="Harare",
            slug="harare",
            province="Harare Metropolitan",
            latitude=-17.824858,
            longitude=31.053028,
            service_radius_km=35,
            economy_base_fare=1.25,
            economy_per_km=0.55,
            economy_platform_commission_percent=3.0,
            initial_radius_km=1.0,
            radius_steps_km=[1.0, 3.0, 7.0, 12.0],
            maximum_radius_km=12.0,
        )
        await upsert_city(first.model_dump(exclude_unset=True), admin)

        second = HailingCityUpsertBody(
            name="Harare",
            slug="harare",
            province="Harare Metropolitan",
            latitude=-17.824858,
            longitude=31.053028,
            service_radius_km=35,
            enabled=False,
        )
        await upsert_city(second.model_dump(exclude_unset=True), admin)

        stored = await get_city("zw-harare")
        self.assertIsNotNone(stored)
        self.assertFalse(stored["enabled"])
        self.assertEqual(stored["pricing"]["ECONOMY"]["base_fare"], 1.25)
        self.assertEqual(stored["pricing"]["ECONOMY"]["per_km"], 0.55)
        self.assertEqual(stored["pricing"]["ECONOMY"]["platform_commission_percent"], 3.0)
        self.assertEqual(stored["dispatch"]["radius_steps_km"], [1.0, 3.0, 7.0, 12.0])
        self.assertEqual(stored["dispatch"]["maximum_radius_km"], 12.0)


if __name__ == "__main__":
    unittest.main()
