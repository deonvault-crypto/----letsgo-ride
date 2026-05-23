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


@lru_cache
def get_settings() -> Settings:
    return Settings()
