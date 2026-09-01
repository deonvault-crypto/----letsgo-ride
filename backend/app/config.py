from functools import lru_cache
import os
from typing import List
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_env = os.getenv("APP_ENV", "development").strip().lower() or "development"
        if self.app_env not in {"development", "test", "production"}:
            raise RuntimeError("Unsupported APP_ENV. Use development, test, or production.")
        self.mongodb_uri = os.getenv("MONGODB_URI", "").strip()
        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "letsgoride").strip() or "letsgoride"
        if self.is_production and self.mongodb_db_name != "letsgoride":
            raise RuntimeError("Production MONGODB_DB_NAME must be exactly letsgoride.")
        self.admin_seed_email = os.getenv("ADMIN_SEED_EMAIL", "").strip()
        self.admin_seed_password = os.getenv("ADMIN_SEED_PASSWORD", "")
        self.admin_auto_create = self._parse_bool(os.getenv("ADMIN_AUTO_CREATE", "false"))
        if self.is_production and self.admin_auto_create:
            raise RuntimeError("ADMIN_AUTO_CREATE is forbidden in production.")
        configured_public_api_base_url = self._get_env_first("PUBLIC_API_BASE_URL", "API_PUBLIC_BASE_URL")
        if self.is_production and not configured_public_api_base_url:
            raise RuntimeError("Production PUBLIC_API_BASE_URL must be explicitly configured.")
        self.public_api_base_url = configured_public_api_base_url or "https://letsgoride-backend.onrender.com"
        self.public_site_base_url = self._get_env_first("PUBLIC_SITE_BASE_URL") or "https://letsgoride.site"
        self.payout_data_encryption_key = self._get_env_first("PAYOUT_DATA_ENCRYPTION_KEY")
        self.realtime_redis_url = self._get_env_first("REALTIME_REDIS_URL", "REDIS_URL")
        self.rate_limit_redis_url = self._get_env_first("RATE_LIMIT_REDIS_URL", "REALTIME_REDIS_URL", "REDIS_URL")
        self.session_lifetime_days = max(1, int(os.getenv("SESSION_LIFETIME_DAYS", "30")))
        self.realtime_channel = os.getenv("REALTIME_CHANNEL", "letsgoride:realtime:v1").strip() or "letsgoride:realtime:v1"
        raw_hailing_enabled = os.getenv("HAILING_ENABLED")
        self.hailing_enabled = (
            self._parse_bool(raw_hailing_enabled)
            if raw_hailing_enabled is not None
            else self.app_env.strip().lower() in {"development", "test"}
        )

        # Stripe card payments are fail-closed. Production requires live-mode keys.
        # Publishable keys are safe to return to authenticated mobile clients; secret
        # and webhook keys never leave the backend.
        self.stripe_enabled = self._parse_bool(os.getenv("STRIPE_ENABLED", "false"))
        self.stripe_account_id = self._get_env_first("STRIPE_ACCOUNT_ID")
        self.stripe_secret_key = self._get_env_first("STRIPE_SECRET_KEY")
        self.stripe_publishable_key = self._get_env_first("STRIPE_PUBLISHABLE_KEY")
        self.stripe_webhook_secret = self._get_env_first("STRIPE_WEBHOOK_SECRET")
        self.stripe_currency = (os.getenv("STRIPE_CURRENCY", "usd").strip().lower() or "usd")
        self.stripe_timeout_seconds = self._parse_float(os.getenv("STRIPE_TIMEOUT_SECONDS", "10"), 10.0)
        # Stripe is used for driver weekly settlements in the Zimbabwe launch model.
        # Passenger card rides stay fail-closed until deliberately enabled later.
        self.passenger_card_payments_enabled = self._parse_bool(os.getenv("PASSENGER_CARD_PAYMENTS_ENABLED", "false"))
        self.driver_settlement_grace_hours = max(1, int(os.getenv("DRIVER_SETTLEMENT_GRACE_HOURS", "48")))
        self.driver_settlement_sweep_seconds = max(300, int(os.getenv("DRIVER_SETTLEMENT_SWEEP_SECONDS", "900")))
        if self.stripe_enabled:
            self._validate_stripe_environment()

        self.routing_provider = os.getenv("ROUTING_PROVIDER", "disabled").strip().lower()
        self.google_maps_api_key = self._get_env_first("GOOGLE_MAPS_API_KEY")
        self.routing_region_code = os.getenv("ROUTING_REGION_CODE", "ZW").strip().upper() or "ZW"
        self.routing_timeout_seconds = self._parse_float(os.getenv("ROUTING_TIMEOUT_SECONDS", "8"), 8.0)

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
        self.cloudinary_configured = bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)
        if self.is_production and not self.cloudinary_configured:
            raise RuntimeError("Production Cloudinary storage credentials must be configured.")
        self.enable_face_ai = self._parse_bool(os.getenv("ENABLE_FACE_AI", "false"))
        self.verification_ocr_enabled = self._parse_bool(os.getenv("VERIFICATION_OCR_ENABLED", "false"))
        self.verification_ocr_provider = self._get_env_first("VERIFICATION_OCR_PROVIDER")
        self.verification_face_match_enabled = self._parse_bool(os.getenv("VERIFICATION_FACE_MATCH_ENABLED", "false"))
        self.verification_face_match_provider = self._get_env_first("VERIFICATION_FACE_MATCH_PROVIDER")
        self.verification_auto_approval_enabled = self._parse_bool(os.getenv("VERIFICATION_AUTO_APPROVAL_ENABLED", "false"))
        self.verification_duplicate_detection_enabled = self._parse_bool(os.getenv("VERIFICATION_DUPLICATE_DETECTION_ENABLED", "true"))
        self.verification_risk_scoring_enabled = self._parse_bool(os.getenv("VERIFICATION_RISK_SCORING_ENABLED", "true"))
        raw_cors_origins = os.getenv("CORS_ORIGINS", "")
        self.cors_origins_configured = bool(raw_cors_origins.strip())
        self.cors_origins = self._parse_origins(
            raw_cors_origins or "http://localhost:8082,http://localhost:19006"
        )
        if self.is_production and (not self.cors_origins_configured or not self.cors_origins or "*" in self.cors_origins):
            raise RuntimeError("Production CORS_ORIGINS must contain explicit trusted origins.")

    def _validate_stripe_environment(self) -> None:
        required = {
            "STRIPE_SECRET_KEY": self.stripe_secret_key,
            "STRIPE_PUBLISHABLE_KEY": self.stripe_publishable_key,
            "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Stripe payments are enabled but missing: {', '.join(missing)}")
        app_env = self.app_env.strip().lower()
        if app_env == "production":
            if not self.stripe_secret_key.startswith("sk_live_") or not self.stripe_publishable_key.startswith("pk_live_"):
                raise RuntimeError("Production Stripe payments require live-mode keys.")
        elif app_env in {"development", "test"}:
            if not self.stripe_secret_key.startswith("sk_test_") or not self.stripe_publishable_key.startswith("pk_test_"):
                raise RuntimeError("Non-production Stripe checks require test-mode keys.")
        if not self.stripe_webhook_secret.startswith("whsec_"):
            raise RuntimeError("STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.")

    @staticmethod
    def _parse_origins(value: str) -> List[str]:
        return [origin.strip() for origin in value.split(",") if origin.strip()]

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
    def stripe_configured(self) -> bool:
        return bool(
            self.stripe_enabled
            and self.stripe_secret_key
            and self.stripe_publishable_key
            and self.stripe_webhook_secret
        )

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


    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
