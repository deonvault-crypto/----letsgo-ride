from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.config import get_settings
from app.services.pricing_service import PricingNotConfiguredError, calculate_delivery_pricing
from app.services.routing_service import RoutingError, resolve_route


logger = logging.getLogger(__name__)

# Fixed staging-only probes. They intentionally avoid user/customer data.
STAGING_ROUTE_PROBES = [
    ("Harare CBD, Harare, Zimbabwe", "Borrowdale, Harare, Zimbabwe"),
    ("Harare CBD, Harare, Zimbabwe", "Chitungwiza, Zimbabwe"),
    ("Bulawayo CBD, Bulawayo, Zimbabwe", "Hillside, Bulawayo, Zimbabwe"),
]


async def run_staging_routing_smoke_test() -> Dict[str, Any]:
    settings = get_settings()
    app_env = str(settings.app_env or "development").strip().lower()

    if app_env != "staging":
        return {"status": "skipped", "reason": "not_staging", "routes": []}
    if not settings.routing_staging_smoke_test_enabled:
        return {"status": "skipped", "reason": "disabled", "routes": []}
    if not settings.routing_configured:
        logger.error("routing_smoke status=failed reason=provider_not_configured")
        return {"status": "failed", "reason": "provider_not_configured", "routes": []}

    results: List[Dict[str, Any]] = []
    failures = 0

    logger.info("routing_smoke status=started probes=%s", len(STAGING_ROUTE_PROBES))

    for origin_address, destination_address in STAGING_ROUTE_PROBES:
        try:
            route = await resolve_route(
                origin_address,
                destination_address,
                include_polyline=False,
            )
            entry: Dict[str, Any] = {
                "origin": route["origin_address"],
                "destination": route["destination_address"],
                "distance_km": route["distance_km"],
                "estimated_duration_minutes": route["estimated_duration_minutes"],
                "provider": route["provider"],
            }

            try:
                pricing = calculate_delivery_pricing(
                    distance_km=route["distance_km"],
                    estimated_duration_minutes=route["estimated_duration_minutes"],
                )
                entry["pricing"] = {
                    "price_usd": pricing["price_usd"],
                    "courier_payout_usd": pricing["courier_payout_usd"],
                    "platform_fee_usd": pricing["platform_fee_usd"],
                }
            except PricingNotConfiguredError:
                entry["pricing"] = None

            results.append(entry)
            logger.info(
                "routing_smoke status=passed origin=%r destination=%r distance_km=%s eta_minutes=%s pricing=%s",
                origin_address,
                destination_address,
                entry["distance_km"],
                entry["estimated_duration_minutes"],
                entry["pricing"],
            )
        except RoutingError as exc:
            failures += 1
            results.append(
                {
                    "origin": origin_address,
                    "destination": destination_address,
                    "error": type(exc).__name__,
                }
            )
            logger.error(
                "routing_smoke status=failed origin=%r destination=%r error=%s",
                origin_address,
                destination_address,
                type(exc).__name__,
            )

    status = "passed" if failures == 0 else "failed"
    logger.info(
        "routing_smoke status=%s passed=%s failed=%s",
        status,
        len(STAGING_ROUTE_PROBES) - failures,
        failures,
    )
    return {"status": status, "routes": results}
