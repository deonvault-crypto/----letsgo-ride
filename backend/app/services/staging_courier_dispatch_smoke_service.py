from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.config import get_settings
from app.database import database
from app.services.courier_service import (
    create_delivery,
    list_delivery_events,
    tracking_state,
    update_courier_location,
    update_delivery_status,
)
from app.services.delivery_quote_service import maybe_auto_quote_delivery
from app.services.operations_service import (
    approve_courier_profile,
    assigned_courier_deliveries,
    claim_courier_offer,
    create_courier_profile,
    list_courier_offers,
    set_courier_online,
)
from app.utils import new_id


logger = logging.getLogger(__name__)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def _cleanup(delivery_id: str | None, profile_id: str | None) -> None:
    """Remove only records created by this smoke run."""
    if delivery_id:
        for collection in ("courier_events", "courier_location_snapshots"):
            rows = await database.find_many(collection, {"delivery_id": delivery_id})
            for row in rows:
                item_id = str(row.get("id") or "")
                if item_id:
                    await database.delete_one(collection, item_id)
        await database.delete_one("courier_deliveries", delivery_id)
    if profile_id:
        await database.delete_one("courier_profiles", profile_id)


async def run_staging_courier_dispatch_smoke_test() -> Dict[str, Any]:
    settings = get_settings()
    app_env = str(settings.app_env or "development").strip().lower()

    logger.warning(
        "courier_dispatch_smoke gate app_env=%s enabled=%s routing_configured=%s pricing_configured=%s",
        app_env,
        settings.courier_dispatch_staging_smoke_test_enabled,
        settings.routing_configured,
        settings.courier_pricing_configured,
    )

    if app_env != "staging":
        logger.warning("courier_dispatch_smoke status=skipped reason=not_staging")
        return {"status": "skipped", "reason": "not_staging"}
    if not settings.courier_dispatch_staging_smoke_test_enabled:
        logger.warning("courier_dispatch_smoke status=skipped reason=disabled")
        return {"status": "skipped", "reason": "disabled"}
    if not settings.routing_configured:
        logger.warning("courier_dispatch_smoke status=failed reason=routing_not_configured")
        return {"status": "failed", "reason": "routing_not_configured"}
    if not settings.courier_pricing_configured:
        logger.warning("courier_dispatch_smoke status=failed reason=pricing_not_configured")
        return {"status": "failed", "reason": "pricing_not_configured"}

    run_id = new_id()
    sender = {
        "id": f"staging-smoke-sender-{run_id}",
        "name": "Staging Smoke Sender",
        "phone": "+263000000001",
        "role": "passenger",
    }
    courier = {
        "id": f"staging-smoke-courier-{run_id}",
        "name": "Staging Smoke Courier",
        "phone": "+263000000002",
        "role": "passenger",
    }
    admin = {
        "id": f"staging-smoke-admin-{run_id}",
        "name": "Staging Smoke Admin",
        "role": "admin",
    }

    delivery_id: str | None = None
    profile_id: str | None = None
    checkpoints: List[str] = []

    logger.warning("courier_dispatch_smoke status=started")

    try:
        profile = await create_courier_profile(
            {"transport_mode": "motorbike", "vehicle_description": "staging smoke vehicle"},
            courier,
        )
        profile_id = str(profile["id"])
        _assert(profile.get("status") == "PENDING_REVIEW", "courier profile must start pending")
        checkpoints.append("profile_created_pending")

        try:
            await set_courier_online(courier, True)
            raise AssertionError("unapproved courier was allowed online")
        except PermissionError:
            checkpoints.append("verification_gate_enforced")

        approved = await approve_courier_profile(profile_id, admin)
        _assert(approved.get("status") == "APPROVED", "courier approval failed")
        checkpoints.append("profile_approved")

        offline_offers = await list_courier_offers(courier)
        _assert(offline_offers == [], "offline courier should not receive offers")
        checkpoints.append("offline_offer_gate_enforced")

        online_profile = await set_courier_online(courier, True)
        _assert(online_profile.get("online") is True, "courier did not go online")
        checkpoints.append("courier_online")

        created = await create_delivery(
            {
                "pickup_address": "Harare CBD, Harare, Zimbabwe",
                "dropoff_address": "Borrowdale, Harare, Zimbabwe",
                "pickup_location": None,
                "dropoff_location": None,
                "recipient_name": "Staging Recipient",
                "recipient_phone": "+263000000003",
                "package_type": "parcel",
                "package_description": "Synthetic staging dispatch validation parcel",
                "weight_kg": 1.0,
                "declared_value_usd": 10.0,
                "pickup_note": "staging smoke test",
                "dropoff_note": "staging smoke test",
            },
            sender,
        )
        delivery_id = str(created["id"])
        _assert(created.get("status") == "REQUESTED", "delivery must start requested")
        _assert(created.get("quote_status") == "PENDING", "delivery quote must start pending")
        checkpoints.append("delivery_requested")

        quoted = await maybe_auto_quote_delivery(delivery_id, actor_user_id=str(sender["id"]))
        _assert(quoted.get("status") == "MATCHING", "auto-quoted delivery must enter matching")
        _assert(quoted.get("quote_status") == "READY", "auto quote was not ready")
        _assert(float(quoted.get("price_usd") or 0) > 0, "customer price missing")
        _assert(float(quoted.get("courier_payout_usd") or 0) > 0, "courier payout missing")
        _assert(float(quoted.get("distance_km") or 0) > 0, "distance missing")
        _assert(int(quoted.get("estimated_duration_minutes") or 0) > 0, "eta missing")
        checkpoints.append("auto_quote_ready")

        offers = await list_courier_offers(courier)
        _assert(any(item.get("id") == delivery_id for item in offers), "matching offer not visible to courier")
        checkpoints.append("offer_visible")

        assigned = await claim_courier_offer(delivery_id, courier)
        _assert(assigned.get("status") == "ASSIGNED", "claim did not assign delivery")
        _assert(assigned.get("courier_user_id") == courier["id"], "wrong courier assigned")
        _assert(assigned.get("live_tracking_active") is True, "tracking must activate on assignment")
        checkpoints.append("offer_claimed_assigned")

        remaining_offers = await list_courier_offers(courier)
        _assert(not any(item.get("id") == delivery_id for item in remaining_offers), "claimed offer still visible")
        checkpoints.append("claimed_offer_removed")

        assigned_jobs = await assigned_courier_deliveries(courier)
        _assert(any(item.get("id") == delivery_id for item in assigned_jobs), "assigned job missing from courier work list")
        checkpoints.append("assigned_job_visible")

        try:
            await update_delivery_status(delivery_id, "COURIER_TO_PICKUP", sender)
            raise AssertionError("sender was allowed to operate courier status")
        except PermissionError:
            checkpoints.append("status_permission_enforced")

        await update_courier_location(
            delivery_id,
            {
                "latitude": -17.8292,
                "longitude": 31.0522,
                "accuracy": 8.0,
                "heading": 20.0,
                "speed": 5.0,
            },
            courier,
        )
        tracked = await tracking_state(delivery_id, sender)
        _assert(tracked.get("live_tracking_active") is True, "sender tracking not active")
        _assert(bool(tracked.get("last_courier_location")), "courier location not visible in tracking state")
        checkpoints.append("live_tracking_visible")

        for status in ("COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING", "DELIVERED"):
            updated = await update_delivery_status(delivery_id, status, courier, note="staging smoke transition")
            _assert(updated.get("status") == status, f"failed transition to {status}")
            checkpoints.append(f"status_{status.lower()}")

        delivered_tracking = await tracking_state(delivery_id, sender)
        _assert(delivered_tracking.get("status") == "DELIVERED", "delivery did not finish delivered")
        _assert(delivered_tracking.get("live_tracking_active") is False, "tracking remained active after delivery")
        checkpoints.append("tracking_closed_on_delivery")

        events = await list_delivery_events(delivery_id, sender)
        event_types = [str(item.get("type") or "") for item in events]
        required_events = {
            "DELIVERY_REQUESTED",
            "DELIVERY_AUTO_QUOTED",
            "COURIER_CLAIMED_OFFER",
            "STATUS_COURIER_TO_PICKUP",
            "STATUS_PICKED_UP",
            "STATUS_IN_TRANSIT",
            "STATUS_ARRIVING",
            "STATUS_DELIVERED",
        }
        _assert(required_events.issubset(set(event_types)), "expected lifecycle events are missing")
        checkpoints.append("event_audit_complete")

        logger.warning(
            "courier_dispatch_smoke status=passed checkpoints=%s distance_km=%s eta_minutes=%s price_usd=%s payout_usd=%s events=%s",
            len(checkpoints),
            quoted.get("distance_km"),
            quoted.get("estimated_duration_minutes"),
            quoted.get("price_usd"),
            quoted.get("courier_payout_usd"),
            len(events),
        )
        return {
            "status": "passed",
            "checkpoints": checkpoints,
            "distance_km": quoted.get("distance_km"),
            "estimated_duration_minutes": quoted.get("estimated_duration_minutes"),
            "price_usd": quoted.get("price_usd"),
            "courier_payout_usd": quoted.get("courier_payout_usd"),
            "event_count": len(events),
        }
    except Exception as exc:
        logger.exception(
            "courier_dispatch_smoke status=failed checkpoint_count=%s error=%s",
            len(checkpoints),
            type(exc).__name__,
        )
        return {
            "status": "failed",
            "checkpoints": checkpoints,
            "error": type(exc).__name__,
        }
    finally:
        await _cleanup(delivery_id, profile_id)
        logger.warning("courier_dispatch_smoke cleanup=complete")
