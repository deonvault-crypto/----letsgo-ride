from __future__ import annotations

import asyncio
import logging
from typing import Any

import requests

from app.config import get_settings


logger = logging.getLogger(__name__)
STRIPE_ACCOUNT_URL = "https://api.stripe.com/v1/account"
_verified_account_id: str | None = None
_verify_lock = asyncio.Lock()


class StripeRuntimeError(RuntimeError):
    pass


class StripeAccountConfigurationError(StripeRuntimeError):
    """Unsafe permanent configuration: core production must refuse to start."""


class StripeVerificationUnavailable(StripeRuntimeError):
    """Temporary provider/network degradation: money paths close, core app stays alive."""


def _validate_local_config(settings: Any) -> None:
    if not settings.stripe_configured:
        return
    if not settings.is_production:
        return
    expected_account_id = str(settings.stripe_account_id or "").strip()
    if not expected_account_id.startswith("acct_"):
        raise StripeAccountConfigurationError("Production Stripe account identity is not configured.")
    if str(settings.stripe_currency or "").strip().lower() != "usd":
        raise StripeAccountConfigurationError("Production Stripe currency must be USD.")


def stripe_runtime_ready() -> bool:
    settings = get_settings()
    if not settings.stripe_configured:
        return True
    if not settings.is_production:
        return True
    expected_account_id = str(settings.stripe_account_id or "").strip()
    return bool(expected_account_id and _verified_account_id == expected_account_id)


async def ensure_stripe_runtime_binding() -> str | None:
    """Prove the production live secret belongs to the approved LetsGoRide account.

    Unsafe identity/config mismatches are permanent startup errors. A temporary
    Stripe/network outage only disables payment operations until verification can
    succeed; it must not take cash rides, Courier, Admin, or the whole API offline.
    """

    global _verified_account_id
    settings = get_settings()
    _validate_local_config(settings)
    if not settings.stripe_configured:
        return None

    expected_account_id = str(settings.stripe_account_id or "").strip()
    if not expected_account_id:
        # Non-production environments may intentionally omit an account pin.
        return None
    if _verified_account_id == expected_account_id:
        return _verified_account_id

    async with _verify_lock:
        if _verified_account_id == expected_account_id:
            return _verified_account_id

        timeout = min(max(float(settings.stripe_timeout_seconds or 5), 1.0), 5.0)

        def fetch_account():
            return requests.get(
                STRIPE_ACCOUNT_URL,
                headers={"Authorization": f"Bearer {settings.stripe_secret_key}"},
                timeout=timeout,
            )

        try:
            response = await asyncio.to_thread(fetch_account)
        except requests.RequestException as exc:
            logger.error("stripe_account_verification_unavailable error_type=%s", exc.__class__.__name__)
            raise StripeVerificationUnavailable("Stripe account verification is temporarily unavailable.") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise StripeVerificationUnavailable("Stripe account verification returned an invalid response.") from exc

        if response.status_code >= 500:
            logger.error("stripe_account_verification_provider_error status=%s", response.status_code)
            raise StripeVerificationUnavailable("Stripe account verification is temporarily unavailable.")

        if response.status_code >= 400:
            error = payload.get("error") if isinstance(payload, dict) else None
            logger.critical(
                "stripe_account_verification_rejected status=%s type=%s",
                response.status_code,
                str((error or {}).get("type") or "unknown")[:80],
            )
            raise StripeAccountConfigurationError("Stripe rejected the configured production credentials.")

        actual_account_id = str(payload.get("id") or "") if isinstance(payload, dict) else ""
        if actual_account_id != expected_account_id:
            logger.critical(
                "stripe_account_mismatch expected=%s actual=%s",
                expected_account_id,
                actual_account_id or "missing",
            )
            raise StripeAccountConfigurationError("Configured Stripe secret does not belong to the approved LetsGoRide account.")

        if settings.is_production and payload.get("charges_enabled") is not True:
            raise StripeAccountConfigurationError("LetsGoRide production Stripe charges are not enabled.")

        _verified_account_id = actual_account_id
        logger.info("stripe_account_verified account_id=%s currency=%s", actual_account_id, str(settings.stripe_currency).lower())
        return actual_account_id


def reset_stripe_runtime_guard_for_tests() -> None:
    global _verified_account_id
    _verified_account_id = None
