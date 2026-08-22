from functools import lru_cache
import os
from typing import List
from urllib.parse import unquote, urlparse

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

        # Routing/geocoding is intentionally provider-driven. No mobile client receives this key.
        self.routing_provider = os.getenv("ROUTING_PROVIDER", "disabled").strip().lower()
        self.google_maps_api_key = self._get_env_first("GOOGLE_MAPS_API_KEY")
        self.routing_region_code = os.getenv("ROUTING_REGION_CODE", "ZW").strip().upper() or "ZW"
        self.routing_timeout_seconds = self._parse_float(os.getenv("ROUTING_TIMEOUT_SECONDS", "8"), 8.0)
        # Explicitly opt-in to real provider calls during staging startup. Never enabled by default.
        self.routing_staging_smoke_test_enabled = self._parse_bool(
            os.getenv("ROUTING_STAGING_SMOKE_TEST_ENABLED", "false")
        )

        # Delivery pricing is deliberately disabled until commercial rates are explicitly configured.
        self.courier_auto_pricing_enabled = self._parse_bool(
            os.getenv("COURIER_AUTO_PRICING_ENABLED", "false")
        )
        self.courier_base_price_usd = self._parse_nonnegative_float(
            os.getenv("COURIER_BASE_PRICE_USD", "0"), 0.0
        )
        self.courier_price_per_km_usd = self._parse_nonnegative_float(
            os.getenv("COURIER_PRICE_PER_KM_USD", "0"), 0.0
        )
        self.courier_price_per_minute_usd = self._parse_nonnegative_float(
            os.getenv("COURIER_PRICE_PER_MINUTE_USD", "0"), 0.0
        )
        self.courier_minimum_price_usd = self._parse_nonnegative_float(
            os.getenv("COURIER_MINIMUM_PRICE_USD", "0"), 0.0
        )
        self.courier_payout_percent = self._parse_nonnegative_float(
            os.getenv("COURIER_PAYOUT_PERCENT", "0"), 0.0
        )
        # End-to-end dispatch smoke test is staging-only and opt-in.
        self.courier_dispatch_staging_smoke_test_enabled = self._parse_bool(
            os.getenv("COURIER_DISPATCH_STAGING_SMOKE_TEST_ENABLED", "false")
        )

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
        cloudinary_url = self._get_env_first("CLOUDINARY_URL")
        cloudinary_url_config = self._parse_cloudinary_url(cloudinary_url)
        self.cloudinary_url_present = bool(cloudinary_url)
        self.cloudinary_config_source = "CLOUDINARY_URL" if cloudinary_url_config else "split_env"
        self.cloudinary_cloud_name = self._get_env_first("CLOUDINARY_CLOUD_NAME") or cloudinary_url_config.get("cloud_name", "")
        self.cloudinary_api_key = self._get_env_first("CLOUDINARY_API_KEY") or cloudinary_url_config.get("api_key", "")
        self.cloudinary_api_secret = self._get_env_first("CLOUDINARY_API_SECRET") or cloudinary_url_config.get("api_secret", "")
        self.enable_face_ai = self._parse_bool(os.getenv("ENABLE_FACE_AI", "false"))
        self.verification_ocr_enabled = self._parse_bool(os.getenv("VERIFICATION_OCR_ENABLED", "false"))
        self.verification_ocr_provider = self._get_env_first("VERIFICATION_OCR_PROVIDER")
        self.verification_face_match_enabled = self._parse_bool(os.getenv("VERIFICATION_FACE_MATCH_ENABLED", "false"))
        self.verification_face_match_provider = self._get_env_first("VERIFICATION_FACE_MATCH_PROVIDER")
        self.verification_auto_approval_enabled = self._parse_bool(os.getenv("VERIFICATION_AUTO_APPROVAL_ENABLED", "false"))
        self.verification_duplicate_detection_enabled = self._parse_bool(os.getenv("VERIFICATION_DUPLICATE_DETECTION_ENABLED", "true"))
        self.verification_risk_scoring_enabled = self._parse_bool(os.getenv("VERIFICATION_RISK_SCORING_ENABLED", "true"))
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
    def _parse_float(value: str, default: float) -> float:
        try:
            parsed = float(value)
            return parsed if parsed > 0 else default
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _parse_nonnegative_float(value: str, default: float) -> float:
        try:
            parsed = float(value)
            return parsed if parsed >= 0 else default
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _get_env_first(*names: str) -> str:
        for name in names:
            value = os.getenv(name)
            if value and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _parse_cloudinary_url(value: str) -> dict[str, str]:
        if not value:
            return {}
        value = value.strip().strip("'\"")
        if value.startswith("CLOUDINARY_URL="):
            value = value.split("=", 1)[1].strip().strip("'\"")
        parsed = urlparse(value)
        if parsed.scheme != "cloudinary":
            return {}
        return {
            "cloud_name": parsed.hostname or "",
            "api_key": unquote(parsed.username or ""),
            "api_secret": unquote(parsed.password or ""),
        }

    @property
    def routing_configured(self) -> bool:
        return self.routing_provider == "google" and bool(self.google_maps_api_key)

    @property
    def courier_pricing_configured(self) -> bool:
        has_distance_or_time_rate = (
            self.courier_price_per_km_usd > 0 or self.courier_price_per_minute_usd > 0
        )
        return bool(
            self.courier_auto_pricing_enabled
            and self.courier_minimum_price_usd > 0
            and has_distance_or_time_rate
            and 0 < self.courier_payout_percent <= 100
        )

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
