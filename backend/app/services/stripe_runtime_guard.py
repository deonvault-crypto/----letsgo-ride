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


def _validate_local_config(settings: Any) -> None:
    if not settings.stripe_configured:
        return
    if not settings.is_production:
        return
    expected_account_id = str(settings.stripe_account_id or "").strip()
    if not expected_account_id.startswith("acct_"):
        raise RuntimeError("Production Stripe account identity is not configured.")
    if str(settings.stripe_currency or "").strip().lower() != "usd":
        raise RuntimeError("Production Stripe currency must be USD.")


async def ensure_stripe_runtime_binding() -> str | None:
    """Fail closed when production Stripe credentials do not belong to the approved account.

    The result is cached for the lifetime of the process because Render environment
    variables are immutable inside a running process. A new secret therefore always
    requires a restart and a fresh account-identity check.
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
            raise RuntimeError("Stripe account verification is temporarily unavailable.") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError("Stripe account verification returned an invalid response.") from exc

        if response.status_code >= 400:
            error = payload.get("error") if isinstance(payload, dict) else None
            logger.error(
                "stripe_account_verification_failed status=%s type=%s",
                response.status_code,
                str((error or {}).get("type") or "unknown")[:80],
            )
            raise RuntimeError("Stripe account verification failed.")

        actual_account_id = str(payload.get("id") or "") if isinstance(payload, dict) else ""
        if actual_account_id != expected_account_id:
            logger.critical(
                "stripe_account_mismatch expected=%s actual=%s",
                expected_account_id,
                actual_account_id or "missing",
            )
            raise RuntimeError("Configured Stripe secret does not belong to the approved LetsGoRide account.")

        if settings.is_production and payload.get("charges_enabled") is not True:
            raise RuntimeError("LetsGoRide production Stripe charges are not enabled.")

        _verified_account_id = actual_account_id
        logger.info("stripe_account_verified account_id=%s currency=%s", actual_account_id, str(settings.stripe_currency).lower())
        return actual_account_id


def reset_stripe_runtime_guard_for_tests() -> None:
    global _verified_account_id
    _verified_account_id = None
