from pathlib import Path

import pytest

from app.config import Settings


RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "app"


def _base_production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("MONGODB_URI", "mongodb://example.invalid")
    monkeypatch.setenv("MONGODB_DB_NAME", "letsgoride")
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://letsgoride-v2-production.onrender.com")
    monkeypatch.setenv("CORS_ORIGINS", "https://letsgoride.site")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "cloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)


def test_nonproduction_release_environment_is_rejected(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(RuntimeError, match="Unsupported APP_ENV"):
        Settings()


def test_production_rejects_nonproduction_database(monkeypatch):
    _base_production_env(monkeypatch)
    monkeypatch.setenv("MONGODB_DB_NAME", "letsgoride_staging")
    with pytest.raises(RuntimeError, match="MONGODB_DB_NAME"):
        Settings()


def test_production_requires_durable_profile_storage(monkeypatch):
    _base_production_env(monkeypatch)
    monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
    monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
    monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="Cloudinary"):
        Settings()


def test_runtime_has_no_retired_demo_staging_or_mock_switches():
    source = "\n".join(path.read_text(encoding="utf-8") for path in RUNTIME_ROOT.rglob("*.py"))
    for forbidden in (
        "STAGING_EXTERNAL_TEST_CITY_ID",
        "_staging_external_service_area",
        "LEGACY_DEMO_RIDE_SIGNATURES",
        "cleanup_demo_rides",
        "mock_otp_allowed",
        "MOCK_OTP",
        '"is_demo"',
    ):
        assert forbidden not in source
