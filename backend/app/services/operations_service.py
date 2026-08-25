from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

from pymongo.errors import DuplicateKeyError

from app.database import database
from app.services.courier_service import append_delivery_event
from app.services.courier_earnings_service import courier_earnings_summary
from app.services.courier_delivery_realtime_service import publish_delivery_realtime, update_versioned_delivery
from app.services.courier_offer_realtime_service import (
    list_offer_deliveries_for_courier,
    publish_courier_offer_transition,
)
from app.services.courier_state_service import (
    ACTIVE_COURIER_STATUSES,
    TERMINAL_COURIER_STATUSES,
    set_courier_active_reference,
)
from app.services.fulfillment_link_service import sync_food_order_from_delivery
from app.services.notification_service import create_app_notification
from app.services.workforce_service import available_courier_shifts
from app.utils import new_id, now_iso


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


async def list_availability(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = await database.find_many("work_availability", {"user_id": _user_id(user)})
    return sorted(items, key=lambda item: (str(item.get("date") or ""), str(item.get("start_time") or "")))


async def create_availability(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") == "driver" and payload.get("mode") != "ride":
        raise ValueError("Driver availability is only for passenger trips.")
    if user.get("role") == "courier" and payload.get("mode") != "courier":
        raise ValueError("Courier availability is only for delivery work.")
    if payload["start_time"] >= payload["end_time"]:
        raise ValueError("End time must be later than start time.")
    item = {
        "id": new_id(),
        "user_id": _user_id(user),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("work_availability", item)


async def delete_availability(item_id: str, user: Dict[str, Any]) -> bool:
    item = await database.find_one("work_availability", {"id": item_id})
    if not item:
        raise ValueError("Availability entry not found.")
    if not _is_admin(user) and item.get("user_id") != _user_id(user):
        raise PermissionError("You cannot delete another user's availability.")
    return await database.delete_one("work_availability", item_id)


async def get_courier_profile(user: Dict[str, Any]) -> Dict[str, Any] | None:
    return await database.find_one("courier_profiles", {"user_id": _user_id(user)})


async def create_courier_profile(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    existing = await get_courier_profile(user)
    if existing:
        return existing
    profile = {
        "id": new_id(),
        "user_id": _user_id(user),
        "name": user.get("name"),
        "status": "SUBMITTED",
        "online": False,
        "completed_deliveries": 0,
        "rating": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("courier_profiles", profile)


async def set_courier_online(user: Dict[str, Any], online: bool) -> Dict[str, Any]:
    profile = await get_courier_profile(user)
    if not profile:
        raise ValueError("Create your courier profile first.")
    if online and profile.get("status") != "APPROVED":
        raise PermissionError("Courier verification must be approved before going online.")
    now = now_iso()
    updates: Dict[str, Any] = {"online": online, "updated_at": now}
    if online and not profile.get("online"):
        updates["online_since"] = now
    elif not online and profile.get("online"):
        started_at = profile.get("online_since")
        if isinstance(started_at, str):
            try:
                started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                if started.tzinfo is None:
                    started = started.replace(tzinfo=timezone.utc)
                ended = datetime.now(timezone.utc)
                duration_seconds = max(0, int((ended - started.astimezone(timezone.utc)).total_seconds()))
                await database.insert_one(
                    "courier_online_sessions",
                    {
                        "id": new_id(),
                        "courier_user_id": _user_id(user),
                        "started_at": started.astimezone(timezone.utc).isoformat(),
                        "ended_at": ended.isoformat(),
                        "duration_seconds": duration_seconds,
                        "created_at": now,
                    },
                )
            except ValueError:
                pass
        updates["online_since"] = None
    updated = await database.update_one(
        "courier_profiles",
        profile["id"],
        updates,
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def approve_courier_profile(profile_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_admin(actor):
        raise PermissionError("Only an administrator can approve courier profiles.")
    profile = await database.find_one("courier_profiles", {"id": profile_id})
    if not profile:
        raise ValueError("Courier profile not found.")
    if profile.get("status") not in {"SUBMITTED", "UNDER_REVIEW", "APPROVED"}:
        raise ValueError("Courier application is not ready for approval.")
    updated = await database.update_one(
        "courier_profiles",
        profile_id,
        {"status": "APPROVED", "approved_at": now_iso(), "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def assigned_courier_deliveries(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return active work only. History must never hydrate the live workspace."""
    deliveries = await database.find_many(
        "courier_deliveries",
        {
            "courier_user_id": _user_id(user),
            "status": {"$in": sorted(ACTIVE_COURIER_STATUSES)},
        },
    )
    return sorted(deliveries, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


async def active_courier_delivery(user: Dict[str, Any]) -> Dict[str, Any] | None:
    deliveries = await assigned_courier_deliveries(user)
    active = deliveries[0] if deliveries else None
    profile = await get_courier_profile(user)
    if active:
        await set_courier_active_reference(active)
    elif profile and profile.get("active_delivery_id"):
        await database.update_one(
            "courier_profiles",
            profile["id"],
            {"active_delivery_id": None, "updated_at": now_iso()},
        )
    return active


async def courier_delivery_history(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    deliveries = await database.find_many(
        "courier_deliveries",
        {
            "courier_user_id": _user_id(user),
            "status": {"$in": sorted(TERMINAL_COURIER_STATUSES)},
        },
    )
    return sorted(deliveries, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


async def admin_courier_deliveries() -> List[Dict[str, Any]]:
    deliveries = await database.find_many("courier_deliveries")
    return sorted(deliveries, key=lambda item: str(item.get("created_at") or ""), reverse=True)


async def list_courier_offers(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    profile = await get_courier_profile(user)
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required to view delivery offers.")
    active = await active_courier_delivery(user)
    return await list_offer_deliveries_for_courier(
        user,
        profile=profile,
        has_active_delivery=bool(active),
    )


async def courier_workspace_snapshot(user: Dict[str, Any]) -> Dict[str, Any]:
    """Compose the current Courier read models into one authoritative opening snapshot."""
    profile = await get_courier_profile(user)
    active = await active_courier_delivery(user)
    if profile and profile.get("status") == "APPROVED":
        earnings, offers, shifts = await asyncio.gather(
            courier_earnings_summary(user),
            list_offer_deliveries_for_courier(
                user,
                profile=profile,
                has_active_delivery=bool(active),
            ),
            available_courier_shifts(user),
        )
    else:
        earnings = await courier_earnings_summary(user)
        offers = []
        shifts = []
    next_shift = next((shift for shift in shifts if shift.get("status") == "UPCOMING"), None)
    return {
        "profile": profile,
        "active_delivery": active,
        "earnings": earnings,
        "offers": offers,
        "next_shift": next_shift,
    }


async def claim_courier_offer(delivery_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "courier":
        raise PermissionError("A Courier account is required to accept delivery work.")

    profile = await get_courier_profile(user)
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required to accept delivery work.")
    if not profile.get("online"):
        raise PermissionError("Go online before accepting a delivery offer.")
    if await active_courier_delivery(user):
        raise ValueError("Finish your current delivery before accepting another offer.")

    delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
    if not delivery:
        raise ValueError("Delivery offer not found.")
    if delivery.get("sender_user_id") == _user_id(user):
        raise ValueError("You cannot claim your own delivery request.")
    if delivery.get("status") != "MATCHING" or delivery.get("quote_status") != "READY":
        raise ValueError("This delivery is not currently available for matching.")
    if delivery.get("courier_user_id"):
        raise ValueError("Another courier already accepted this delivery.")
    if not isinstance(delivery.get("price_usd"), (int, float)) or float(delivery.get("price_usd") or 0) <= 0:
        raise ValueError("Delivery pricing must be ready before a courier can accept it.")
    if not isinstance(delivery.get("courier_payout_usd"), (int, float)) or float(delivery.get("courier_payout_usd") or 0) <= 0:
        raise ValueError("Courier payout must be set before this offer can be accepted.")

    now = now_iso()
    try:
        updated = await update_versioned_delivery(
            {
                "id": delivery_id,
                "status": "MATCHING",
                "quote_status": "READY",
                "courier_user_id": None,
            },
            {
                "courier_user_id": _user_id(user),
                "courier_name": user.get("name") or profile.get("name") or "LetsGoRide Courier",
                "status": "COURIER_TO_PICKUP",
                "live_tracking_active": True,
                "assigned_at": now,
                "updated_at": now,
            },
        )
    except DuplicateKeyError as error:
        raise ValueError("Finish your current delivery before accepting another offer.") from error
    if not updated:
        raise ValueError("Another courier accepted this delivery first.")

    await publish_courier_offer_transition(delivery, updated)

    await append_delivery_event(
        delivery_id,
        "COURIER_CLAIMED_OFFER",
        actor_user_id=_user_id(user),
        data={
            "courier_user_id": _user_id(user),
            "assignment_method": "courier_claim",
            "courier_payout_usd": updated.get("courier_payout_usd"),
        },
    )
    await set_courier_active_reference(updated)
    status_event = await append_delivery_event(
        delivery_id,
        "STATUS_COURIER_TO_PICKUP",
        actor_user_id=_user_id(user),
        data={"source": "automatic_after_acceptance"},
    )
    await publish_delivery_realtime(updated, "courier_delivery.status_changed", journey_event=status_event)

    sender_user_id = str(updated.get("sender_user_id") or "")
    if sender_user_id:
        await create_app_notification(
            sender_user_id,
            "courier_update",
            "Courier is heading to pickup",
            f"{updated.get('courier_name') or 'Your courier'} accepted the delivery and is on the way to pickup.",
            {"delivery_id": delivery_id, "courier_status": "COURIER_TO_PICKUP"},
        )

    await sync_food_order_from_delivery(updated, actor_user_id=_user_id(user))
    return updated
