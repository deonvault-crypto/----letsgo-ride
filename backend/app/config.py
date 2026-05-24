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
        self.resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
        self.resend_from_email = (
            os.getenv("RESEND_FROM_EMAIL")
            or os.getenv("RESEND_SENDER_EMAIL")
            or os.getenv("RESEND_FROM")
            or ""
        ).strip()
        self.resend_reply_to = (os.getenv("RESEND_REPLY_TO") or os.getenv("RESEND_REPLY_TO_EMAIL") or "").strip()
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
