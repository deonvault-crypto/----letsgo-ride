import json
import os
import unittest
from unittest.mock import patch

from app.config import get_settings
from app.services.email_service import _safe_error_body, _send_resend_email


class _Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return b'{"id":"email-test-id"}'


class ResendEmailServiceTests(unittest.TestCase):
    def tearDown(self):
        get_settings.cache_clear()

    def test_reply_to_is_sent_without_exposing_credentials(self):
        with patch.dict(
            os.environ,
            {
                "RESEND_API_KEY": "re_test_secret_value",
                "RESEND_FROM_EMAIL": "LetsGoRide <hello@letsgoride.site>",
                "RESEND_REPLY_TO_EMAIL": "support@letsgoride.site",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with patch("app.services.email_service.request.urlopen", return_value=_Response()) as opener:
                sent = _send_resend_email(
                    "person@example.com",
                    "Verify your email",
                    "<p>Code</p>",
                    "Code",
                    "test_email",
                )

            self.assertTrue(sent)
            outbound_request = opener.call_args.args[0]
            payload = json.loads(outbound_request.data.decode("utf-8"))
            self.assertEqual(payload["reply_to"], "support@letsgoride.site")
            self.assertNotIn("re_test_secret_value", outbound_request.data.decode("utf-8"))

    def test_provider_errors_redact_credentials_recipient_and_codes(self):
        sanitized = _safe_error_body(
            "Bearer re_test_secret_value person@example.com 654321",
            "re_test_secret_value",
            "person@example.com",
        )
        self.assertNotIn("re_test_secret_value", sanitized)
        self.assertNotIn("person@example.com", sanitized)
        self.assertNotIn("654321", sanitized)


if __name__ == "__main__":
    unittest.main()
