import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.routers.hailing import admin_cities, hailing_cities, hailing_config


class HailingRouteFailClosedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_config_remains_readable_but_public_operation_is_disabled(self):
        disabled = type("Settings", (), {"hailing_enabled": False})()
        with patch("app.routers.hailing.get_settings", return_value=disabled):
            config = await hailing_config()
            self.assertFalse(config["data"]["enabled"])
            with self.assertRaises(HTTPException) as exc:
                await hailing_cities()
        self.assertEqual(exc.exception.status_code, 503)

    async def test_admin_configuration_read_does_not_implicitly_seed_when_disabled(self):
        response = await admin_cities({"id": "admin-test", "role": "admin"})
        self.assertEqual(response["data"], [])
        self.assertEqual(await database.find_many("hailing_cities"), [])


if __name__ == "__main__":
    unittest.main()
