import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.database import database
from app.routers.health import email_config_check, liveness_check, readiness_check


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

    async def test_production_email_health_exposes_only_provider_and_readiness(self):
        settings = SimpleNamespace(
            is_production=True,
            resend_configured=True,
            resend_api_key_present=True,
            resend_api_key_prefix_ok=True,
            resend_api_key_length=40,
            resend_from_email="private@example.invalid",
            resend_reply_to="private@example.invalid",
        )
        with patch("app.routers.health.get_settings", return_value=settings):
            response = await email_config_check()
        self.assertEqual(response, {"provider": "resend", "configured": True})

    async def test_nonproduction_email_health_keeps_diagnostics(self):
        settings = SimpleNamespace(
            is_production=False,
            resend_configured=True,
            resend_api_key_present=True,
            resend_api_key_prefix_ok=True,
            resend_api_key_length=40,
            resend_from_email="staging@example.invalid",
            resend_reply_to="reply@example.invalid",
        )
        with patch("app.routers.health.get_settings", return_value=settings):
            response = await email_config_check()
        self.assertTrue(response["api_key_present"])
        self.assertEqual(response["api_key_length"], 40)
        self.assertEqual(response["from_email"], "staging@example.invalid")


if __name__ == "__main__":
    unittest.main()
