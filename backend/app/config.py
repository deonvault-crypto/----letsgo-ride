from functools import lru_cache
import os
from typing import List

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_env = os.getenv("APP_ENV", "development")
        self.mongodb_uri = os.getenv("MONGODB_URI", "").strip()
        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "letsgoride")
        self.mock_otp = os.getenv("MOCK_OTP", "123456")
        self.enable_demo_seed = self._parse_bool(os.getenv("ENABLE_DEMO_SEED", "false"))
        self.admin_seed_email = os.getenv("ADMIN_SEED_EMAIL", "").strip()
        self.admin_seed_password = os.getenv("ADMIN_SEED_PASSWORD", "")
        self.admin_auto_create = self._parse_bool(os.getenv("ADMIN_AUTO_CREATE", "false"))
        self.public_api_base_url = self._get_env_first("PUBLIC_API_BASE_URL", "API_PUBLIC_BASE_URL") or "https://letsgoride-backend.onrender.com"
        self.resend_api_key = self._get_env_first("RESEND_API_KEY")
        self.resend_from_email = self._get_env_first(
            "RESEND_FROM_EMAIL",
            "RESEND_SENDER_EMAIL",
            "RESEND_FROM",
        )
        self.resend_reply_to = self._get_env_first(
            "RESEND_REPLY_TO_EMAIL",
            "RESEND_REPLY_TO",
        )
        self.cors_origins = self._parse_origins(
            os.getenv(
                "CORS_ORIGINS",
                "http://localhost:8082,http://localhost:19006",
            )
        )

    @staticmethod
    def _parse_origins(value: str) -> List[str]:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        return origins or ["*"]

    @staticmethod
    def _parse_bool(value: str) -> bool:
        return value.strip().lower() in ("1", "true", "yes", "on")

    @staticmethod
    def _get_env_first(*names: str) -> str:
        for name in names:
            value = os.getenv(name)
            if value and value.strip():
                return value.strip()
        return ""

    @property
    def resend_api_key_present(self) -> bool:
        return bool(self.resend_api_key)

    @property
    def resend_api_key_prefix_ok(self) -> bool:
        return self.resend_api_key.startswith("re_")

    @property
    def resend_api_key_length(self) -> int:
        return len(self.resend_api_key)

    @property
    def resend_configured(self) -> bool:
        return bool(self.resend_api_key and self.resend_from_email)


@lru_cache
def get_settings() -> Settings:
    return Settings()
