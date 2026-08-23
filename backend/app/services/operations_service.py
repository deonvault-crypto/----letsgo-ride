from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.courier_service import append_delivery_event
from app.services.fulfillment_link_service import sync_food_order_from_delivery
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


async def list_availability(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = await database.find_many("work_availability", {"user_id": _user_id(user)})
    return sorted(items, key=lambda item: (str(item.get("date") or ""), str(item.get("start_time") or "")))


async def create_availability(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
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
        "status": "PENDING_REVIEW",
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
    updated = await database.update_one(
        "courier_profiles",
        profile["id"],
        {"online": online, "updated_at": now_iso()},
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
    updated = await database.update_one(
        "courier_profiles",
        profile_id,
        {"status": "APPROVED", "approved_at": now_iso(), "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def assigned_courier_deliveries(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    deliveries = await database.find_many("courier_deliveries", {"courier_user_id": _user_id(user)})
    return sorted(deliveries, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


async def list_courier_offers(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    profile = await get_courier_profile(user)
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required to view delivery offers.")
    if not profile.get("online"):
        return []

    offers = await database.find_many(
        "courier_deliveries",
        {"status": "MATCHING", "courier_user_id": None, "quote_status": "READY"},
    )
    user_id = _user_id(user)
    eligible = [
        delivery
        for delivery in offers
        if delivery.get("sender_user_id") != user_id
        and isinstance(delivery.get("price_usd"), (int, float))
        and float(delivery.get("price_usd") or 0) > 0
        and isinstance(delivery.get("courier_payout_usd"), (int, float))
        and float(delivery.get("courier_payout_usd") or 0) > 0
    ]
    return sorted(eligible, key=lambda item: str(item.get("created_at") or ""))


async def claim_courier_offer(delivery_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "courier":
        raise PermissionError("A Courier account is required to accept delivery work.")

    profile = await get_courier_profile(user)
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required to accept delivery work.")
    if not profile.get("online"):
        raise PermissionError("Go online before accepting a delivery offer.")

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
    updated = await database.update_one_if(
        "courier_deliveries",
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
    if not updated:
        raise ValueError("Another courier accepted this delivery first.")

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
    await append_delivery_event(
        delivery_id,
        "STATUS_COURIER_TO_PICKUP",
        actor_user_id=_user_id(user),
        data={"source": "automatic_after_acceptance"},
    )

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
