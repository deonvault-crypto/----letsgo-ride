from __future__ import annotations

from typing import Any, Dict

from app.config import get_settings


class PricingNotConfiguredError(RuntimeError):
    pass


class PricingInputError(ValueError):
    pass


def pricing_status() -> Dict[str, Any]:
    settings = get_settings()
    return {
        "enabled": settings.courier_auto_pricing_enabled,
        "configured": settings.courier_pricing_configured,
        "currency": "USD",
    }


def calculate_delivery_pricing(
    *,
    distance_km: float,
    estimated_duration_minutes: int,
) -> Dict[str, Any]:
    settings = get_settings()
    if not settings.courier_pricing_configured:
        raise PricingNotConfiguredError("Automatic courier pricing is not configured.")
    if distance_km < 0:
        raise PricingInputError("Distance cannot be negative.")
    if estimated_duration_minutes < 0:
        raise PricingInputError("Duration cannot be negative.")

    calculated = (
        settings.courier_base_price_usd
        + (distance_km * settings.courier_price_per_km_usd)
        + (estimated_duration_minutes * settings.courier_price_per_minute_usd)
    )
    customer_price = round(max(settings.courier_minimum_price_usd, calculated), 2)
    courier_payout = round(customer_price * (settings.courier_payout_percent / 100.0), 2)
    platform_fee = round(customer_price - courier_payout, 2)

    return {
        "currency": "USD",
        "price_usd": customer_price,
        "courier_payout_usd": courier_payout,
        "platform_fee_usd": platform_fee,
        "distance_km": round(float(distance_km), 3),
        "estimated_duration_minutes": int(estimated_duration_minutes),
        "pricing_source": "AUTOMATIC_POLICY",
    }
