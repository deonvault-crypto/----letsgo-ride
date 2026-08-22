import json
import unittest

from app.database import database
from app.routers.health import liveness_check, readiness_check


class HealthProbeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_status = database.status

    async def asyncTearDown(self):
        database.status = self.original_status

    async def test_liveness_does_not_depend_on_database(self):
        database.status = "unavailable"
        response = await liveness_check()
        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["status"], "alive")

    async def test_readiness_is_200_when_database_is_connected(self):
        database.status = "connected"
        response = await readiness_check()
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.body)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["status"], "ready")
        self.assertEqual(payload["data"]["database_status"], "connected")

    async def test_readiness_is_503_without_persistent_database(self):
        database.status = "not_configured"
        response = await readiness_check()
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.body)
        self.assertFalse(payload["success"])
        self.assertEqual(payload["data"]["status"], "degraded")
        self.assertEqual(payload["data"]["database_status"], "not_configured")


if __name__ == "__main__":
    unittest.main()
